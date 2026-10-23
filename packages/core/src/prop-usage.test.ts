import { expect, it } from 'vitest';
import type { FootballGame, PlayerGameStats } from './advice-types.js';
import { attachSnapShares, depthRankAsOf, propDepth, snapKey } from './prop-usage.js';

const game = (week: number, kickoffAt: string): FootballGame => ({
  id: `2026_0${week}_KC_SEA`,
  season: 2026,
  week,
  seasonType: 'REG',
  date: kickoffAt.slice(0, 10),
  home: 'SEA',
  away: 'KC',
  kickoffAt,
});

it('uses the latest dated snapshot before kickoff, or that week’s weekly chart', () => {
  const dated = [
    { pos: 'QB' as const, rank: 2, at: '2026-10-10T12:00:00Z' },
    { pos: 'QB' as const, rank: 1, at: '2026-10-20T12:00:00Z' },
    { pos: 'QB' as const, rank: 3, at: '2026-10-27T12:00:00Z' },
  ];
  expect(depthRankAsOf(dated, 'QB', game(7, '2026-10-26T00:20:00Z'))).toBe(1);
  expect(depthRankAsOf(dated, 'QB', game(6, '2026-10-12T17:00:00Z'))).toBe(2);
  expect(depthRankAsOf(dated, 'WR', game(7, '2026-10-26T00:20:00Z'))).toBeUndefined();
  const weekly = [{ pos: 'RB' as const, rank: 2, season: 2026, week: 7 }];
  expect(depthRankAsOf(weekly, 'RB', game(7, '2026-10-26T00:20:00Z'))).toBe(2);
  expect(depthRankAsOf(weekly, 'RB', game(8, '2026-11-02T00:20:00Z'))).toBeUndefined();
});

it('finds depth now and at the player’s previous game, and attaches snap shares', () => {
  const previous = game(6, '2026-10-12T17:00:00Z');
  const row = {
    playerId: 'p',
    name: 'Fictional Back',
    position: 'RB',
    team: 'SEA',
    opponent: 'KC',
    gameId: previous.id,
    season: 2026,
    week: 6,
    seasonType: 'REG',
    stats: {},
  } satisfies PlayerGameStats;
  const entries = [
    { pos: 'RB' as const, rank: 2, at: '2026-10-10T12:00:00Z' },
    { pos: 'RB' as const, rank: 1, at: '2026-10-20T12:00:00Z' },
  ];
  expect(
    propDepth(
      entries,
      'RB',
      game(7, '2026-10-26T00:20:00Z'),
      [row],
      new Map([[previous.id, previous]]),
    ),
  ).toEqual({ now: 1, atLastGame: 2 });
  const [withSnaps] = attachSnapShares(
    [row],
    new Map([[snapKey('Fictional Back', 'SEA', previous.id), 0.41]]),
  );
  expect(withSnaps!.usage).toEqual({ snapShare: 0.41 });
});
