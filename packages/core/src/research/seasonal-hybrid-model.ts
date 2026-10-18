import type { FootballGame } from '../advice-types.js';
import { earlierGame, type GameRatingModel } from '../game-rating-model.js';
import { prepareBoostedMarketModel } from './boosted-market-model.js';

export interface SeasonalTotalSpec {
  halfLifeWeeks: 4 | 8;
  penalty: 25 | 100;
  priorSeasonWeight: 0 | 0.25;
  rule: 'direct' | 'adaptive-book';
}
export interface SeasonalTotalRow {
  game: FootballGame;
  probability: number;
  book: number;
  y: number;
}
export const seasonalHybridParameters = Object.freeze({
  tree: Object.freeze({ depth: 2, halfLifeDays: 730, features: 'market', rule: 'direct' } as const),
  maxCalibrationLogit: 0.35,
  blendPenalty: 1,
  maxRows: 10000,
});
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clip = (v: number, n: number) => Math.max(-n, Math.min(n, v));
export function seasonalRowWeight(
  game: FootballGame,
  origin: FootballGame,
  spec: SeasonalTotalSpec,
) {
  if (!earlierGame(game, origin) || game.season < origin.season - 1) return 0;
  const same = game.season === origin.season,
    weeks = same
      ? origin.week - game.week - 1
      : (game.season >= 2021 ? 18 : 17) - game.week + origin.week - 1;
  return (same ? 1 : spec.priorSeasonWeight) * 2 ** (-Math.max(0, weeks) / spec.halfLifeWeeks);
}
/** Calibrate earlier out-of-week tree forecasts, not their in-sample fitted probabilities.
 * Weekly time decay and explicit prior-season carry limit stale seasonal bias.
 */
export function prepareSeasonalTotalAdapter(input: SeasonalTotalRow[], spec: SeasonalTotalSpec) {
  if (
    input.length > seasonalHybridParameters.maxRows ||
    new Set(input.map((r) => r.game.id)).size !== input.length ||
    ![4, 8].includes(spec.halfLifeWeeks) ||
    ![25, 100].includes(spec.penalty) ||
    ![0, 0.25].includes(spec.priorSeasonWeight) ||
    !['direct', 'adaptive-book'].includes(spec.rule) ||
    input.some(
      (r) =>
        ![r.probability, r.book].every((p) => Number.isFinite(p) && p > 0 && p < 1) ||
        ![0, 1].includes(r.y) ||
        !Number.isInteger(r.game.season) ||
        !Number.isInteger(r.game.week) ||
        r.game.week < 1 ||
        r.game.week > 18 ||
        r.game.seasonType !== 'REG' ||
        !Number.isFinite(Date.parse(r.game.date)),
    )
  )
    throw new Error('Invalid bounded seasonal adaptation data.');
  spec = { ...spec };
  const rows = structuredClone(input),
    coefficients = new Map<string, number>(),
    blends = new Map<string, number>(),
    calibrated = new Map<string, number>();
  function prior(origin: FootballGame) {
    return rows.flatMap((r) => {
      const w = seasonalRowWeight(r.game, origin, spec);
      return w > 0 ? [{ ...r, w }] : [];
    });
  }
  function direct(origin: FootballGame, probability: number) {
    const key = `${origin.season}:${origin.week}:${origin.date}`;
    let a = coefficients.get(key);
    if (a === undefined) {
      const history = prior(origin);
      a = 0;
      for (let step = 0; step < 8; step++) {
        let gradient = -spec.penalty * a,
          hessian = spec.penalty;
        for (const r of history) {
          const p = sigmoid(logit(r.probability) + a);
          gradient += r.w * (r.y - p);
          hessian += r.w * p * (1 - p);
        }
        const delta = gradient / hessian;
        a += delta;
        if (Math.abs(delta) < 1e-8) break;
      }
      a = clip(a, seasonalHybridParameters.maxCalibrationLogit);
      coefficients.set(key, a);
      if (coefficients.size > 1024) coefficients.delete(coefficients.keys().next().value!);
    }
    return a === 0 ? probability : sigmoid(logit(probability) + a);
  }
  return {
    probability(origin: FootballGame, probability: number, book: number) {
      const p = direct(origin, probability);
      if (spec.rule === 'direct') return p;
      const key = `${origin.season}:${origin.week}:${origin.date}`;
      let w = blends.get(key);
      if (w === undefined) {
        let numerator = 0,
          denominator = seasonalHybridParameters.blendPenalty;
        for (const r of prior(origin)) {
          const id = `${r.game.id}:${r.game.season}:${r.game.week}:${r.game.date}`;
          let q = calibrated.get(id);
          if (q === undefined) {
            q = direct(r.game, r.probability);
            calibrated.set(id, q);
          }
          const d = q - r.book;
          numerator += r.w * d * (r.y - r.book);
          denominator += r.w * d * d;
        }
        w = Math.max(0, Math.min(1, numerator / denominator));
        blends.set(key, w);
        if (blends.size > 1024) blends.delete(blends.keys().next().value!);
        if (calibrated.size > 10000) calibrated.delete(calibrated.keys().next().value!);
      }
      return book + w * (p - book);
    },
  };
}
/** Research hybrid: current production moneyline/spread dispatch is preserved exactly. */
export function prepareSeasonalHybridModel(model: GameRatingModel, spec: SeasonalTotalSpec | null) {
  const tree = prepareBoostedMarketModel(model, seasonalHybridParameters.tree),
    rows = model.observations.flatMap((r) => {
      const q = r.markets.total;
      return q && !q.push
        ? [
            {
              game: r.game,
              probability: tree.probability('total', r.game, q.raw, q.baseline),
              book: q.baseline,
              y: q.y,
            },
          ]
        : [];
    }),
    adapter = spec ? prepareSeasonalTotalAdapter(rows, spec) : undefined;
  return {
    probability(
      kind: 'moneyline' | 'spread' | 'total',
      origin: FootballGame,
      raw: number,
      book: number,
    ) {
      if (kind !== 'total') return model.adjust(kind, origin, raw, book);
      const p = tree.probability('total', origin, raw, book);
      return adapter ? adapter.probability(origin, p, book) : p;
    },
  };
}
