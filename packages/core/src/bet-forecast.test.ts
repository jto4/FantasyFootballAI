import { expect, it } from 'vitest';
import { buildBetForecast, betForecastQualified } from './bet-forecast.js';
import type { BetTerms, FootballDataSnapshot } from './advice-types.js';

const asOf = '2026-10-07T12:00:00Z';
function fixture(): FootballDataSnapshot {
  const games: FootballDataSnapshot['games'] = [];
  for (const season of [2025, 2026])
    for (let week = 1; week <= (season === 2025 ? 18 : 4); week++)
      for (let i = 0; i < 16; i++) {
        const opponent = (i + week) % 16;
        const date = new Date(Date.UTC(season, 8, 1 + (week - 1) * 7)).toISOString().slice(0, 10);
        games.push({
          id: `${season}-${week}-${i}`,
          season,
          week,
          seasonType: 'REG',
          date,
          home: `A${i}`,
          away: `B${opponent}`,
          homeScore: 20 + i + (week % 3),
          awayScore: 20 + opponent + ((week + i) % 4),
        });
      }
  games.push({
    id: 'target',
    season: 2026,
    week: 5,
    seasonType: 'REG',
    date: '2026-10-11',
    home: 'A15',
    away: 'B0',
  });
  return {
    season: 2026,
    games,
    players: [],
    market: [],
    warnings: [],
    sources: [
      { id: 'games', name: 'Games', status: 'available', retrievedAt: asOf },
      { id: 'stats-2025', name: 'Stats', status: 'available', retrievedAt: asOf },
      { id: 'stats-2026', name: 'Stats', status: 'available', retrievedAt: asOf },
    ],
  };
}
const terms: BetTerms = { gameId: 'target', kind: 'moneyline', side: 'home', americanOdds: -110 };
it('produces source-linked numerical forecasts and chronological evaluation without future/target outcomes', () => {
  const data = fixture(),
    result = buildBetForecast(terms, data, asOf);
  expect(result.forecast?.residualSamples).toBeGreaterThan(100);
  expect(result.forecast?.evaluation.games).toBe(result.evaluationCases.length);
  expect(result.forecast?.probability).toBeGreaterThan(0.5);
  expect(result.metrics.find((row) => row.id === 'bet-model-return')?.sourceIds).toContain(
    'entered-odds',
  );
  const extra = {
    ...data.games[0]!,
    id: 'future',
    season: 2026,
    week: 6,
    date: '2026-10-18',
    homeScore: 100,
  };
  data.games.push(
    extra,
    { ...extra, id: 'postseason', seasonType: 'POST', date: '2026-01-05' },
    { ...extra, id: 'old', season: 2024, date: '2024-10-05' },
  );
  expect(buildBetForecast(terms, data, asOf)).toEqual(result);
});
it('fits every evaluated probability before seeing that game or later weeks', () => {
  const data = fixture(),
    original = buildBetForecast(terms, data, asOf);
  const cutoff = original.evaluationCases.find((row) => row.season === 2025 && row.week === 15)!;
  for (const game of data.games)
    if (game.season === 2025 && game.week >= 15 && game.homeScore !== undefined)
      game.homeScore = 80;
  const changed = buildBetForecast(terms, data, asOf);
  const early = original.evaluationCases.filter((row) => row.season === 2025 && row.week <= 15);
  for (const row of early)
    expect(changed.evaluationCases.find((next) => next.gameId === row.gameId)?.probability).toBe(
      row.probability,
    );
  expect(
    changed.evaluationCases.find((row) => row.gameId === cutoff.gameId)?.outcome,
  ).not.toBeUndefined();
});
it('deduplicates identical games and removes conflicting identities rather than inflating samples', () => {
  const data = fixture(),
    original = buildBetForecast(terms, data, asOf);
  data.games.push({ ...data.games[0]! });
  expect(buildBetForecast(terms, data, asOf)).toEqual(original);
  const without = fixture();
  without.games = without.games.filter((game) => game.id !== data.games[0]!.id);
  data.games.push({ ...data.games[0]!, homeScore: 90 });
  expect(buildBetForecast(terms, data, asOf)).toEqual(buildBetForecast(terms, without, asOf));
});
it('handles spread/total/away prices, missing form, unavailable/stale metadata and explicit pushes', () => {
  const data = fixture();
  for (const bet of [
    { ...terms, kind: 'spread' as const, line: -3.5 },
    { ...terms, kind: 'total' as const, side: 'under' as const, line: 50.5 },
    { ...terms, side: 'away' as const },
  ]) {
    const f = buildBetForecast(bet, data, asOf).forecast!;
    expect(f.lower).toBeLessThanOrEqual(f.probability);
    expect(f.upper).toBeGreaterThanOrEqual(f.probability);
    expect(f.evaluation.brier).toBeGreaterThanOrEqual(0);
    expect(f.evaluation.brier).toBeLessThanOrEqual(1);
  }
  data.sources[0]!.retrievedAt = '2026-09-01T00:00:00Z';
  const stale = buildBetForecast(terms, data, asOf).forecast!;
  expect(stale.fresh).toBe(false);
  expect(betForecastQualified(stale)).toBe(false);
  const missing = fixture();
  missing.games = missing.games.filter((game) => game.home !== 'A15' || game.id === 'target');
  expect(buildBetForecast(terms, missing, asOf).forecast).toBeUndefined();
});
it('keeps player-prop errors tied to verified player/game identities and excludes duplicate game samples', () => {
  const data = fixture();
  data.players = data.games
    .filter((game) => game.home === 'A15' && game.homeScore !== undefined)
    .map((game) => ({
      playerId: 'gsis',
      name: 'Player',
      position: 'WR',
      team: game.home,
      opponent: game.away,
      gameId: game.id,
      season: game.season,
      week: game.week,
      seasonType: 'REG',
      stats: { receptions: (game.week % 5) + 3 },
    }));
  // Two seasons alone can be too short for this player's required error distribution.
  const prop = {
    ...terms,
    kind: 'player-prop' as const,
    side: 'over' as const,
    playerId: 'gsis',
    stat: 'receptions' as const,
    line: 4.5,
  };
  expect(buildBetForecast(prop, data, asOf).forecast).toBeUndefined();
  expect(buildBetForecast({ ...prop, playerId: 'different' }, data, asOf).forecast).toBeUndefined();
});
