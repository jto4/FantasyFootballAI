import { PublicFootballData } from '../packages/integrations/dist/index.js';
import { buildBetForecast, betForecastQualified } from '../packages/core/dist/index.js';

// Opt-in public-data evaluation only: no settings, credentials, AI generation or bets.
const now = new Date();
const season = now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
const data = await new PublicFootballData().get(season);
const asOf = new Date().toISOString();
const target = data.games
  .filter(
    (game) =>
      game.season === season &&
      game.seasonType === 'REG' &&
      game.week <= 18 &&
      game.date >= asOf.slice(0, 10) &&
      game.homeScore === undefined &&
      game.awayScore === undefined,
  )
  .sort((a, b) => a.date.localeCompare(b.date))[0];
if (!target)
  throw new Error('No upcoming regular-season game is available for this live evaluation.');
for (const scenario of [
  { kind: 'moneyline', side: 'home' },
  { kind: 'spread', side: 'home', line: -3.5 },
  { kind: 'total', side: 'over', line: 44.5 },
]) {
  const terms = { ...scenario, gameId: target.id, americanOdds: -110 };
  const start = performance.now();
  const result = buildBetForecast(terms, data, asOf);
  console.log(
    JSON.stringify({
      method: 'rolling-residual-v1',
      asOf,
      game: target.id,
      scenario: terms,
      scenarioIsCurrentMarketPrice: false,
      forecast: result.forecast ?? null,
      qualified: result.forecast ? betForecastQualified(result.forecast) : false,
      evaluationCases: result.evaluationCases.length,
      elapsedMs: Math.round(performance.now() - start),
      warnings: result.warnings,
    }),
  );
}
