import { prepareGameRatingModel } from '../../packages/core/dist/game-rating-model.js';
import { prepareBoostedMarketModel } from '../../packages/core/dist/research/boosted-market-model.js';
import {
  prepareSeasonalTotalAdapter,
  seasonalHybridParameters,
} from '../../packages/core/dist/research/seasonal-hybrid-model.js';
import { summarize, kinds } from './rich-personnel-evaluation.mjs';
export { summarize, kinds, seasonalHybridParameters };
export const specs = [4, 8].flatMap((halfLifeWeeks) =>
  [25, 100].flatMap((penalty) =>
    [0, 0.25].flatMap((priorSeasonWeight) =>
      ['direct', 'adaptive-book'].map((rule) => ({
        halfLifeWeeks,
        penalty,
        priorSeasonWeight,
        rule,
      })),
    ),
  ),
);
export const specId = (s) =>
  s
    ? `seasonal-${s.halfLifeWeeks}-${s.penalty}-${s.priorSeasonWeight}-${s.rule}`
    : 'hybrid-unadapted';
export function prepareEvaluation(games, from, to) {
  const model = prepareGameRatingModel(games),
    tree = prepareBoostedMarketModel(model, seasonalHybridParameters.tree),
    rows = model.observations.flatMap((r) => {
      const q = r.markets.total;
      // The preceding season's calibration needs its own preceding-season predictions.
      return q && !q.push && r.game.season >= from - 2 && r.game.season <= to
        ? [
            {
              game: r.game,
              raw: q.raw,
              probability: tree.probability('total', r.game, q.raw, q.baseline),
              book: q.baseline,
              y: q.y,
            },
          ]
        : [];
    }),
    base = new Map();
  return (spec) => {
    const adapter = spec ? prepareSeasonalTotalAdapter(rows, spec) : undefined;
    const totalRows = rows
      .filter((r) => r.game.season >= from && r.game.season <= to)
      .map((r) => {
        const key = r.game.id;
        let previous = base.get(key);
        if (previous === undefined) {
          previous = model.adjustJointAvailability('total', r.game, r.raw, r.book);
          base.set(key, previous);
        }
        return {
          id: key,
          season: r.game.season,
          week: r.game.week,
          kind: 'total',
          y: r.y,
          book: r.book,
          previous,
          unadapted: r.probability,
          p: adapter ? adapter.probability(r.game, r.probability, r.book) : r.probability,
        };
      });
    const others = model.observations.flatMap((r) => {
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
            book: q.baseline,
            previous,
            p: previous,
            unadapted: previous,
          },
        ];
      });
    });
    return [...others, ...totalRows];
  };
}
export function report(rows) {
  const pooled = summarize(rows),
    markets = [];
  for (const season of [...new Set(rows.map((r) => r.season))].sort())
    for (const kind of kinds)
      markets.push({
        season,
        kind,
        ...summarize(rows.filter((r) => r.season === season && r.kind === kind)),
      });
  return {
    pooled,
    markets,
    totals: summarize(rows.filter((r) => r.kind === 'total')),
    phases: [
      [1, 6],
      [7, 12],
      [13, 18],
    ].map(([from, to]) => ({
      from,
      to,
      ...summarize(rows.filter((r) => r.kind === 'total' && r.week >= from && r.week <= to)),
    })),
    consistency: {
      beatsBook: markets.filter((r) => r.brier < r.bookBrier - 1e-12).length,
      tiesBook: markets.filter((r) => Math.abs(r.brier - r.bookBrier) <= 1e-12).length,
      losesBook: markets.filter((r) => r.brier > r.bookBrier + 1e-12).length,
      simultaneousPositive: markets.filter((r) => r.simultaneousBookInterval?.[0] > 0).length,
    },
    bookFallbackFraction:
      rows.filter((r) => r.kind === 'total' && Math.abs(r.p - r.book) <= 1e-12).length /
      rows.filter((r) => r.kind === 'total').length,
    nonTotalMaximumProductionDifference: Math.max(
      0,
      ...rows.filter((r) => r.kind !== 'total').map((r) => Math.abs(r.p - r.previous)),
    ),
  };
}
