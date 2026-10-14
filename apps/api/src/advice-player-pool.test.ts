import { expect, it } from 'vitest';
import { playerPool } from './advice-service.js';
import type { FootballDataSnapshot, LeagueConnection, RosterPlayer } from '@sidekick/core';
const player: RosterPlayer = {
  id: 'owner-defense',
  name: 'Buffalo Bills',
  position: 'DEF',
  nflTeam: 'BUF',
};
const league: LeagueConnection = {
  id: 'test',
  platform: 'espn',
  name: 'test',
  displayName: 'test',
  season: 2026,
  teamCount: 1,
  connectedAt: '2026-10-09T12:00:00Z',
  settings: {},
  scoring: {},
  teams: [{ id: 'mine', name: 'Mine', rosterSize: 1, roster: [player] }],
};
function data(): FootballDataSnapshot {
  return {
    season: 2026,
    market: [],
    sources: [],
    warnings: [],
    games: [],
    players: ['BUF', 'MIA'].map((team) => ({
      playerId: `dst:${team}`,
      name: `${team} team defense`,
      position: 'DST',
      team,
      opponent: team === 'BUF' ? 'MIA' : 'BUF',
      gameId: 'game',
      season: 2026,
      week: 1,
      seasonType: 'REG',
      stats: {},
    })),
  };
}
it('does not present an owned defense as an unrostered waiver candidate when the public catalog is unavailable', () => {
  const result = playerPool(league, data(), new Map(), false);
  expect(result.filter((p) => p.nflTeam === 'BUF')).toEqual([player]);
  expect(result.find((p) => p.nflTeam === 'MIA')!.id).toBe('dst:MIA');
  expect(result.find((p) => p.nflTeam === 'MIA')!.gsisId).toBeUndefined();
});
it('merges catalog and owned defense aliases by team while preserving the owned platform ID and separate Sleeper identity', () => {
  const catalog = new Map<string, RosterPlayer>([
    [
      'BUF',
      { id: 'BUF', name: 'Buffalo Team Defense', position: 'DST', nflTeam: 'BUF', espnId: '33' },
    ],
    ['MIA', { id: 'MIA', name: 'Miami', position: 'DEF', nflTeam: 'MIA', espnId: '34' }],
  ]);
  const result = playerPool(league, data(), catalog, false);
  expect(result.filter((p) => p.nflTeam === 'BUF')).toHaveLength(1);
  expect(result.find((p) => p.nflTeam === 'BUF')!.id).toBe(player.id);
  expect(result.find((p) => p.nflTeam === 'BUF')!.sleeperId).toBe('BUF');
  expect(result.filter((p) => p.nflTeam === 'MIA')).toHaveLength(1);
});
