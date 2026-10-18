import { prepareGameRatingModel } from '../packages/core/dist/game-rating-model.js';
import { prepareRichPersonnelModel } from '../packages/core/dist/research/rich-personnel-model.js';
export const kinds = ['moneyline', 'spread', 'total'];
export const specs = ['all', 'quarterback', 'injuries'].flatMap((family) =>
  [200, 1000].flatMap((penalty) =>
    ['direct', 'adaptive-book'].map((rule) => ({ family, penalty, rule })),
  ),
);
export const specId = (spec) => `${spec.family}-${spec.penalty}-${spec.rule}`;
const mean = (v) => v.reduce((s, n) => s + n, 0) / v.length;
export function summarize(rows) {
  if (!rows.length) return { n: 0 };
  const loss = (key) => mean(rows.map((r) => (r[key] - r.y) ** 2));
  const interval = (key, z) => {
    const difference = loss(key) - loss('p'),
      weeks = new Map();
    for (const r of rows) {
      const id = `${r.season}:${r.week}`;
      const w = weeks.get(id) ?? { sum: 0, n: 0 };
      w.sum += (r[key] - r.y) ** 2 - (r.p - r.y) ** 2;
      w.n++;
      weeks.set(id, w);
    }
    if (weeks.size < 2) return null;
    const se =
      Math.sqrt(
        (weeks.size / (weeks.size - 1)) *
          [...weeks.values()].reduce((s, w) => s + (w.sum - difference * w.n) ** 2, 0),
      ) / rows.length;
    return [difference - z * se, difference + z * se];
  };
  return {
    n: rows.length,
    brier: loss('p'),
    previousBrier: loss('previous'),
    bookBrier: loss('book'),
    logLoss: mean(rows.map((r) => -(r.y * Math.log(r.p) + (1 - r.y) * Math.log(1 - r.p)))),
    previousLogLoss: mean(
      rows.map((r) => -(r.y * Math.log(r.previous) + (1 - r.y) * Math.log(1 - r.previous))),
    ),
    bookLogLoss: mean(
      rows.map((r) => -(r.y * Math.log(r.book) + (1 - r.y) * Math.log(1 - r.book))),
    ),
    bookImprovementInterval: interval('book', 1.96),
    previousImprovementInterval: interval('previous', 1.96),
    simultaneousBookInterval: interval('book', 2.8653),
  };
}
export function prepareEvaluation(games) {
  const model = prepareGameRatingModel(games),
    base = new Map(),
    candidates = new Map();
  return (kind, spec, from, to) => {
    let candidate;
    if (spec) {
      const key = specId(spec);
      candidate = candidates.get(key);
      if (!candidate) {
        candidate = prepareRichPersonnelModel(model, spec);
        candidates.set(key, candidate);
      }
    }
    return model.observations.flatMap((r) => {
      const q = r.markets[kind];
      if (!q || q.push || r.game.season < from || r.game.season > to) return [];
      const key = `${kind}:${r.game.id}`;
      let previous = base.get(key);
      if (previous === undefined) {
        previous =
          kind === 'total'
            ? model.adjustJointAvailability(kind, r.game, q.raw, q.baseline)
            : model.adjust(kind, r.game, q.raw, q.baseline);
        base.set(key, previous);
      }
      return [
        {
          id: r.game.id,
          season: r.game.season,
          week: r.game.week,
          kind,
          y: q.y,
          previous,
          book: q.baseline,
          p: candidate ? candidate.probability(kind, r.game, q.raw, q.baseline) : previous,
        },
      ];
    });
  };
}
