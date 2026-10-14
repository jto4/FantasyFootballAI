import type { FootballGame } from './advice-types.js';
import { earlierGame, type GameRatingModel } from './game-rating-model.js';

export interface SeasonalExternalRow {
  game: FootballGame;
  book: number;
  y: 0 | 1;
  supported: boolean;
  x: number[];
}
export interface SeasonalExternalSpec {
  halfLifeWeeks: 4 | 8;
  priorSeasonWeight: 0 | 0.25;
  features: 'all' | 'directional';
}
export const seasonalExternalParameters = Object.freeze({
  penalty: 400,
  minimumTrainingGames: 20,
  minimumFeedbackGames: 20,
  feedbackRidge: 0.01,
  maxAddedLogit: 0.15,
  featureCount: 18,
  fitSeasons: 2,
});
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clip = (x: number, bound = 0.15) => Math.max(-bound, Math.min(bound, x));
const directional = [0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 16];
type WeightedRow = { x: number[]; book: number; y: number; weight: number };
/** Weighted offset likelihood; ridge strength stays fixed as effective recent history shrinks. */
function weightedFit(rows: WeightedRow[], n: number) {
  const c = Array<number>(n).fill(0),
    ridge = seasonalExternalParameters.penalty;
  for (let step = 0; step < 12; step++) {
    const gradient = c.map((v) => -ridge * v),
      hessian = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? ridge : 0)),
      );
    for (const r of rows) {
      const p = sigmoid(logit(r.book) + r.x.reduce((s, v, i) => s + v * c[i]!, 0));
      for (let i = 0; i < n; i++) {
        gradient[i]! += r.weight * r.x[i]! * (r.y - p);
        for (let j = 0; j < n; j++) hessian[i]![j]! += r.weight * r.x[i]! * r.x[j]! * p * (1 - p);
      }
    }
    const a = hessian.map((r, i) => [...r, gradient[i]!]);
    for (let i = 0; i < n; i++) {
      const d = a[i]![i]!;
      for (let k = i; k <= n; k++) a[i]![k]! /= d;
      for (let j = 0; j < n; j++)
        if (j !== i) {
          const v = a[j]![i]!;
          for (let k = i; k <= n; k++) a[j]![k]! -= v * a[i]![k]!;
        }
    }
    const delta = a.map((r) => r[n]!);
    for (let i = 0; i < n; i++) c[i]! += delta[i]!;
    if (Math.max(...delta.map(Math.abs)) < 1e-5) break;
  }
  return c;
}
/** Prior season labels are a weakened prior. Current-week results never enter a fit or feedback weight.
 * Feedback uses earlier forecasts fitted at their own origins, not in-sample fitted probabilities.
 */
export function prepareSeasonalExternalTotalsModel(
  model: GameRatingModel,
  input: SeasonalExternalRow[],
  spec: SeasonalExternalSpec,
) {
  if (
    input.length > 10000 ||
    ![4, 8].includes(spec.halfLifeWeeks) ||
    ![0, 0.25].includes(spec.priorSeasonWeight) ||
    !['all', 'directional'].includes(spec.features)
  )
    throw new Error('Invalid seasonal external specification.');
  const seen = new Set<string>();
  for (const r of input) {
    if (
      !r ||
      !r.game ||
      typeof r.game.id !== 'string' ||
      !Number.isInteger(r.game.season) ||
      !Number.isInteger(r.game.week) ||
      r.game.week < 1 ||
      r.game.week > 18 ||
      !Number.isFinite(Date.parse(r.game.date)) ||
      !r.game.kickoffAt ||
      !Number.isFinite(Date.parse(r.game.kickoffAt)) ||
      seen.has(r.game.id) ||
      !Number.isFinite(r.book) ||
      r.book <= 0 ||
      r.book >= 1 ||
      ![0, 1].includes(r.y) ||
      typeof r.supported !== 'boolean' ||
      !Array.isArray(r.x) ||
      r.x.length !== 18 ||
      r.x.some((v) => !Number.isFinite(v) || Math.abs(v) > 4)
    )
      throw new Error('Invalid seasonal external observation.');
    seen.add(r.game.id);
  }
  const select = (x: number[]) =>
    spec.features === 'all' ? [...x] : directional.map((i) => x[i]!);
  const rows = input
    .map((r) => ({ ...r, game: { ...r.game }, x: select(r.x) }))
    .sort(
      (a, b) =>
        a.game.season - b.game.season ||
        a.game.week - b.game.week ||
        a.game.date.localeCompare(b.game.date) ||
        a.game.id.localeCompare(b.game.id),
    );
  const byId = new Map(rows.map((r) => [r.game.id, r])),
    fits = new Map<
      string,
      {
        coefficients: number[];
        training: number;
        effectiveGames: number;
        currentSeasonGames: number;
      }
    >(),
    feedback = new Map<
      string,
      { weight: number; games: number; effectiveGames: number; unpenalizedGain: number }
    >();
  const key = (g: FootballGame) => `${g.season}:${g.week}:${g.date}`;
  function weight(origin: FootballGame, g: FootballGame) {
    if (!earlierGame(g, origin) || g.season < origin.season - 2) return 0;
    if (g.season === origin.season) return 2 ** (-(origin.week - g.week) / spec.halfLifeWeeks);
    return (
      spec.priorSeasonWeight *
      2 **
        (-(origin.week - 1 + 18 - g.week + (origin.season - g.season - 1) * 18) /
          spec.halfLifeWeeks)
    );
  }
  function fit(origin: FootballGame) {
    const k = key(origin),
      cached = fits.get(k);
    if (cached) return cached;
    const prior = rows.filter((r) => r.supported && weight(origin, r.game) > 0),
      n = spec.features === 'all' ? 18 : 12;
    const prepared = prior.map((r) => ({ ...r, weight: weight(origin, r.game) }));
    const result = {
      coefficients: prior.length >= 20 ? weightedFit(prepared, n) : Array<number>(n).fill(0),
      training: prior.length,
      effectiveGames: prepared.reduce((s, r) => s + r.weight, 0),
      currentSeasonGames: prior.filter((r) => r.game.season === origin.season).length,
    };
    fits.set(k, result);
    return result;
  }
  function raw(r: SeasonalExternalRow & { x: number[] }) {
    if (!r.supported) return r.book;
    const f = fit(r.game);
    if (f.training < 20) return r.book;
    const c = clip(r.x.reduce((s, v, i) => s + v * f.coefficients[i]!, 0));
    return c === 0 ? r.book : sigmoid(logit(r.book) + c);
  }
  function reliability(origin: FootballGame) {
    const k = key(origin),
      cached = feedback.get(k);
    if (cached) return cached;
    let linear = 0,
      quadratic = 0,
      games = 0,
      effectiveGames = 0;
    for (const r of rows) {
      const w = weight(origin, r.game);
      if (w <= 0 || !r.supported) continue;
      const d = raw(r) - r.book;
      if (Math.abs(d) <= 1e-12) continue;
      games++;
      effectiveGames += w;
      linear += w * d * (r.y - r.book);
      quadratic += w * d * d;
    }
    const result = {
      weight:
        games >= 20
          ? Math.max(
              0,
              Math.min(1, linear / (quadratic + seasonalExternalParameters.feedbackRidge)),
            )
          : 0,
      games,
      effectiveGames,
      unpenalizedGain: 2 * linear - quadratic,
    };
    feedback.set(k, result);
    return result;
  }
  function forecast(game: FootballGame, book: number, x: number[], supported: boolean) {
    if (
      !Number.isFinite(book) ||
      book <= 0 ||
      book >= 1 ||
      !Array.isArray(x) ||
      x.length !== 18 ||
      x.some((v) => !Number.isFinite(v) || Math.abs(v) > 4) ||
      typeof supported !== 'boolean' ||
      typeof game.id !== 'string' ||
      game.id.length > 80 ||
      !Number.isInteger(game.season) ||
      game.season < 1990 ||
      game.season > 2099 ||
      !Number.isInteger(game.week) ||
      game.week < 1 ||
      game.week > 18 ||
      !game.kickoffAt ||
      !Number.isFinite(Date.parse(game.kickoffAt)) ||
      !Number.isFinite(Date.parse(game.date))
    )
      throw new Error('Invalid seasonal forecast.');
    const existing = byId.get(game.id);
    const selected = select(x);
    if (
      existing &&
      (existing.game.season !== game.season ||
        existing.game.week !== game.week ||
        existing.game.date !== game.date ||
        existing.game.kickoffAt !== game.kickoffAt ||
        existing.game.home !== game.home ||
        existing.game.away !== game.away ||
        existing.game.totalLine !== game.totalLine ||
        existing.book !== book ||
        existing.supported !== supported ||
        existing.x.some((v, i) => v !== selected[i]))
    )
      throw new Error('Seasonal forecast identity mismatch.');
    const r = { game, book, x: selected, supported, y: 0 as const },
      rawProbability = raw(r),
      feedbackResult =
        rawProbability === book
          ? { weight: 0, games: 0, effectiveGames: 0, unpenalizedGain: 0 }
          : reliability(game);
    const probability =
      feedbackResult.weight === 0 ? book : book + feedbackResult.weight * (rawProbability - book);
    return {
      probability,
      rawProbability,
      reliability: feedbackResult,
      fit: supported ? fit(game) : undefined,
    };
  }
  function probability(
    kind: 'moneyline' | 'spread' | 'total',
    game: FootballGame,
    rawProbability: number,
    book: number,
    x: number[],
    supported: boolean,
  ) {
    return kind === 'total'
      ? forecast(game, book, x, supported).probability
      : model.adjust(kind, game, rawProbability, book);
  }
  return { probability, forecast, fit, reliability, weight };
}
