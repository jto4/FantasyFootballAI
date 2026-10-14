import type { FootballGame } from './advice-types.js';
import { earlierGame, type GameRatingModel } from './game-rating-model.js';
import { prepareBoostedMarketModel } from './boosted-market-model.js';

export interface ExpertTotalsSpec {
  learningRate: 16 | 64;
  share: 0.05 | 0.2;
  bookPrior: 0.5 | 0.8;
  seasonCarry: 0 | 0.25;
}
export interface ExpertTotalsRow {
  game: FootballGame;
  /** Book, slow totals tree, fast totals tree, existing production total. */
  probabilities: [number, number, number, number];
  y: number;
}
export const expertTotalsParameters = Object.freeze({
  maxRows: 10000,
  slowTree: Object.freeze({
    depth: 2,
    halfLifeDays: 730,
    features: 'market',
    rule: 'direct',
  } as const),
  fastTree: Object.freeze({
    depth: 2,
    halfLifeDays: 120,
    features: 'market',
    rule: 'direct',
  } as const),
});
/** Fixed-share-inspired, weekly exponential loss tracking of out-of-week experts.
 * Distribution changes alter model reliability rather than only a global intercept.
 */
export function prepareExpertTotalsAdapter(input: ExpertTotalsRow[], settings: ExpertTotalsSpec) {
  if (
    input.length > expertTotalsParameters.maxRows ||
    new Set(input.map((r) => r.game.id)).size !== input.length ||
    ![16, 64].includes(settings.learningRate) ||
    ![0.05, 0.2].includes(settings.share) ||
    ![0.5, 0.8].includes(settings.bookPrior) ||
    ![0, 0.25].includes(settings.seasonCarry) ||
    input.some(
      (r) =>
        r.probabilities.length !== 4 ||
        r.probabilities.some((p) => !Number.isFinite(p) || p <= 0 || p >= 1) ||
        ![0, 1].includes(r.y) ||
        !Number.isInteger(r.game.season) ||
        !Number.isInteger(r.game.week) ||
        r.game.week < 1 ||
        r.game.week > 18 ||
        r.game.seasonType !== 'REG' ||
        !Number.isFinite(Date.parse(r.game.date)),
    )
  )
    throw new Error('Invalid bounded expert totals data.');
  const spec = { ...settings },
    rows = structuredClone(input),
    cache = new Map<string, number[]>(),
    prior = [spec.bookPrior, ...Array<number>(3).fill((1 - spec.bookPrior) / 3)];
  function weights(origin: FootballGame) {
    const key = `${origin.season}:${origin.week}:${origin.date}`;
    const cached = cache.get(key);
    if (cached) return [...cached];
    const groups = new Map<string, ExpertTotalsRow[]>();
    for (const r of rows)
      if (earlierGame(r.game, origin) && r.game.season >= origin.season - 1) {
        const key = `${r.game.season}:${String(r.game.week).padStart(2, '0')}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
    let result: number[] = [...prior];
    let season: number | undefined;
    for (const [, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      if (season !== undefined && season !== group[0]!.game.season)
        result = result.map((w, i) => spec.seasonCarry * w + (1 - spec.seasonCarry) * prior[i]!);
      season = group[0]!.game.season;
      const losses = prior.map(
          (_, i) => group.reduce((s, r) => s + (r.probabilities[i]! - r.y) ** 2, 0) / group.length,
        ),
        minimum = Math.min(...losses),
        raw = result.map((w, i) => w * Math.exp(-spec.learningRate * (losses[i]! - minimum))),
        denominator = raw.reduce((s, w) => s + w, 0);
      result = raw.map((w, i) => ((1 - spec.share) * w) / denominator + spec.share * prior[i]!);
    }
    if (season !== undefined && season < origin.season)
      result = result.map((w, i) => spec.seasonCarry * w + (1 - spec.seasonCarry) * prior[i]!);
    cache.set(key, result);
    if (cache.size > 1024) cache.delete(cache.keys().next().value!);
    return [...result];
  }
  return {
    weights,
    probability(origin: FootballGame, probabilities: ExpertTotalsRow['probabilities']) {
      if (
        probabilities.length !== 4 ||
        probabilities.some((p) => !Number.isFinite(p) || p <= 0 || p >= 1)
      )
        throw new Error('Invalid expert probability query.');
      return weights(origin).reduce((s, w, i) => s + w * probabilities[i]!, 0);
    },
  };
}
/** Only total forecasting changes in this research dispatch. */
export function prepareExpertTotalsHybrid(model: GameRatingModel, spec: ExpertTotalsSpec) {
  const slow = prepareBoostedMarketModel(model, expertTotalsParameters.slowTree),
    fast = prepareBoostedMarketModel(model, expertTotalsParameters.fastTree),
    probabilities = (
      game: FootballGame,
      raw: number,
      book: number,
    ): ExpertTotalsRow['probabilities'] => [
      book,
      slow.probability('total', game, raw, book),
      fast.probability('total', game, raw, book),
      model.adjustJointAvailability('total', game, raw, book),
    ],
    rows = model.observations.flatMap((r) => {
      const q = r.markets.total;
      return q && !q.push
        ? [
            {
              game: r.game,
              probabilities: probabilities(r.game, q.raw, q.baseline),
              y: q.y,
            },
          ]
        : [];
    }),
    adapter = prepareExpertTotalsAdapter(rows, spec);
  return {
    probability(
      kind: 'moneyline' | 'spread' | 'total',
      origin: FootballGame,
      raw: number,
      book: number,
    ) {
      return kind === 'total'
        ? adapter.probability(origin, probabilities(origin, raw, book))
        : model.adjust(kind, origin, raw, book);
    },
  };
}
