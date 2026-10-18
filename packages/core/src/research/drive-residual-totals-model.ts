import type { FootballGame } from '../advice-types.js';
import { earlierGame, type GameRatingModel } from '../game-rating-model.js';

export interface DriveResidualRow {
  game: FootballGame;
  book: number;
  y: 0 | 1;
  residual: number;
  supported: boolean;
  x: number[];
}
export interface DriveResidualSpec {
  penalty: 25 | 100;
  flow: boolean;
}
export const driveResidualParameters = Object.freeze({
  featureCount: 18,
  minimumTrainingGames: 40,
  minimumFeedbackGames: 30,
  currentHalfLifeWeeks: 8,
  priorHalfLifeWeeks: 26,
  priorSeasonWeight: 0.5,
  feedbackRidge: 0.02,
  maxAddedLogit: 0.35,
  residualClip: 35,
  fitSeasons: 3,
});
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x)),
  logit = (p: number) => Math.log(p / (1 - p));
const clip = (x: number, bound: number) => Math.max(-bound, Math.min(bound, x));
function solve(matrix: number[][], target: number[]) {
  const n = target.length,
    a = matrix.map((r, i) => [...r, target[i]!]);
  for (let i = 0; i < n; i++) {
    const d = a[i]![i]!;
    if (!Number.isFinite(d) || d <= 0) throw new Error('Invalid residual fit.');
    for (let k = i; k <= n; k++) a[i]![k]! /= d;
    for (let j = 0; j < n; j++)
      if (i !== j) {
        const v = a[j]![i]!;
        for (let k = i; k <= n; k++) a[j]![k]! -= v * a[i]![k]!;
      }
  }
  return a.map((r) => r[n]!);
}
/** Learn scoring-margin severity rather than discarding it into an Over/Under bit.
 * Forecast correction and feedback are book anchored and fitted only at earlier origins.
 */
export function prepareDriveResidualTotalsModel(
  model: GameRatingModel,
  input: DriveResidualRow[],
  spec: DriveResidualSpec,
) {
  if (
    !Array.isArray(input) ||
    input.length > 10000 ||
    ![25, 100].includes(spec.penalty) ||
    typeof spec.flow !== 'boolean'
  )
    throw new Error('Invalid drive residual specification.');
  const seen = new Set<string>();
  for (const r of input) {
    if (
      !r.game ||
      typeof r.game.id !== 'string' ||
      seen.has(r.game.id) ||
      !Number.isInteger(r.game.season) ||
      !Number.isInteger(r.game.week) ||
      r.game.week < 1 ||
      r.game.week > 18 ||
      !Number.isFinite(Date.parse(r.game.date)) ||
      !r.game.kickoffAt ||
      !Number.isFinite(Date.parse(r.game.kickoffAt)) ||
      !Number.isFinite(r.book) ||
      r.book <= 0 ||
      r.book >= 1 ||
      ![0, 1].includes(r.y) ||
      !Number.isFinite(r.residual) ||
      Math.abs(r.residual) > 150 ||
      typeof r.supported !== 'boolean' ||
      !Array.isArray(r.x) ||
      r.x.length !== 18 ||
      r.x.some((v) => !Number.isFinite(v) || Math.abs(v) > 4)
    )
      throw new Error('Invalid drive residual row.');
    seen.add(r.game.id);
  }
  const select = (x: number[]) => [1, ...(spec.flow ? x : x.slice(0, 14))];
  const rows = input
      .map((r) => ({ ...r, game: { ...r.game }, x: select(r.x) }))
      .sort((a, b) => a.game.date.localeCompare(b.game.date) || a.game.id.localeCompare(b.game.id)),
    n = spec.flow ? 19 : 15;
  function weight(origin: FootballGame, g: FootballGame) {
    if (
      !earlierGame(g, origin) ||
      g.season < origin.season - 3 ||
      Date.parse(origin.date) - Date.parse(g.date) < 48 * 3600000
    )
      return 0;
    if (g.season === origin.season) return 2 ** (-(origin.week - g.week) / 8);
    return (
      0.5 ** (origin.season - g.season) *
      2 ** (-(origin.week - 1 + 18 - g.week + (origin.season - g.season - 1) * 18) / 26)
    );
  }
  const fits = new Map<string, ReturnType<typeof fitUncached>>(),
    feedbacks = new Map<string, ReturnType<typeof feedbackUncached>>();
  const key = (g: FootballGame) => `${g.season}:${g.week}:${g.date}`;
  function fitUncached(origin: FootballGame) {
    const prior = rows.filter((r) => r.supported && weight(origin, r.game) > 0),
      matrix = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? spec.penalty : 0)),
      ),
      target = Array<number>(n).fill(0);
    for (const r of prior) {
      const w = weight(origin, r.game),
        y = clip(r.residual, 35);
      for (let i = 0; i < n; i++) {
        target[i]! += w * r.x[i]! * y;
        for (let j = 0; j < n; j++) matrix[i]![j]! += w * r.x[i]! * r.x[j]!;
      }
    }
    const coefficients = prior.length >= 40 ? solve(matrix, target) : Array<number>(n).fill(0),
      effectiveGames = prior.reduce((s, r) => s + weight(origin, r.game), 0);
    const variance =
      prior.reduce(
        (s, r) =>
          s +
          weight(origin, r.game) *
            (clip(r.residual, 35) - r.x.reduce((v, x, i) => v + x * coefficients[i]!, 0)) ** 2,
        0,
      ) / Math.max(1, effectiveGames);
    return {
      coefficients,
      training: prior.length,
      effectiveGames,
      residualSd: Math.sqrt(Math.max(100, Math.min(400, variance))),
    };
  }
  function fit(g: FootballGame) {
    let f = fits.get(key(g));
    if (!f) {
      f = fitUncached(g);
      fits.set(key(g), f);
    }
    return f;
  }
  function raw(r: { game: FootballGame; book: number; supported: boolean; x: number[] }) {
    if (!r.supported) return r.book;
    const f = fit(r.game);
    if (f.training < 40) return r.book;
    const shift = clip(
      (r.x.reduce((s, v, i) => s + v * f.coefficients[i]!, 0) * 1.6) / f.residualSd,
      0.35,
    );
    return shift === 0 ? r.book : sigmoid(logit(r.book) + shift);
  }
  function feedbackUncached(origin: FootballGame) {
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
    return {
      weight: games >= 30 ? clip(Math.max(0, linear / (quadratic + 0.02)), 1) : 0,
      games,
      effectiveGames,
      linear,
      quadratic,
    };
  }
  function reliability(g: FootballGame) {
    let r = feedbacks.get(key(g));
    if (!r) {
      r = feedbackUncached(g);
      feedbacks.set(key(g), r);
    }
    return r;
  }
  const identities = new Map(rows.map((r) => [r.game.id, r]));
  function forecast(game: FootballGame, book: number, x: number[], supported: boolean) {
    if (
      !Array.isArray(x) ||
      x.length !== 18 ||
      x.some((v) => !Number.isFinite(v) || Math.abs(v) > 4) ||
      !Number.isFinite(book) ||
      book <= 0 ||
      book >= 1 ||
      typeof supported !== 'boolean' ||
      !Number.isInteger(game.season) ||
      !Number.isInteger(game.week) ||
      game.week < 1 ||
      game.week > 18 ||
      !Number.isFinite(Date.parse(game.date)) ||
      !game.kickoffAt ||
      !Number.isFinite(Date.parse(game.kickoffAt))
    )
      throw new Error('Invalid drive residual forecast.');
    const selected = select(x),
      existing = identities.get(game.id);
    if (
      existing &&
      (existing.book !== book ||
        existing.supported !== supported ||
        existing.game.season !== game.season ||
        existing.game.week !== game.week ||
        existing.game.date !== game.date ||
        existing.game.kickoffAt !== game.kickoffAt ||
        existing.game.home !== game.home ||
        existing.game.away !== game.away ||
        existing.game.totalLine !== game.totalLine ||
        existing.x.some((v, i) => v !== selected[i]))
    )
      throw new Error('Drive forecast identity mismatch.');
    const rawProbability = raw({ game, book, x: selected, supported }),
      r = reliability(game),
      probability = book + r.weight * (rawProbability - book);
    return { probability, rawProbability, reliability: r, fit: fit(game) };
  }
  function probability(
    kind: 'total' | 'moneyline' | 'spread',
    game: FootballGame,
    raw: number,
    book: number,
    x: number[],
    supported: boolean,
  ) {
    return kind === 'total'
      ? forecast(game, book, x, supported).probability
      : model.adjust(kind, game, raw, book);
  }
  return { forecast, probability, fit, reliability, weight };
}
