import type { FootballGame } from '../advice-types.js';
import type { GameRatingModel } from '../game-rating-model.js';
import { prepareRecentTotalFeedback, type TotalFeedbackRow } from './recent-total-feedback.js';

export interface StableTotalFeedbackSpec {
  method: 'cluster' | 'leave-week-out';
  strength: 0.5 | 1;
  scope: 'pooled' | 'directional';
}
export const stableTotalFeedbackParameters = Object.freeze({
  halfLifeWeeks: 2,
  maxWeight: 0.5,
  priorSeed: false,
  minimumGames: 24,
  minimumWeeks: 3,
  minimumEffectiveGames: 12,
  feedbackRidge: 0.02,
});
const bound = (n: number) => Math.max(0, Math.min(0.5, n));
/** Penalize unreliable weekly alignment without changing any source forecast.
 * A same-direction head cannot borrow evidence from an opposing correction regime.
 * All contributions come from the frozen prior-only, season-reset temporal engine.
 */
export function prepareStableTotalFeedback(
  model: GameRatingModel,
  input: TotalFeedbackRow[],
  spec: StableTotalFeedbackSpec,
) {
  if (
    !spec ||
    !['cluster', 'leave-week-out'].includes(spec.method) ||
    ![0.5, 1].includes(spec.strength) ||
    !['pooled', 'directional'].includes(spec.scope) ||
    (spec.method === 'leave-week-out' && spec.strength !== 1) ||
    Object.keys(spec).some((k) => !['method', 'strength', 'scope'].includes(k))
  )
    throw new Error('Invalid stable totals feedback specification.');
  spec = Object.freeze({ ...spec });
  const base = prepareRecentTotalFeedback(model, input, {
    halfLifeWeeks: 2,
    maxWeight: 0.5,
    priorSeed: false,
  });
  const directions = new Map(input.map((r) => [r.game.id, Math.sign(r.rawProbability - r.book)]));
  const cache = new Map<string, ReturnType<typeof fit>>();
  function fit(game: FootballGame, direction: number) {
    const parent = base.reliability(game);
    const contributions = parent.contributions.filter(
      (r) => spec.scope === 'pooled' || directions.get(r.id) === direction,
    );
    const groups = new Map<
      string,
      { games: number; effectiveGames: number; linear: number; quadratic: number }
    >();
    for (const r of contributions) {
      const key = `${r.season}:${r.week}`,
        g = groups.get(key) ?? { games: 0, effectiveGames: 0, linear: 0, quadratic: 0 };
      g.games++;
      g.effectiveGames += r.weight;
      g.linear += r.linear;
      g.quadratic += r.quadratic;
      groups.set(key, g);
    }
    const weeks = groups.size,
      games = contributions.length,
      effectiveGames = contributions.reduce((s, r) => s + r.weight, 0),
      linear = contributions.reduce((s, r) => s + r.linear, 0),
      quadratic = contributions.reduce((s, r) => s + r.quadratic, 0);
    // Center each cluster by its own effective mass, preserving unequal bye-week sizes and recency.
    const mean = effectiveGames ? linear / effectiveGames : 0;
    const standardError =
      weeks >= 2
        ? Math.sqrt(
            (weeks / (weeks - 1)) *
              [...groups.values()].reduce(
                (s, g) => s + (g.linear - mean * g.effectiveGames) ** 2,
                0,
              ),
          )
        : 0;
    const sufficient = games >= 24 && weeks >= 3 && effectiveGames >= 12;
    const adjustedLinear = linear - spec.strength * standardError;
    const ordinaryWeight = sufficient ? bound(linear / (quadratic + 0.02)) : 0;
    let weight = sufficient ? bound(adjustedLinear / (quadratic + 0.02)) : 0;
    let leaveWeekOutMinimum: number | undefined;
    if (spec.method === 'leave-week-out') {
      // Do not amplify the remaining weeks or remove ridge when a lucky block is omitted.
      leaveWeekOutMinimum = sufficient
        ? Math.min(
            ...[...groups.values()].map((g) =>
              bound((linear - g.linear) / (quadratic - g.quadratic + 0.02)),
            ),
          )
        : 0;
      weight = Math.min(ordinaryWeight, leaveWeekOutMinimum);
    }
    return Object.freeze({
      weight,
      ordinaryWeight,
      games,
      weeks,
      effectiveGames,
      linear,
      quadratic,
      standardError,
      adjustedLinear: spec.method === 'cluster' ? adjustedLinear : undefined,
      leaveWeekOutMinimum,
      sufficient,
      direction: spec.scope === 'directional' ? direction : 0,
      parentGames: parent.games,
      parentWeight: parent.weight,
      weeksDetail: Object.freeze(
        [...groups.entries()].map(([key, g]) => Object.freeze({ key, ...g })),
      ),
    });
  }
  function reliability(game: FootballGame, book: number, rawProbability: number) {
    if (
      !Number.isFinite(book) ||
      book <= 0 ||
      book >= 1 ||
      !Number.isFinite(rawProbability) ||
      rawProbability <= 0 ||
      rawProbability >= 1
    )
      throw new Error('Invalid stable feedback probabilities.');
    base.reliability(game);
    const direction = spec.scope === 'directional' ? Math.sign(rawProbability - book) : 0;
    const key = `${game.season}:${game.week}:${game.date}:${direction}`;
    let out = cache.get(key);
    if (!out) {
      out = fit(game, direction);
      cache.set(key, out);
    }
    return out;
  }
  function forecast(game: FootballGame, book: number, rawProbability: number, supported: boolean) {
    base.forecast(game, book, rawProbability, supported);
    const feedback = reliability(game, book, rawProbability);
    return {
      probability: book + feedback.weight * (rawProbability - book),
      rawProbability,
      reliability: feedback,
    };
  }
  function probability(
    kind: 'moneyline' | 'spread' | 'total',
    game: FootballGame,
    raw: number,
    book: number,
    supported: boolean,
  ) {
    return kind === 'total'
      ? forecast(game, book, raw, supported).probability
      : model.adjust(kind, game, raw, book);
  }
  return { forecast, probability, reliability };
}
