import { expect, it } from 'vitest';
import { propHistoryIdentityResolver, buildPropGameLog } from './player-prop-research.js';
import type { FootballDataSnapshot, PlayerGameStats } from './advice-types.js';
const p: PlayerGameStats = {
  playerId: '00-0039732',
  name: 'Bo Nix',
  position: 'QB',
  team: 'DEN',
  opponent: 'SEA',
  gameId: 'past',
  season: 2026,
  week: 1,
  seasonType: 'REG',
  stats: { passing_yards: 200 },
};
const d: FootballDataSnapshot = {
  season: 2026,
  players: [p],
  games: [
    {
      id: 'past',
      season: 2026,
      week: 1,
      seasonType: 'REG',
      date: '2026-09-10',
      kickoffAt: '2026-09-10T17:00:00Z',
      home: 'DEN',
      away: 'SEA',
      homeScore: 20,
      awayScore: 23,
    },
  ],
  market: [],
  sources: [],
  warnings: [],
};
it('fills missing catalog IDs only from unique name/position/current team, preserves explicit conflicting IDs', () => {
  const player = { id: 'sleeper:11563', name: 'Bo Nix', position: 'QB', nflTeam: 'DEN' };
  expect(propHistoryIdentityResolver(d)(player)).toBe(p.playerId);
  expect(propHistoryIdentityResolver(d)({ ...player, nflTeam: 'SEA' })).toBeUndefined();
  expect(propHistoryIdentityResolver(d)({ ...player, gsisId: 'explicit-other' })).toBe(
    'explicit-other',
  );
  expect(
    propHistoryIdentityResolver({ ...d, players: [p, { ...p, playerId: 'ambiguous' }] })(player),
  ).toBeUndefined();
  expect(propHistoryIdentityResolver({ ...d, season: 2027 })(player)).toBeUndefined();
  expect(propHistoryIdentityResolver(d)({ ...player, position: 'WR' })).toBeUndefined();
});
it('requires exact team/opponent game identity and integer weeks for logs', () => {
  const asOf = '2026-10-15T23:00:00Z';
  expect(
    buildPropGameLog(p.playerId, p.name, 'passing_yards', [p], d.games, asOf).rows,
  ).toHaveLength(1);
  expect(
    buildPropGameLog(p.playerId, 'Other Player', 'passing_yards', [p], d.games, asOf).rows,
  ).toHaveLength(0);
  expect(
    buildPropGameLog(p.playerId, p.name, 'passing_yards', [{ ...p, opponent: 'KC' }], d.games, asOf)
      .rows,
  ).toHaveLength(0);
});
