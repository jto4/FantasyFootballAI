import {
  buildBetForecast,
  buildBetForecastLegacy,
  betForecastEvaluationQualified,
} from './bet-forecast.js';
import { gameForecastContext } from './market-game-forecast.js';
import { usablePregameContext } from './game-availability.js';
import { americanOdds } from './advice-math.js';
import type { FootballDataSnapshot, BetTerms } from './advice-types.js';
export interface MarketBacktest {
  method:
    | 'rolling-residual-v1'
    | 'market-regularized-v2'
    | 'market-context-v3'
    | 'health-weather-total-v4';
  strategy:
    | 'conservative-archive-v1'
    | 'conservative-archive-v2'
    | 'conservative-archive-v3'
    | 'conservative-archive-v4';
  asOf: string;
  publicationTimingVerified: false;
  seasons: {
    season: number;
    role: 'earlier' | 'later';
    markets: {
      kind: 'moneyline' | 'spread' | 'total';
      games: number;
      forecasts: number;
      brier?: number;
      marketBrier?: number;
      previousBrier?: number;
      priorMarketBrier?: number;
      priorMarketGames?: number;
      priorContextBrier?: number;
      priorContextGames?: number;
      availabilityAwareForecasts?: number;
      injuryContextGames?: number;
      weatherContextGames?: number;
      quarterbackChangeGames?: number;
      comparisonGames?: number;
      comparisonBrier?: number;
      scoredGames?: number;
      marketAwareForecasts?: number;
      marketImprovementInterval?: [number, number];
      selections: number;
      wins: number;
      losses: number;
      pushes: number;
      netUnits: number;
      roi?: number;
      weeks: number;
      roiInterval?: [number, number];
    }[];
  }[];
  warnings: string[];
}
/** Frozen existing method, earlier weeks only, actual archived prices, one selected side per game/market. */
export function evaluateArchivedMarkets(
  data: FootballDataSnapshot,
  seasons: [number, number],
  asOf: string,
): MarketBacktest {
  if (
    data.games.length > 10000 ||
    !/(?:Z|[+-]\d\d:\d\d)$/.test(asOf) ||
    !Number.isFinite(Date.parse(asOf)) ||
    seasons[1] !== seasons[0] + 1 ||
    seasons.some((s) => !Number.isInteger(s) || s < 2011 || s > 2099)
  )
    throw new Error('Choose bounded consecutive historical seasons.');
  const report: MarketBacktest = {
    method: data.games.some((g) => g.pregame) ? 'health-weather-total-v4' : 'market-context-v3',
    strategy: data.games.some((g) => g.pregame)
      ? 'conservative-archive-v4'
      : 'conservative-archive-v3',
    asOf,
    publicationTimingVerified: false,
    seasons: [],
    warnings: [
      'Retrospective archive-price simulation, not forward-recorded or realized betting profit. Quote-publication times, sportsbook identity and executable fills are unavailable in this archive.',
      'Method and conservative thresholds are fixed before evaluation. Prior-week fitting uses only earlier outcomes; completed seasons are reported separately. These historical outcomes existed when the method was developed; this is not an untouched or prospective holdout.',
      'One unit per selected market, at most one side per game/market. Ties/pushes refund the stake; fees, taxes and slippage are excluded. Correlated markets are grouped by NFL week for uncertainty.',
      'The improved game model uses sportsbook odds as an explicit input with opponent-adjusted score ratings and regularized earlier-week corrections. Book probabilities are the matched baseline; this is not independent market prediction. Current AI judgments and public fantasy projections are not retrospectively reconstructed.',
      'V4 only changes totals: older 2018–2021 tests selected extra injury/chart/weather inputs for totals and retained v3 moneyline/spread probabilities. Dated reports and captured charts exclude future updates; weather uses 48-hour-lead regional forecasts with an estimated availability bound. Missing context retains v3. Recent archives are reused evidence, not prospective profit.',
      'V3 context/blend rules were selected on 2016–2021 development seasons before the v3 audit. The 2022–2025 archive has already been examined for v2 and is reused evidence, not a fresh holdout; future profitability remains unestablished.',
    ],
  };
  const prepared = gameForecastContext(data.games);
  for (const season of seasons) {
    const markets: MarketBacktest['seasons'][number]['markets'] = [];
    for (const kind of ['moneyline', 'spread', 'total'] as const) {
      let games = 0,
        forecasts = 0,
        brierSum = 0,
        marketSum = 0,
        scored = 0,
        previousSum = 0,
        priorMarketSum = 0,
        priorMarketGames = 0,
        priorContextSum = 0,
        priorContextGames = 0,
        availabilityAwareForecasts = 0,
        injuryContextGames = 0,
        weatherContextGames = 0,
        quarterbackChangeGames = 0,
        comparisonSum = 0,
        comparisonGames = 0,
        marketAwareForecasts = 0,
        netUnits = 0,
        wins = 0,
        losses = 0,
        pushes = 0,
        selections = 0;
      const groups = new Map<number, { profit: number; stake: number }>();
      const lossWeeks = new Map<number, { sum: number; games: number }>();
      const targets = data.games.filter(
        (g) =>
          g.season === season &&
          g.seasonType === 'REG' &&
          g.week <= 18 &&
          g.kickoffAt &&
          Date.parse(g.kickoffAt) < Date.parse(asOf) &&
          Number.isInteger(g.homeScore) &&
          Number.isInteger(g.awayScore) &&
          g.archivedOdds,
      );
      for (const g of targets) {
        if (data.games.filter((x) => x.id === g.id).length !== 1) continue;
        const prices = g.archivedOdds!;
        const first =
          kind === 'moneyline'
            ? prices.homeMoneyline
            : kind === 'spread'
              ? prices.homeSpreadOdds
              : prices.overOdds;
        const second =
          kind === 'moneyline'
            ? prices.awayMoneyline
            : kind === 'spread'
              ? prices.awaySpreadOdds
              : prices.underOdds;
        if (
          first === undefined ||
          second === undefined ||
          (kind === 'spread' && g.spreadLine === undefined) ||
          (kind === 'total' && g.totalLine === undefined)
        )
          continue;
        games++;
        const observation = new Date(Date.parse(g.kickoffAt!) - 1000).toISOString();
        const target = { ...g };
        delete target.homeScore;
        delete target.awayScore;
        const historical = {
          ...data,
          players: [],
          games: data.games.map((x) => (x.id === g.id ? target : x)),
        };
        const evaluated = [];
        for (const i of [0, 1]) {
          const terms: BetTerms = {
            kind,
            gameId: g.id,
            side: kind === 'total' ? (i ? 'under' : 'over') : i ? 'away' : 'home',
            americanOdds: i ? second : first,
            oppositeAmericanOdds: i ? first : second,
            ...(kind === 'moneyline'
              ? {}
              : { line: kind === 'spread' ? (i ? g.spreadLine! : -g.spreadLine!) : g.totalLine! }),
          };
          const forecast = buildBetForecast(terms, historical, observation, prepared).forecast;
          if (!forecast) continue;
          let difference =
            kind === 'total' ? g.homeScore! + g.awayScore! : g.homeScore! - g.awayScore!;
          if (kind === 'total')
            difference = i ? terms.line! - difference : difference - terms.line!;
          else {
            if (i) difference = -difference;
            if (kind === 'spread') difference += terms.line!;
          }
          const outcome = Math.sign(difference),
            odds = americanOdds(terms.americanOdds),
            opposite = americanOdds(terms.oppositeAmericanOdds!);
          if (i === 0) {
            forecasts++;
            if (forecast.method !== 'rolling-residual-v1') marketAwareForecasts++;
            if (forecast.method === 'health-weather-total-v4') availabilityAwareForecasts++;
            if (outcome !== 0) {
              const actual = outcome === 1 ? 1 : 0;
              scored++;
              const loss = (forecast.probability - actual) ** 2,
                marketLoss =
                  (odds.breakEvenRate / (odds.breakEvenRate + opposite.breakEvenRate) - actual) **
                  2;
              const priorRow = prepared.observations.find((r) => r.game.id === g.id)?.markets[kind];
              if (priorRow && !priorRow.push) {
                const priorProbability = prepared.adjustV2(
                  kind,
                  priorRow.game,
                  priorRow.raw,
                  priorRow.baseline,
                );
                priorMarketSum += (priorProbability - actual) ** 2;
                priorMarketGames++;
                const v3 = prepared.adjust(kind, priorRow.game, priorRow.raw, priorRow.baseline);
                priorContextSum += (v3 - actual) ** 2;
                priorContextGames++;
                const context = usablePregameContext(priorRow.game);
                if (context?.home.reportUpdatedAt && context.away.reportUpdatedAt)
                  injuryContextGames++;
                if (context?.weather) weatherContextGames++;
                if (context?.home.quarterbackChanged || context?.away.quarterbackChanged)
                  quarterbackChangeGames++;
              }
              brierSum += loss;
              marketSum += marketLoss;
              const w = lossWeeks.get(g.week) ?? { sum: 0, games: 0 };
              w.sum += marketLoss - loss;
              w.games++;
              lossWeeks.set(g.week, w);
              const previous = buildBetForecastLegacy(terms, historical, observation).forecast;
              if (previous) {
                previousSum += (previous.probability - actual) ** 2;
                comparisonSum += loss;
                comparisonGames++;
              }
            }
          }
          const threshold = odds.breakEvenRate + 0.02 / Math.max(0.01, 1 - forecast.pushRate);
          evaluated.push({
            outcome,
            profit: outcome > 0 ? odds.profitPerUnit : outcome < 0 ? -1 : 0,
            edge: forecast.lower - threshold,
            qualified: betForecastEvaluationQualified(forecast) && forecast.lower > threshold,
          });
        }
        const selected = evaluated.filter((x) => x.qualified).sort((a, b) => b.edge - a.edge)[0];
        if (!selected) continue;
        selections++;
        netUnits += selected.profit;
        if (selected.outcome > 0) wins++;
        else if (selected.outcome < 0) losses++;
        else pushes++;
        const w = groups.get(g.week) ?? { profit: 0, stake: 0 };
        w.profit += selected.profit;
        w.stake++;
        groups.set(g.week, w);
      }
      const roi = selections ? netUnits / selections : undefined;
      const improvement = scored ? (marketSum - brierSum) / scored : 0;
      const lossSe =
        scored && lossWeeks.size >= 8
          ? Math.sqrt(
              (lossWeeks.size / (lossWeeks.size - 1)) *
                [...lossWeeks.values()].reduce(
                  (s, w) => s + (w.sum - improvement * w.games) ** 2,
                  0,
                ),
            ) / scored
          : undefined;
      const se =
        roi !== undefined && groups.size >= 8
          ? Math.sqrt(
              (groups.size / (groups.size - 1)) *
                [...groups.values()].reduce((s, w) => s + (w.profit - roi * w.stake) ** 2, 0),
            ) / selections
          : undefined;
      markets.push({
        kind,
        games,
        forecasts,
        ...(scored ? { brier: brierSum / scored, marketBrier: marketSum / scored } : {}),
        ...(comparisonGames
          ? {
              previousBrier: previousSum / comparisonGames,
              comparisonBrier: comparisonSum / comparisonGames,
              comparisonGames,
            }
          : {}),
        marketAwareForecasts,
        priorMarketGames,
        priorContextGames,
        ...(priorContextGames ? { priorContextBrier: priorContextSum / priorContextGames } : {}),
        availabilityAwareForecasts,
        injuryContextGames,
        weatherContextGames,
        quarterbackChangeGames,
        ...(priorMarketGames ? { priorMarketBrier: priorMarketSum / priorMarketGames } : {}),
        scoredGames: scored,
        ...(lossSe === undefined
          ? {}
          : {
              marketImprovementInterval: [
                improvement - 1.96 * lossSe,
                improvement + 1.96 * lossSe,
              ] as [number, number],
            }),
        selections,
        wins,
        losses,
        pushes,
        netUnits,
        ...(roi === undefined ? {} : { roi }),
        weeks: groups.size,
        ...(se === undefined || roi === undefined
          ? {}
          : { roiInterval: [roi - 1.96 * se, roi + 1.96 * se] }),
      });
    }
    report.seasons.push({ season, role: season === seasons[1] ? 'later' : 'earlier', markets });
  }
  const measured = report.seasons
    .flatMap((s) => s.markets)
    .filter((m) => m.brier !== undefined && m.marketBrier !== undefined);
  if (measured.length && measured.every((m) => m.brier! >= m.marketBrier!))
    report.warnings.push(
      'The evaluated model did not beat the sportsbook probability baseline in any measured market/season. This test does not demonstrate an accuracy advantage.',
    );
  else if (measured.length)
    report.warnings.push(
      'Lower sample error in some markets is not a reliable edge by itself. Inspect paired weekly improvement intervals; intervals spanning zero do not establish a sportsbook accuracy advantage.',
    );
  return report;
}
