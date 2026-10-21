import { expect, it, vi } from 'vitest';
import type { FootballGame, LeagueConnection } from '@sidekick/core';
import { leaguesDueForRefresh, startLeagueAutoRefresh } from './league-auto-refresh.js';

const league = (id: string, lastSyncedAt?: string, snapshot = false): LeagueConnection => ({
  id,
  platform: 'espn',
  name: id,
  displayName: id,
  season: 2026,
  teamCount: 2,
  teams: [],
  scoring: {},
  settings: {},
  connectedAt: '2026-09-01T00:00:00Z',
  ...(lastSyncedAt ? { lastSyncedAt } : {}),
  ...(snapshot && lastSyncedAt
    ? { connectionMode: 'snapshot' as const, snapshotImportedAt: lastSyncedAt }
    : snapshot
      ? { connectionMode: 'snapshot' as const }
      : {}),
});
const game = (kickoffAt: string): FootballGame => ({
  id: kickoffAt,
  season: 2026,
  week: 7,
  seasonType: 'REG',
  date: kickoffAt.slice(0, 10),
  kickoffAt,
  home: 'BUF',
  away: 'NE',
});
const now = Date.parse('2026-10-25T16:00:00Z');

it('refreshes stale, pre-kickoff and post-game leagues but never snapshots', () => {
  const games = [game('2026-10-25T17:00:00Z'), game('2026-10-23T00:15:00Z')];
  const due = leaguesDueForRefresh(
    [
      league('never'),
      league('old', '2026-10-24T20:00:00Z'),
      league('pre-kickoff', '2026-10-25T14:45:00Z'),
      league('fresh', '2026-10-25T15:30:00Z'),
      league('snapshot', '2026-10-20T00:00:00Z', true),
    ],
    games,
    now,
  ).map((l) => l.id);
  expect(due).toEqual(['never', 'old', 'pre-kickoff']);
  // Thursday's game ended after a Thursday-evening sync, so Friday morning refreshes.
  expect(
    leaguesDueForRefresh(
      [league('after-game', '2026-10-23T02:00:00Z')],
      games,
      Date.parse('2026-10-23T05:00:00Z'),
    ).map((l) => l.id),
  ).toEqual(['after-game']);
});

it('refreshes due leagues one at a time and keeps going after a failure', async () => {
  const refresh = vi
    .fn<(league: LeagueConnection) => Promise<void>>()
    .mockRejectedValueOnce(new Error('provider down'))
    .mockResolvedValue();
  const task = startLeagueAutoRefresh({
    leagues: () => [league('a'), league('b'), league('c', undefined, true)],
    games: async () => [],
    refresh,
    now: () => now,
    intervalMs: 60_000,
  });
  await task.tick();
  task.stop();
  expect(refresh.mock.calls.map(([l]) => l.id)).toEqual(['a', 'b']);
});
