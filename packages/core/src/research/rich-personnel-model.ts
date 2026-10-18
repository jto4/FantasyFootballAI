import type { FootballGame } from '../advice-types.js';
import { richPersonnelFeatures } from '../game-availability.js';
import { earlierGame, fitOffsetFeatures, type GameRatingModel } from '../game-rating-model.js';
import { correctionWeight } from '../market-context.js';

type Kind = 'moneyline' | 'spread' | 'total';
export interface RichPersonnelSpec {
  family: 'all' | 'quarterback' | 'injuries';
  penalty: 200 | 1000;
  rule: 'direct' | 'adaptive-book';
}
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Local research only. Every fit and blending weight reads strictly earlier NFL weeks.
 * Live forecasting intentionally retains its independently selected v3/v4 procedure.
 */
export function prepareRichPersonnelModel(model: GameRatingModel, spec: RichPersonnelSpec) {
  const fits = new Map<string, number[]>(),
    predictions = new Map<string, number>(),
    weights = new Map<string, number>();
  const previous = (kind: Kind, game: FootballGame, raw: number, book: number) =>
    kind === 'total'
      ? model.adjustJointAvailability(kind, game, raw, book)
      : model.adjust(kind, game, raw, book);
  const prior = (kind: Kind, game: FootballGame) =>
    model.observations.flatMap((r) =>
      earlierGame(r.game, game) &&
      r.game.season >= game.season - 4 &&
      r.markets[kind] &&
      !r.markets[kind]!.push
        ? [r.markets[kind]!]
        : [],
    );
  function direct(kind: Kind, game: FootballGame, raw: number, book: number) {
    const base = previous(kind, game, raw, book),
      x = richPersonnelFeatures(kind, game, spec.family);
    if (!x.some((v) => v !== 0)) return base;
    const key = `${kind}:${game.season}:${game.week}:${game.date}`;
    let c = fits.get(key);
    if (!c) {
      const rows = prior(kind, game).map((r) => ({
        x: richPersonnelFeatures(kind, r.game, spec.family),
        offset: logit(previous(kind, r.game, r.raw, r.baseline)),
        y: r.y,
      }));
      if (rows.filter((r) => r.x.some((v) => v !== 0)).length < 200) return base;
      c = fitOffsetFeatures(rows, spec.penalty, x.length);
      fits.set(key, c);
      if (fits.size > 2048) fits.delete(fits.keys().next().value!);
    }
    return sigmoid(logit(base) + c.reduce((sum, value, i) => sum + value * x[i]!, 0));
  }
  return {
    probability(kind: Kind, game: FootballGame, raw: number, book: number) {
      const candidate = direct(kind, game, raw, book);
      if (spec.rule === 'direct') return candidate;
      const key = `${kind}:${game.season}:${game.week}:${game.date}`;
      let weight = weights.get(key);
      if (weight === undefined) {
        weight = correctionWeight(
          prior(kind, game).map((r) => {
            const key = `${kind}:${r.game.id}`;
            let probability = predictions.get(key);
            if (probability === undefined) {
              probability = direct(kind, r.game, r.raw, r.baseline);
              predictions.set(key, probability);
            }
            return { probability, baseline: r.baseline, outcome: r.y };
          }),
        );
        weights.set(key, weight);
        if (weights.size > 2048) weights.delete(weights.keys().next().value!);
        if (predictions.size > 30000) predictions.delete(predictions.keys().next().value!);
      }
      return book + weight * (candidate - book);
    },
  };
}
