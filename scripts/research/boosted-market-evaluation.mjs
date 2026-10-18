import { prepareGameRatingModel } from '../packages/core/dist/game-rating-model.js';
import {
  prepareBoostedMarketModel,
  boostedMarketParameters,
} from '../packages/core/dist/research/boosted-market-model.js';
import { earlierGame } from '../packages/core/dist/game-rating-model.js';
import { prepareRichPersonnelModel } from '../packages/core/dist/research/rich-personnel-model.js';
import { summarize, kinds } from './rich-personnel-evaluation.mjs';
export { summarize, kinds, boostedMarketParameters };
export const structures = [1, 2].flatMap((depth) =>
  [120, 730].flatMap((halfLifeDays) =>
    ['market', 'all'].map((features) => ({ depth, halfLifeDays, features })),
  ),
);
export const specs = structures.flatMap((s) =>
  ['direct', 'adaptive-book'].map((rule) => ({ ...s, rule })),
);
export const specId = (s) => `tree-${s.depth}-${s.halfLifeDays}-${s.features}-${s.rule}`;
export function prepareEvaluation(games, v6Selection) {
  const model = prepareGameRatingModel(games),
    cache = new Map(),
    base = new Map(),
    v6 = new Map();
  function candidateRows(kind, spec, from, to) {
    const key = `${kind}:${spec.depth}:${spec.halfLifeDays}:${spec.features}:${from}:${to}`;
    let rows = cache.get(key);
    if (!rows) {
      const tree = prepareBoostedMarketModel(model, { ...spec, rule: 'direct' });
      rows = model.observations.flatMap((r) => {
        const q = r.markets[kind];
        if (
          !q ||
          q.push ||
          r.game.season < from - boostedMarketParameters.blendSeasons ||
          r.game.season > to
        )
          return [];
        return [
          {
            game: r.game,
            raw: q.raw,
            book: q.baseline,
            y: q.y,
            direct: tree.probability(kind, r.game, q.raw, q.baseline),
          },
        ];
      });
      cache.set(key, rows);
    }
    if (spec.rule === 'direct') return rows.map((r) => ({ ...r, p: r.direct, weight: 1 }));
    return rows.map((r) => {
      let numerator = 0,
        denominator = boostedMarketParameters.blendPenalty;
      for (const q of rows)
        if (
          earlierGame(q.game, r.game) &&
          q.game.season >= r.game.season - boostedMarketParameters.blendSeasons
        ) {
          const w =
              2 **
              (-(Date.parse(r.game.date) - Date.parse(q.game.date)) / 86400000 / spec.halfLifeDays),
            d = q.direct - q.book;
          numerator += w * d * (q.y - q.book);
          denominator += w * d * d;
        }
      const weight = Math.max(0, Math.min(1, numerator / denominator));
      return { ...r, p: r.book + weight * (r.direct - r.book), weight };
    });
  }
  return (kind, spec, from, to, reference = 'previous') => {
    let rich;
    if (v6Selection?.[kind]?.spec) {
      rich = v6.get(kind);
      if (!rich) {
        rich = prepareRichPersonnelModel(model, v6Selection[kind].spec);
        v6.set(kind, rich);
      }
    }
    const rows = spec
      ? candidateRows(kind, spec, from, to)
      : model.observations.flatMap((r) => {
          const q = r.markets[kind];
          return q && !q.push
            ? [{ game: r.game, raw: q.raw, book: q.baseline, y: q.y, weight: 0 }]
            : [];
        });
    return rows
      .filter((r) => r.game.season >= from && r.game.season <= to)
      .map((r) => {
        const key = `${kind}:${r.game.id}`;
        let previous = base.get(key);
        if (previous === undefined) {
          previous =
            kind === 'total'
              ? model.adjustJointAvailability(kind, r.game, r.raw, r.book)
              : model.adjust(kind, r.game, r.raw, r.book);
          base.set(key, previous);
        }
        const p = spec
          ? r.p
          : reference === 'book'
            ? r.book
            : reference === 'v6' && rich
              ? rich.probability(kind, r.game, r.raw, r.book)
              : previous;
        return {
          id: r.game.id,
          season: r.game.season,
          week: r.game.week,
          kind,
          y: r.y,
          p,
          book: r.book,
          previous,
          weight: r.weight,
        };
      });
  };
}
