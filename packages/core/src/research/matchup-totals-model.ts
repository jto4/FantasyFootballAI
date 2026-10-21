import {
  earlierGame,
  fitOffsetFeatures,
  type GameRatingModel,
  type MarketObservation,
} from '../game-rating-model.js';
import { fitBoostedMarket } from './boosted-market-model.js';
import { prepareTeamTotalSignals, type TeamTotalStats } from '../team-total-signals.js';

export interface MatchupTotalsSpec {
  halfLifeDays: 120 | 365;
  signals: boolean;
  method: 'tree' | 'ridge';
}
export const matchupTotalsParameters = Object.freeze({
  depth: 2 as const,
  labelHalfLifeDays: 730,
  labelSeasons: 4,
  linearPenalty: 200,
  linearLabelWeights: 'uniform',
  signalScales: [0.1, 0.2, 0.2, 0.2, 0.05, 0.1, 0.2, 0.1, 0.2, 0.2, 1, 1],
  maxLinearLogitCorrection: 0.5,
});
const logit = (p: number) => Math.log(p / (1 - p));
const clip = (x: number) => Math.max(-4, Math.min(4, x));
/** Retains the slow expert's tree capacity; a ridge alternative tests smooth matchup effects.
 * No moneyline/spread method exists, so research callers keep their original adjustment.
 */
export function prepareMatchupTotalsModel(
  model: GameRatingModel,
  stats: TeamTotalStats[],
  spec: MatchupTotalsSpec,
) {
  const signals = prepareTeamTotalSignals(
    model.observations.map((r) => r.game),
    stats,
    spec.halfLifeDays,
  );
  const featureCache = new Map<string, number[]>();
  const fits = new Map<string, ReturnType<typeof fitBoostedMarket>>();
  function features(q: MarketObservation) {
    let x = featureCache.get(q.game.id);
    if (x) return x;
    const c = q.context;
    x = [
      logit(q.baseline),
      clip(logit(q.raw) - logit(q.baseline)),
      (q.game.week - 9) / 9,
      ((q.game.totalLine ?? 45) - 45) / 10,
      c.restDifference,
      c.restTotal,
      c.teamMargin,
      c.teamTotal,
    ];
    if (spec.signals)
      x.push(
        ...signals
          .features(q.game)
          .x.map((v, i) => clip(v / matchupTotalsParameters.signalScales[i]!)),
      );
    if (spec.method === 'ridge') x.unshift(1);
    featureCache.set(q.game.id, x);
    return x;
  }
  return {
    signals,
    probability(q: MarketObservation) {
      const origin = q.game,
        key = `${origin.season}:${origin.week}:${origin.date}`;
      let fit = fits.get(key);
      if (!fit) {
        const rows = model.observations.flatMap((r) => {
          const t = r.markets.total;
          return t &&
            !t.push &&
            earlierGame(r.game, origin) &&
            r.game.season >= origin.season - matchupTotalsParameters.labelSeasons
            ? [
                {
                  x: features(t),
                  book: t.baseline,
                  y: t.y,
                  weight:
                    2 **
                    (-(Date.parse(origin.date) - Date.parse(r.game.date)) /
                      86400000 /
                      matchupTotalsParameters.labelHalfLifeDays),
                },
              ]
            : [];
        });
        if (spec.method === 'tree') fit = fitBoostedMarket(rows, matchupTotalsParameters.depth);
        else {
          const c = fitOffsetFeatures(
            rows.map((r) => ({ offset: logit(r.book), x: r.x, y: r.y })),
            matchupTotalsParameters.linearPenalty,
            spec.signals ? 21 : 9,
          );
          fit = (x, book) => {
            const correction = Math.max(
              -matchupTotalsParameters.maxLinearLogitCorrection,
              Math.min(
                matchupTotalsParameters.maxLinearLogitCorrection,
                c.reduce((s, v, i) => s + v * x[i]!, 0),
              ),
            );
            return 1 / (1 + Math.exp(-(logit(book) + correction)));
          };
        }
        fits.set(key, fit);
        if (fits.size > 1024) fits.delete(fits.keys().next().value!);
      }
      return fit(features(q), q.baseline);
    },
  };
}
