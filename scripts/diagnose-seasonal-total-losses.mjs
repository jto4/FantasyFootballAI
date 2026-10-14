import { readFile } from 'node:fs/promises';
import { prepare, summarize, hash } from './directional-total-evaluation.mjs';
const [contexts, signals, parentPath] = process.argv.slice(2);
if (!contexts || !signals || !parentPath)
  throw new Error('Usage: <contexts> <signals> <v13-settings>');
const e = await prepare(contexts, signals, parentPath),
  adapter = e.oldAdapter(),
  sigmoid = (x) => 1 / (1 + Math.exp(-x)),
  logit = (p) => Math.log(p / (1 - p)),
  clip = (x) => Math.max(-0.15, Math.min(0.15, x));
const groups = {
  coverage: [2, 8, 11, 17],
  unsignedVolume: [5, 14],
  retained: [0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 16],
  allLiquidity: [3, 4, 5, 6, 7, 12, 13, 14, 15, 16],
};
const rows = e.base
  .filter((r) => r.kind === 'total')
  .map(({ game, raw: _raw, ...r }) => {
    const f = e.byId.get(r.id),
      out = adapter.forecast(game, r.book, f.x, f.supported),
      old = e.oldById.get(`total:${r.id}`);
    if (out.probability !== old.p || out.rawProbability !== old.unadapted)
      throw new Error('V13 diagnosis failed exact reproduction');
    const contributions = Object.fromEntries(
      Object.entries(groups).map(([name, indices]) => [
        name,
        f.supported && out.fit?.training >= 20
          ? indices.reduce((s, i) => s + f.x[i] * out.fit.coefficients[i], 0)
          : 0,
      ]),
    );
    const total = contributions.coverage + contributions.unsignedVolume + contributions.retained;
    const stripped = (removed) =>
      r.book + out.reliability.weight * (sigmoid(logit(r.book) + clip(total - removed)) - r.book);
    const p = out.probability,
      delta = p - r.book;
    return {
      ...r,
      p,
      delta,
      reliabilityWeight: out.reliability.weight,
      excess: (p - r.y) ** 2 - (r.book - r.y) ** 2,
      linear: 2 * (r.book - r.y) * delta,
      quadratic: delta * delta,
      contributions,
      ablations: {
        noCoverage: stripped(contributions.coverage),
        noUnsignedVolume: stripped(contributions.unsignedVolume),
        noCoverageOrUnsignedVolume: stripped(contributions.coverage + contributions.unsignedVolume),
        noCoverageOrLiquidity: stripped(contributions.coverage + contributions.allLiquidity),
      },
    };
  });
const mean = (rs, fn) => (rs.length ? rs.reduce((s, r) => s + fn(r), 0) / rs.length : null);
function describe(rs) {
  return {
    scores: summarize(rs),
    overRate: mean(rs, (r) => r.y),
    meanDelta: mean(rs, (r) => r.delta),
    meanLinearExcess: mean(rs, (r) => r.linear),
    meanQuadraticExcess: mean(rs, (r) => r.quadratic),
    changed: rs.filter((r) => Math.abs(r.delta) > 1e-12).length,
    meanBlockLogits: Object.fromEntries(
      Object.keys(groups).map((k) => [k, mean(rs, (r) => r.contributions[k])]),
    ),
    fixedFitFixedFeedbackAblations: Object.fromEntries(
      ['noCoverage', 'noUnsignedVolume', 'noCoverageOrUnsignedVolume', 'noCoverageOrLiquidity'].map(
        (k) => [k, summarize(rs.map((r) => ({ ...r, p: r.ablations[k] })))],
      ),
    ),
  };
}
const late = rows.filter((r) => r.season === 2025 && r.week >= 9);
console.log(
  JSON.stringify(
    {
      diagnosedAt: new Date().toISOString(),
      contextSha256: e.parent.contextSha256,
      signalsSha256: e.parent.signalsSha256,
      parentSettingsSha256: hash(await readFile(parentPath)),
      parentAuditSha256: hash(await readFile(e.parentAuditPath)),
      late2025: describe(late),
      weeks: Array.from({ length: 10 }, (_, i) => ({
        week: i + 9,
        ...describe(late.filter((r) => r.week === i + 9)),
      })),
      largestLosses: [...late].sort((a, b) => b.excess - a.excess).slice(0, 12),
      warnings: [
        'These fixed-coefficient, fixed-feedback ablations are diagnosis only; the requested removal will refit both coefficients and honest feedback independently.',
        'Previously inspected seasons remain reused research and cannot establish untouched validation.',
      ],
    },
    null,
    2,
  ),
);
