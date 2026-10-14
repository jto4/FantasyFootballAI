import type { FootballGame } from './advice-types.js';
import { nflTeamKey } from './advice-math.js';

export const marketContextParameters = Object.freeze({
  restCapDays: 14,
  residualHalfLifeDays: 120,
  teamResidualRidge: 8,
  residualCapPoints: 35,
  adaptiveRidge: 1,
});
const clip = (x: number, limit: number) => Math.max(-limit, Math.min(limit, x));
export interface PriorMarketContext {
  restDifference: number;
  restTotal: number;
  teamMargin: number;
  teamTotal: number;
}
/** Derived from earlier completed weeks. Archive QB/weather columns are deliberately not treated as pregame information. */
export function priorMarketContext(
  games: FootballGame[],
  origin: FootballGame,
): PriorMarketContext {
  const home = nflTeamKey(origin.home),
    away = nflTeamKey(origin.away),
    prior = games.filter(
      (g) =>
        g.date < origin.date &&
        (g.season < origin.season || (g.season === origin.season && g.week < origin.week)) &&
        g.season >= origin.season - 1 &&
        Number.isInteger(g.homeScore) &&
        Number.isInteger(g.awayScore),
    );
  const days = (team: string) => {
    const last = prior
      .filter((g) => nflTeamKey(g.home) === team || nflTeamKey(g.away) === team)
      .reduce<FootballGame | undefined>((a, b) => (!a || b.date > a.date ? b : a), undefined);
    return last
      ? Math.min(
          marketContextParameters.restCapDays,
          (Date.parse(origin.date) - Date.parse(last.date)) / 86400000,
        )
      : 7;
  };
  const residual = (team: string, total: boolean) => {
    let weight = marketContextParameters.teamResidualRidge,
      sum = 0;
    for (const g of prior) {
      const h = nflTeamKey(g.home),
        a = nflTeamKey(g.away);
      if (h !== team && a !== team) continue;
      const line = total ? g.totalLine : g.spreadLine;
      if (line === undefined || !Number.isFinite(line)) continue;
      const w =
        2 **
        (-(Date.parse(origin.date) - Date.parse(g.date)) /
          86400000 /
          marketContextParameters.residualHalfLifeDays);
      const error = total
        ? g.homeScore! + g.awayScore! - line
        : (g.homeScore! - g.awayScore! - line) * (h === team ? 1 : -1);
      weight += w;
      sum += w * clip(error, marketContextParameters.residualCapPoints);
    }
    return sum / weight;
  };
  const h = days(home),
    a = days(away);
  return {
    restDifference: (h - a) / 7,
    restTotal: (h + a - 14) / 14,
    teamMargin: (residual(home, false) - residual(away, false)) / 14,
    teamTotal: (residual(home, true) + residual(away, true)) / 14,
  };
}
/** Past-only Brier-optimal blend, with a fixed penalty toward the sportsbook. This can abstain from all correction. */
export function correctionWeight(
  rows: { probability: number; baseline: number; outcome: number }[],
) {
  let numerator = 0,
    denominator = marketContextParameters.adaptiveRidge;
  for (const r of rows) {
    const difference = r.probability - r.baseline;
    numerator += difference * (r.outcome - r.baseline);
    denominator += difference * difference;
  }
  return Math.max(0, Math.min(1, numerator / denominator));
}
