import { prepare, writeArtifact } from './stable-total-evaluation.mjs';
const [contexts, oldPath, correctedPath, statsPath, out] = process.argv.slice(2);
if (!out) throw Error('Usage: <contexts> <old-signals> <corrected-signals> <drive-stats> <output>');
const e = await prepare(contexts, oldPath, correctedPath, statsPath),
  totals = e.parentAudit.results[e.parent.primary].rows.filter((r) => r.kind === 'total');
function diag(rs) {
  const n = rs.length,
    mean = (f) => rs.reduce((s, r) => s + f(r), 0) / Math.max(1, n);
  return {
    n,
    excessBrier: mean((r) => (r.p - r.y) ** 2 - (r.book - r.y) ** 2),
    rawExcessBrier: mean((r) => (r.unadapted - r.y) ** 2 - (r.book - r.y) ** 2),
    alignmentGain: mean((r) => 2 * (r.p - r.book) * (r.y - r.book)),
    varianceCost: mean((r) => (r.p - r.book) ** 2),
    meanWeight: mean((r) => r.reliabilityWeight),
    over: rs.filter((r) => r.unadapted > r.book).length,
    under: rs.filter((r) => r.unadapted < r.book).length,
    changed: rs.filter((r) => r.p !== r.book).length,
  };
}
const seasons = [2023, 2024].map((season) => ({
    season,
    ...diag(totals.filter((r) => r.season === season)),
  })),
  weekly = [];
for (const season of [2023, 2024])
  for (let week = 1; week <= 18; week++) {
    const rs = totals.filter((r) => r.season === season && r.week === week),
      origin = e.rawById.get(rs[0].id),
      feedback = e.legacy.forecast(
        origin.game,
        origin.book,
        origin.rawProbability,
        origin.supported,
      ).reliability,
      groups = new Map();
    for (const r of feedback.contributions) {
      const g = groups.get(r.week) ?? { games: 0, linear: 0, quadratic: 0, effectiveGames: 0 };
      g.games++;
      g.linear += r.linear;
      g.quadratic += r.quadratic;
      g.effectiveGames += r.weight;
      groups.set(r.week, g);
    }
    const omit = [...groups].map(([week, g]) => ({
      week,
      linear: feedback.linear - g.linear,
      quadratic: feedback.quadratic - g.quadratic,
      weight: Math.max(
        0,
        Math.min(0.5, (feedback.linear - g.linear) / (feedback.quadratic - g.quadratic + 0.02)),
      ),
    }));
    weekly.push({
      season,
      week,
      ...diag(rs),
      priorWeeks: [...groups].map(([week, g]) => ({ week, ...g })),
      weightWithoutStrongestWeek: omit.length ? Math.min(...omit.map((r) => r.weight)) : 0,
      omittedWeeks: omit,
      directions: ['over', 'under'].map((direction) => ({
        direction,
        ...diag(
          rs.filter((r) => (direction === 'over' ? r.unadapted > r.book : r.unadapted < r.book)),
        ),
      })),
    });
  }
await writeArtifact(out, {
  generatedAt: new Date().toISOString(),
  parentPrimary: e.parent.primary,
  seasons,
  weekly,
  interpretation:
    'Exact parent reproduction and descriptive weak-season decomposition. Leave-week diagnostics are counterfactuals with fixed raw forecasts, not independent validation. Feedback candidates are diagnosis-informed; new selection uses only earlier 2021-2022, but inherited source settings and revised inputs keep the full pipeline retrospective.',
});
console.log(JSON.stringify(seasons));
