import type { FootballGame } from '../advice-types.js';
import type { GameRatingModel } from '../game-rating-model.js';
import {
  prepareSeasonalExternalTotalsModel,
  type SeasonalExternalRow,
  type SeasonalExternalSpec,
} from './seasonal-external-totals-model.js';

export const directionalTotalPolicy = Object.freeze({
  name: 'remove-coverage-and-unsigned-volume',
  removedIndices: Object.freeze([2, 5, 8, 11, 14, 17]),
  retainedIndices: Object.freeze([0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 16]),
});
export const priceOnlyTotalPolicy = Object.freeze({
  name: 'remove-coverage-and-all-trade-flow',
  removedIndices: Object.freeze([2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17]),
  retainedIndices: Object.freeze([0, 1, 9, 10]),
});
export type DirectionalTotalFeaturePolicy = 'directional' | 'prices-only';
export type DirectionalTotalSpec = Pick<
  SeasonalExternalSpec,
  'halfLifeWeeks' | 'priorSeasonWeight'
>;
/** Validate the complete source vector before masking, including removed columns.
 * Coverage still gates source eligibility; it cannot encode a scoring direction.
 */
export function projectDirectionalTotalFeatures(
  x: number[],
  policy: DirectionalTotalFeaturePolicy = 'directional',
): number[] {
  if (
    !Array.isArray(x) ||
    x.length !== 18 ||
    x.some((v) => !Number.isFinite(v) || Math.abs(v) > 4) ||
    !['directional', 'prices-only'].includes(policy)
  )
    throw new Error('Invalid directional source vector.');
  const removed =
    policy === 'directional'
      ? directionalTotalPolicy.removedIndices
      : priceOnlyTotalPolicy.removedIndices;
  return x.map((v, i) => (removed.includes(i) ? 0 : v));
}
/** Fixed feature removal around the frozen seasonal engine; no new fit or feedback math. */
export function prepareDirectionalSeasonalTotalsModel(
  model: GameRatingModel,
  input: SeasonalExternalRow[],
  spec: DirectionalTotalSpec,
  policy: DirectionalTotalFeaturePolicy = 'directional',
) {
  if (
    !Array.isArray(input) ||
    input.length > 10000 ||
    Object.keys(spec).some((k) => !['halfLifeWeeks', 'priorSeasonWeight'].includes(k)) ||
    !['directional', 'prices-only'].includes(policy)
  )
    throw new Error('Invalid directional totals specification.');
  const adapter = prepareSeasonalExternalTotalsModel(
    model,
    input.map((r) => ({ ...r, x: projectDirectionalTotalFeatures(r.x, policy) })),
    { ...spec, features: 'directional' },
  );
  const forecast = (game: FootballGame, book: number, x: number[], supported: boolean) =>
    adapter.forecast(game, book, projectDirectionalTotalFeatures(x, policy), supported);
  const probability = (
    kind: 'moneyline' | 'spread' | 'total',
    game: FootballGame,
    raw: number,
    book: number,
    x: number[],
    supported: boolean,
  ) =>
    kind === 'total'
      ? forecast(game, book, x, supported).probability
      : adapter.probability(kind, game, raw, book, x, supported);
  return { ...adapter, forecast, probability };
}
