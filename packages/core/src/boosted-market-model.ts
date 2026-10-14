import { priorMarketContext } from './market-context.js';
import type { FootballGame } from './advice-types.js';
import {
  availabilityFeatures,
  richPersonnelFeatures,
  usablePregameContext,
} from './game-availability.js';
import { earlierGame, type GameRatingModel, type MarketObservation } from './game-rating-model.js';

type Kind = 'moneyline' | 'spread' | 'total';
export interface BoostedMarketSpec {
  depth: 1 | 2;
  halfLifeDays: 120 | 730;
  features: 'market' | 'all';
  rule: 'direct' | 'adaptive-book';
}
export const boostedMarketParameters = Object.freeze({
  rounds: 20,
  learningRate: 0.05,
  leafPenalty: 20,
  minLeaf: 60,
  minTrain: 200,
  fitSeasons: 4,
  maxLogitCorrection: 0.5,
  blendSeasons: 2,
  blendPenalty: 1,
});
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));
const clip = (v: number, n: number) => Math.max(-n, Math.min(n, v));
interface Row {
  x: number[];
  book: number;
  y: number;
  weight: number;
}
export type MarketTree =
  | { value: number }
  | {
      feature: number;
      threshold: number;
      left: MarketTree;
      right: MarketTree;
    };
const treeValue = (tree: MarketTree, x: number[]): number =>
  'value' in tree
    ? tree.value
    : treeValue(x[tree.feature]! <= tree.threshold ? tree.left : tree.right, x);
/** Deterministic, shallow Newton trees fit a regularized correction to the book logit.
 * Thresholds depend only on training covariates; no target labels or stochastic library state.
 */
export function fitBoostedMarket(rows: Row[], depth: 1 | 2) {
  const p = boostedMarketParameters;
  if (
    rows.length > 2000 ||
    rows.some(
      (r) =>
        !Number.isFinite(r.book) ||
        r.book <= 0 ||
        r.book >= 1 ||
        ![0, 1].includes(r.y) ||
        !Number.isFinite(r.weight) ||
        r.weight <= 0 ||
        r.x.length !== rows[0]!.x.length ||
        r.x.length > 64 ||
        r.x.some((v) => !Number.isFinite(v)),
    )
  )
    throw new Error('Invalid bounded boosting training rows.');
  if (rows.length < p.minTrain) return (_x: number[], book: number) => book;
  const dimensions = rows[0]!.x.length,
    scores = rows.map((r) => logit(r.book)),
    trees: MarketTree[] = [],
    cuts = Array.from({ length: dimensions }, (_, i) => {
      const sorted = rows.map((r) => r.x[i]!).sort((a, b) => a - b);
      return [
        ...new Set([0.2, 0.4, 0.6, 0.8].map((q) => sorted[Math.floor(q * (sorted.length - 1))]!)),
      ].filter((v) => v < sorted.at(-1)!);
    });
  for (let round = 0; round < p.rounds; round++) {
    const gradient = rows.map((r, i) => r.weight * (r.y - sigmoid(scores[i]!))),
      hessian = rows.map((r, i) => {
        const q = sigmoid(scores[i]!);
        return r.weight * q * (1 - q);
      });
    const build = (ids: number[], remaining: number): MarketTree => {
      const sumG = ids.reduce((s, i) => s + gradient[i]!, 0),
        sumH = ids.reduce((s, i) => s + hessian[i]!, 0),
        leaf = { value: clip(sumG / (sumH + p.leafPenalty), 1) },
        parent = (sumG * sumG) / (sumH + p.leafPenalty);
      if (!remaining || ids.length < 2 * p.minLeaf) return leaf;
      let best: { feature: number; threshold: number; left: number[]; right: number[] } | undefined,
        gain = 0;
      for (let feature = 0; feature < dimensions; feature++)
        for (const threshold of cuts[feature]!) {
          let g = 0,
            h = 0,
            n = 0;
          for (const i of ids)
            if (rows[i]!.x[feature]! <= threshold) {
              g += gradient[i]!;
              h += hessian[i]!;
              n++;
            }
          if (n < p.minLeaf || ids.length - n < p.minLeaf) continue;
          const improvement =
            (g * g) / (h + p.leafPenalty) + (sumG - g) ** 2 / (sumH - h + p.leafPenalty) - parent;
          if (improvement > gain + 1e-12) {
            gain = improvement;
            best = {
              feature,
              threshold,
              left: ids.filter((i) => rows[i]!.x[feature]! <= threshold),
              right: ids.filter((i) => rows[i]!.x[feature]! > threshold),
            };
          }
        }
      return best
        ? {
            feature: best.feature,
            threshold: best.threshold,
            left: build(best.left, remaining - 1),
            right: build(best.right, remaining - 1),
          }
        : leaf;
    };
    const tree = build(
      rows.map((_, i) => i),
      depth,
    );
    trees.push(tree);
    rows.forEach((r, i) => {
      scores[i]! += p.learningRate * treeValue(tree, r.x);
    });
  }
  return (x: number[], book: number) =>
    sigmoid(
      logit(book) +
        clip(
          trees.reduce((s, t) => s + p.learningRate * treeValue(t, x), 0),
          p.maxLogitCorrection,
        ),
    );
}
function features(
  kind: Kind,
  r: Pick<MarketObservation, 'game' | 'raw' | 'baseline' | 'context'>,
  spec: BoostedMarketSpec,
) {
  const g = r.game,
    b = logit(r.baseline),
    c = r.context;
  const x = [
    b,
    clip(logit(r.raw) - b, 4),
    (g.week - 9) / 9,
    kind === 'total'
      ? ((g.totalLine ?? 45) - 45) / 10
      : kind === 'spread'
        ? (g.spreadLine ?? 0) / 10
        : Math.abs(b),
    c.restDifference,
    c.restTotal,
    c.teamMargin,
    c.teamTotal,
  ];
  if (spec.features === 'all') {
    const p = usablePregameContext(g);
    x.push(
      ...availabilityFeatures(kind, g),
      ...richPersonnelFeatures(kind, g),
      Number(!!p?.home.reportUpdatedAt && !!p?.away.reportUpdatedAt),
      Number(!!p?.weather),
      Number(
        p?.home.personnel?.quarterbackEpa !== undefined &&
          p?.away.personnel?.quarterbackEpa !== undefined,
      ),
      Number(
        p?.home.personnel?.offenseLimitedSnaps !== undefined &&
          p?.away.personnel?.offenseLimitedSnaps !== undefined,
      ),
    );
  }
  return x;
}
/** Research-only weekly walk-forward model, replacing linear v3/v4 corrections rather than stacking on them. */
export function prepareBoostedMarketModel(model: GameRatingModel, spec: BoostedMarketSpec) {
  const fits = new Map<string, ReturnType<typeof fitBoostedMarket>>(),
    predictions = new Map<string, number>(),
    blends = new Map<string, number>();
  const prior = (kind: Kind, origin: FootballGame, seasons: number) =>
    model.observations.flatMap((r) =>
      earlierGame(r.game, origin) &&
      r.game.season >= origin.season - seasons &&
      r.markets[kind] &&
      !r.markets[kind]!.push
        ? [r.markets[kind]!]
        : [],
    );
  function direct(kind: Kind, origin: FootballGame, raw: number, baseline: number) {
    const key = `${kind}:${origin.season}:${origin.week}:${origin.date}`;
    let fit = fits.get(key);
    if (!fit) {
      const rows = prior(kind, origin, boostedMarketParameters.fitSeasons).map((r) => ({
        x: features(kind, r, spec),
        book: r.baseline,
        y: r.y,
        weight:
          2 **
          (-(Date.parse(origin.date) - Date.parse(r.game.date)) / 86400000 / spec.halfLifeDays),
      }));
      fit = fitBoostedMarket(rows, spec.depth);
      fits.set(key, fit);
      if (fits.size > 1024) fits.delete(fits.keys().next().value!);
    }
    return fit(
      features(kind, { game: origin, raw, baseline, context: contextFor(origin) }, spec),
      baseline,
    );
  }
  const contexts = new Map(
    model.observations.flatMap((r) =>
      Object.values(r.markets)
        .slice(0, 1)
        .map((q) => [r.game.id, q.context] as const),
    ),
  );
  function contextFor(g: FootballGame) {
    return (
      contexts.get(g.id) ??
      priorMarketContext(
        model.observations.map((r) => r.game),
        g,
      )
    );
  }
  return {
    probability(kind: Kind, origin: FootballGame, raw: number, baseline: number) {
      const candidate = direct(kind, origin, raw, baseline);
      if (spec.rule === 'direct') return candidate;
      const key = `${kind}:${origin.season}:${origin.week}:${origin.date}`;
      let weight = blends.get(key);
      if (weight === undefined) {
        let numerator = 0,
          denominator = boostedMarketParameters.blendPenalty;
        for (const r of prior(kind, origin, boostedMarketParameters.blendSeasons)) {
          const id = `${kind}:${r.game.id}`;
          let p = predictions.get(id);
          if (p === undefined) {
            p = direct(kind, r.game, r.raw, r.baseline);
            predictions.set(id, p);
          }
          const w =
              2 **
              (-(Date.parse(origin.date) - Date.parse(r.game.date)) / 86400000 / spec.halfLifeDays),
            d = p - r.baseline;
          numerator += w * d * (r.y - r.baseline);
          denominator += w * d * d;
        }
        weight = clip(numerator / denominator, 1);
        weight = Math.max(0, weight);
        blends.set(key, weight);
        if (blends.size > 1024) blends.delete(blends.keys().next().value!);
        if (predictions.size > 30000) predictions.delete(predictions.keys().next().value!);
      }
      return baseline + weight * (candidate - baseline);
    },
  };
}
