import { prepare, writeArtifact } from './recent-total-evaluation.mjs';
const [contexts, oldPath, correctedPath, statsPath, out] = process.argv.slice(2);
if (!out)
  throw new Error(
    'Usage: <contexts> <old-signals> <corrected-signals> <drive-stats> <diagnosis-out>',
  );
const e = await prepare(contexts, oldPath, correctedPath, statsPath),
  totals = e.parentAudit.results[e.parent.primary].rows.filter((r) => r.kind === 'total');
function diagnostics(rs) {
  const n = rs.length,
    mean = (f) => rs.reduce((s, r) => s + f(r), 0) / Math.max(1, n);
  return {
    n,
    finalExcessBrier: mean((r) => (r.p - r.y) ** 2 - (r.book - r.y) ** 2),
    rawExcessBrier: mean((r) => (r.unadapted - r.y) ** 2 - (r.book - r.y) ** 2),
    finalVarianceCost: mean((r) => (r.p - r.book) ** 2),
    finalAlignmentGain: mean((r) => 2 * (r.p - r.book) * (r.y - r.book)),
    rawVarianceCost: mean((r) => (r.unadapted - r.book) ** 2),
    rawAlignmentGain: mean((r) => 2 * (r.unadapted - r.book) * (r.y - r.book)),
    meanFeedbackWeight: mean((r) => r.reliabilityWeight),
    overCorrections: rs.filter((r) => r.unadapted > r.book).length,
    underCorrections: rs.filter((r) => r.unadapted < r.book).length,
    bookFallback: rs.filter((r) => r.p === r.book).length,
    outcomeRate: mean((r) => r.y),
  };
}
const weekly = [];
for (const [season, week] of [
  ...new Set(totals.filter((r) => r.season >= 2025).map((r) => `${r.season}:${r.week}`)),
].map((k) => k.split(':').map(Number))) {
  const rs = totals.filter((r) => r.season === season && r.week === week),
    origin = e.rawById.get(rs[0].id).game;
  const history = e.rawRows.filter(
    (r) =>
      e.source.weight(origin, r.game) > 0 &&
      r.supported &&
      Math.abs(r.rawProbability - r.book) > 1e-12,
  );
  const contributions = ['current', 'prior'].map((type) => {
    const filtered = history.filter((r) => (r.game.season === season) === (type === 'current'));
    let linear = 0,
      quadratic = 0,
      effectiveGames = 0;
    for (const r of filtered) {
      const w = e.source.weight(origin, r.game),
        d = r.rawProbability - r.book;
      linear += w * d * (r.y - r.book);
      quadratic += w * d * d;
      effectiveGames += w;
    }
    return { type, games: filtered.length, effectiveGames, linear, quadratic };
  });
  weekly.push({ season, week, ...diagnostics(rs), feedbackContributions: contributions });
}
const late = totals.filter((r) => r.season === 2025 && r.week >= 9),
  lossWeeks = weekly.filter((r) => r.season === 2025 && [11, 12, 17].includes(r.week));
await writeArtifact(out, {
  generatedAt: new Date().toISOString(),
  parentPrimary: e.parent.primary,
  late2025: diagnostics(late),
  losingWeeks: lossWeeks,
  losingWeekShareOfLateNetLoss:
    lossWeeks.reduce((s, r) => s + r.finalExcessBrier * r.n, 0) /
    late.reduce((s, r) => s + (r.p - r.y) ** 2 - (r.book - r.y) ** 2, 0),
  weekly,
  interpretation:
    'Exact parent reproduction. Descriptive allocation and timing, not causal identification. New adaptation variants are diagnosis-informed reused research; source probabilities remain frozen.',
});
console.log(
  JSON.stringify(
    {
      late2025: diagnostics(late),
      lossWeeks: lossWeeks.map((r) => ({
        week: r.week,
        excess: r.finalExcessBrier,
        weight: r.meanFeedbackWeight,
        contributions: r.feedbackContributions,
      })),
    },
    null,
    2,
  ),
);
