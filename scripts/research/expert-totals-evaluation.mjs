import { prepareGameRatingModel } from '../../packages/core/dist/game-rating-model.js';
import { prepareBoostedMarketModel } from '../../packages/core/dist/research/boosted-market-model.js';
import {
  prepareExpertTotalsAdapter,
  expertTotalsParameters,
} from '../../packages/core/dist/research/expert-totals-model.js';
import { report } from './seasonal-hybrid-evaluation.mjs';
export { report, expertTotalsParameters };
export const specs = [16, 64].flatMap((learningRate) =>
  [0.05, 0.2].flatMap((share) =>
    [0.5, 0.8].flatMap((bookPrior) =>
      [0, 0.25].map((seasonCarry) => ({ learningRate, share, bookPrior, seasonCarry })),
    ),
  ),
);
export const specId = (s) =>
  s ? `experts-${s.learningRate}-${s.share}-${s.bookPrior}-${s.seasonCarry}` : 'hybrid-unadapted';
export function prepareEvaluation(games, from, to) {
  const model = prepareGameRatingModel(games),
    slow = prepareBoostedMarketModel(model, expertTotalsParameters.slowTree),
    fast = prepareBoostedMarketModel(model, expertTotalsParameters.fastTree),
    rows = model.observations.flatMap((r) => {
      const q = r.markets.total;
      return q && !q.push && r.game.season >= from - 1 && r.game.season <= to
        ? [
            {
              game: r.game,
              book: q.baseline,
              y: q.y,
              probabilities: [
                q.baseline,
                slow.probability('total', r.game, q.raw, q.baseline),
                fast.probability('total', r.game, q.raw, q.baseline),
                model.adjustJointAvailability('total', r.game, q.raw, q.baseline),
              ],
            },
          ]
        : [];
    }),
    nonTotals = model.observations.flatMap((r) => {
      if (r.game.season < from || r.game.season > to) return [];
      return ['moneyline', 'spread'].flatMap((kind) => {
        const q = r.markets[kind];
        if (!q || q.push) return [];
        const previous = model.adjust(kind, r.game, q.raw, q.baseline);
        return [
          {
            id: r.game.id,
            season: r.game.season,
            week: r.game.week,
            kind,
            y: q.y,
            p: previous,
            previous,
            book: q.baseline,
            unadapted: previous,
          },
        ];
      });
    });
  return (spec) => {
    const adapter = spec ? prepareExpertTotalsAdapter(rows, spec) : undefined,
      totals = rows
        .filter((r) => r.game.season >= from && r.game.season <= to)
        .map((r) => ({
          id: r.game.id,
          season: r.game.season,
          week: r.game.week,
          kind: 'total',
          y: r.y,
          book: r.book,
          previous: r.probabilities[3],
          unadapted: r.probabilities[1],
          p: adapter ? adapter.probability(r.game, r.probabilities) : r.probabilities[1],
          weights: adapter ? adapter.weights(r.game) : [0, 1, 0, 0],
        }));
    return [...nonTotals, ...totals];
  };
}
export function expertReport(rows) {
  const result = report(rows),
    totals = rows.filter((r) => r.kind === 'total'),
    meanWeights = (indices) =>
      [0, 1, 2, 3].map(
        (i) => indices.reduce((s, r) => s + (r.weights?.[i] ?? 0), 0) / indices.length,
      );
  return {
    ...result,
    meanExpertWeights: meanWeights(totals),
    weeklyWeights: [...new Set(totals.map((r) => `${r.season}:${r.week}`))].map((key) => {
      const cases = totals.filter((r) => `${r.season}:${r.week}` === key);
      return {
        season: cases[0].season,
        week: cases[0].week,
        n: cases.length,
        weights: meanWeights(cases),
      };
    }),
  };
}
