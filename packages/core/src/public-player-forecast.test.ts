import { expect, it } from 'vitest';
import type { LeagueConnection, RosterPlayer } from './domain-types.js';
import type { FootballDataSnapshot } from './advice-types.js';
import { preparePublicPlayerForecast } from './public-player-forecast.js';
import { buildPlayerEvidence } from './player-evidence.js';

const player: RosterPlayer = {
  id: 'rookie',
  espnId: '12345',
  name: 'Fictional Rookie',
  position: 'WR',
  nflTeam: 'BUF',
};
const league: LeagueConnection = {
  id: 'league',
  platform: 'sleeper',
  season: 2026,
  name: 'Test',
  displayName: 'Test',
  connectedAt: '2026-09-01',
  teamCount: 2,
  teams: [],
  settings: {},
  scoring: { rec: 1, rec_yd: 0.1 },
};
const target = { season: 2026, week: 5, asOf: '2026-10-07T12:00:00.000Z' };
const source = 'espn-forecasts-2026-0';
function fixture(preseason = false): FootballDataSnapshot {
  const asOf = preseason ? '2026-09-01T12:00:00.000Z' : target.asOf;
  const data: FootballDataSnapshot = {
    season: 2026,
    players: [],
    games: [],
    market: [],
    warnings: [],
    playerForecasts: [],
    sources: ['games', source, 'stats-2026'].map((id) => ({
      id,
      name: id,
      status: 'available',
      retrievedAt: asOf,
    })),
  };
  for (let week = 1; week <= 18; week++) {
    data.playerForecasts!.push({
      espnId: '12345',
      name: player.name,
      team: 'BUF',
      position: 'WR',
      season: 2026,
      week,
      issuedWeek: preseason ? 0 : 5,
      sourceId: source,
      stats: { receptions: 4, receiving_yards: week * 10 },
    });
    if (week === 10) continue;
    const complete = !preseason && week < 5;
    const game = {
      id: `game-${week}`,
      season: 2026,
      week,
      seasonType: 'REG',
      date: new Date(Date.UTC(2026, 8, 13) + (week - 1) * 7 * 86400000).toISOString().slice(0, 10),
      home: 'BUF',
      away: 'MIA',
      ...(complete ? { homeScore: 20, awayScore: 10 } : {}),
    };
    data.games.push(game);
    if (complete)
      data.players.push({
        playerId: '00-0040000',
        name: player.name,
        position: 'WR',
        team: 'BUF',
        opponent: 'MIA',
        gameId: game.id,
        season: 2026,
        week,
        seasonType: 'REG',
        stats: { receptions: 1, receiving_yards: 20 },
      });
  }
  return data;
}
it('scores weekly expectations under the league rules without prior NFL history and gives imports priority', () => {
  const data = fixture();
  data.players = [];
  const input = {
    ...target,
    league,
    players: [player],
    projections: [],
    data,
    scope: 'week' as const,
  };
  const evidence = buildPlayerEvidence(input)[0]!;
  expect(evidence.projectedPoints).toBe(9);
  expect(evidence.historicalPoints).toEqual([]);
  expect(evidence.projectionMethod).toBe('public-projection-v1');
  expect(evidence.projectionPeriod).toEqual({ season: 2026, fromWeek: 5, throughWeek: 5 });
  expect(
    evidence.metrics.find((metric) => metric.id.endsWith(':forecast-receiving_yards')),
  ).toMatchObject({ value: 50, sourceIds: [source] });
  expect(evidence.warnings.join(' ')).toContain('not the publisher');
  const imported = buildPlayerEvidence({
    ...input,
    projections: [
      {
        id: 'p',
        leagueId: league.id,
        playerId: player.id,
        playerName: player.name,
        week: 5,
        projectedPoints: 22,
        scoringMatched: true,
        sourceName: 'Owner forecast',
        importedAt: target.asOf,
      },
    ],
  })[0]!;
  expect(imported.projectedPoints).toBe(22);
  expect(imported.projectionMethod).toBe('imported');
  expect(
    preparePublicPlayerForecast(
      { ...league, scoring: { rec: 0.5, rec_yd: 0.1 } },
      data,
      target,
    )(player, 'week')!.points,
  ).toBe(7);
});
it('composes exact remaining weeks and keeps recorded full-season points separate', () => {
  const forecast = preparePublicPlayerForecast(league, fixture(), target);
  expect(forecast(player, 'remaining-season', 7)).toMatchObject({
    points: 30,
    futurePoints: 30,
    recordedPoints: 0,
    futureGames: 3,
  });
  expect(forecast(player, 'remaining-season', 10)).toMatchObject({ points: 55, futureGames: 5 });
  expect(forecast(player, 'season')).toMatchObject({
    points: 215,
    futurePoints: 203,
    recordedPoints: 12,
    futureGames: 13,
  });
});
it('provides a pre-draft full-season rookie forecast without using later issued predictions', () => {
  const data = fixture(true),
    before = { season: 2026, week: 1, asOf: '2026-09-01T12:00:00.000Z' };
  expect(preparePublicPlayerForecast(league, data, before)(player, 'season')).toMatchObject({
    points: 229,
    recordedPoints: 0,
    futureGames: 17,
  });
  data.playerForecasts!.forEach((row) => (row.issuedWeek = 5));
  expect(preparePublicPlayerForecast(league, data, before)(player, 'season')).toBeUndefined();
});
it('withholds conflicting IDs, teams, names, duplicate rows and incomplete/stale sources', () => {
  const withoutProviderId = { ...player };
  delete withoutProviderId.espnId;
  for (const change of [
    (data: FootballDataSnapshot) => {
      data.playerForecasts![0]!.name = 'Different player';
    },
    (data: FootballDataSnapshot) => {
      data.playerForecasts![0]!.team = 'MIA';
    },
    (data: FootballDataSnapshot) => {
      data.playerForecasts!.push(data.playerForecasts![4]!);
    },
    (data: FootballDataSnapshot) => {
      data.playerForecasts = data.playerForecasts!.filter((row) => row.week !== 5);
    },
    (data: FootballDataSnapshot) => {
      data.sources.find((s) => s.id === source)!.retrievedAt = '2026-10-01';
    },
    (data: FootballDataSnapshot) => {
      data.sources.find((s) => s.id === source)!.retrievedAt = '2026-10-08';
    },
    (data: FootballDataSnapshot) => {
      data.sources.find((s) => s.id === 'games')!.status = 'unavailable';
    },
    (data: FootballDataSnapshot) => {
      data.games.push({ ...data.games.find((g) => g.week === 5)! });
    },
    (data: FootballDataSnapshot) => {
      data.playerForecasts![4]!.issuedWeek = 6;
    },
  ]) {
    const data = fixture();
    change(data);
    expect(preparePublicPlayerForecast(league, data, target)(player, 'week')).toBeUndefined();
  }
  expect(
    preparePublicPlayerForecast(league, fixture(), target)({ ...player, espnId: '999' }, 'week'),
  ).toBeUndefined();
  expect(
    preparePublicPlayerForecast(league, fixture(), target)(withoutProviderId, 'week')!.points,
  ).toBe(9);
  const ambiguous = fixture();
  ambiguous.playerForecasts!.push({ ...ambiguous.playerForecasts![4]!, espnId: '54321' });
  expect(
    preparePublicPlayerForecast(league, ambiguous, target)(withoutProviderId, 'week'),
  ).toBeUndefined();
});

it('matches a uniquely identified optional publisher suffix without merging conflicting identities', () => {
  const data = fixture();
  data.playerForecasts!.forEach((row) => (row.name = `${player.name} III`));
  const catalog = { ...player };
  delete catalog.espnId;
  const estimate = preparePublicPlayerForecast(league, data, target)(catalog, 'week');
  expect(estimate?.points).toBeDefined();
  expect(estimate?.points).toBe(
    preparePublicPlayerForecast(league, fixture(), target)(player, 'week')?.points,
  );
  expect(
    preparePublicPlayerForecast(league, data, target)({ ...catalog, espnId: '99999' }, 'week'),
  ).toBeUndefined();
  expect(
    preparePublicPlayerForecast(
      league,
      data,
      target,
    )({ ...catalog, name: `${player.name} Jr.` }, 'week'),
  ).toBeUndefined();
  const duplicate = data.playerForecasts!.map((row) => ({
    ...row,
    espnId: '99999',
    name: player.name,
  }));
  data.playerForecasts!.push(...duplicate);
  expect(preparePublicPlayerForecast(league, data, target)(catalog, 'week')).toBeUndefined();
});
it('never invents unknown scoring statistics, credited past games, or a bye projection', () => {
  for (const scoring of [{ rec: 1, rec_fd: 1 }, { unknown_bonus: 1 }, { rec: NaN }])
    expect(
      preparePublicPlayerForecast({ ...league, scoring }, fixture(), target)(player, 'week'),
    ).toBeUndefined();
  const missing = fixture();
  missing.players.splice(0, 1);
  expect(preparePublicPlayerForecast(league, missing, target)(player, 'season')).toBeUndefined();
  expect(
    preparePublicPlayerForecast(league, missing, { ...target, week: 10 })(player, 'week'),
  ).toBeUndefined();
  const duplicate = fixture();
  duplicate.players.push(duplicate.players[0]!);
  expect(preparePublicPlayerForecast(league, duplicate, target)(player, 'season')).toBeUndefined();
  const incomplete = fixture();
  incomplete.games.pop();
  expect(
    preparePublicPlayerForecast(league, incomplete, target)(player, 'remaining-season'),
  ).toBeUndefined();
});
it('excludes verified started games from remaining value and withholds unknown same-day timing', () => {
  const data = fixture(),
    today = { ...target, asOf: '2026-10-11T19:00:00.000Z' };
  data.sources.forEach((source) => (source.retrievedAt = today.asOf));
  data.games.find((game) => game.week === 5)!.kickoffAt = '2026-10-11T17:00:00.000Z';
  expect(
    preparePublicPlayerForecast(league, data, today)(player, 'remaining-season', 7),
  ).toMatchObject({ points: 21, futureGames: 2 });
  expect(preparePublicPlayerForecast(league, data, today)(player, 'week')).toBeUndefined();
  delete data.games.find((game) => game.week === 5)!.kickoffAt;
  expect(
    preparePublicPlayerForecast(league, data, today)(player, 'remaining-season', 7),
  ).toBeUndefined();
});

it('explains missing public interval coverage and retains the missing-history evidence', () => {
  const data = fixture();
  data.players = [];
  data.playerForecasts = data.playerForecasts!.filter((row) => row.week !== 5);
  const result = buildPlayerEvidence({
    ...target,
    league,
    players: [player],
    projections: [],
    data,
    scope: 'remaining-season',
    throughWeek: 7,
  })[0]!;
  expect(result.projectedPoints).toBeUndefined();
  expect(result.warnings.join(' ')).toContain(
    'No complete, uniquely matched public weekly forecast',
  );
  expect(result.warnings.join(' ')).toContain('No uniquely matched, completed prior');
});
