import { expect, it } from 'vitest';
import {
  inQuietHours,
  isValidPreferences,
  orderedHomeCards,
  playerNudge,
  homeCardIds,
} from './preferences.js';
import { preferredBookLines } from './prop-board.js';

const leagues = new Set(['league']);

it('accepts well-formed preferences and rejects anything else', () => {
  expect(
    isValidPreferences(
      {
        lineupStrategy: 'win-chance',
        projectionAdjustments: { wind: false },
        playerNudges: [{ leagueId: 'league', playerId: '1', name: 'Fictional Back', percent: 15 }],
        watchlist: [{ leagueId: 'league', playerId: '2', name: 'Fictional Receiver' }],
        props: { minEdgePoints: 3, sportsbooks: ['DraftKings'], lineCapture: false },
        notifications: { out: false, leadHours: 6, quietStart: '23:00', quietEnd: '08:00' },
        ai: { tone: 'straight', length: 'brief', models: { chat: 'gpt-6-luna' } },
        homeCards: [{ id: 'matchup', visible: false }],
      },
      leagues,
    ),
  ).toBe(true);
  expect(isValidPreferences(undefined, leagues)).toBe(true);
  for (const bad of [
    { lineupStrategy: 'yolo' },
    { playerNudges: [{ leagueId: 'other', playerId: '1', name: 'X', percent: 10 }] },
    { playerNudges: [{ leagueId: 'league', playerId: '1', name: 'X', percent: 80 }] },
    { playerNudges: [{ leagueId: 'league', playerId: '1', name: 'X', percent: 0 }] },
    {
      watchlist: [
        { leagueId: 'league', playerId: '2', name: 'X' },
        { leagueId: 'league', playerId: '2', name: 'X' },
      ],
    },
    { props: { minEdgePoints: 40 } },
    { notifications: { leadHours: 3 } },
    { notifications: { quietStart: '23:00' } },
    { ai: { models: { chat: 'bad model name' } } },
    { homeCards: [{ id: 'nope', visible: true }] },
    { extra: true },
  ])
    expect(isValidPreferences(bad, leagues)).toBe(false);
});

it('keeps saved Home order and appends cards added later', () => {
  const cards = orderedHomeCards({
    homeCards: [
      { id: 'watchlist', visible: true },
      { id: 'next-up', visible: false },
    ],
  });
  expect(cards.slice(0, 2)).toEqual([
    { id: 'watchlist', visible: true },
    { id: 'next-up', visible: false },
  ]);
  expect(cards).toHaveLength(homeCardIds.length);
  expect(
    playerNudge(
      { playerNudges: [{ leagueId: 'league', playerId: '1', name: 'X', percent: -20 }] },
      'league',
      '1',
    ),
  ).toBe(-20);
  expect(playerNudge(undefined, 'league', '1')).toBe(0);
});

it('handles quiet hours across midnight and sportsbook choices', () => {
  expect(inQuietHours(23 * 60 + 30, '23:00', '08:00')).toBe(true);
  expect(inQuietHours(12 * 60, '23:00', '08:00')).toBe(false);
  expect(inQuietHours(13 * 60, '12:00', '14:00')).toBe(true);
  const lines = [
    { sportsbook: 'DraftKings' },
    { sportsbook: 'ESPN BET' },
    { sportsbook: 'FanDuel Sportsbook' },
  ];
  expect(preferredBookLines(lines, ['espn bet', 'FanDuel']).map((l) => l.sportsbook)).toEqual([
    'ESPN BET',
    'FanDuel Sportsbook',
  ]);
  expect(preferredBookLines(lines, [])).toHaveLength(3);
  // Empty or generic book names never slip through a chosen-books filter.
  expect(
    preferredBookLines(
      [{ sportsbook: '' }, { sportsbook: 'Bet' }, { sportsbook: 'DraftKings' }],
      ['DraftKings', 'BetMGM'],
    ).map((l) => l.sportsbook),
  ).toEqual(['DraftKings']);
});

it('lets a strategy decide close calls while totals stay projected points', async () => {
  const { optimizeLineup } = await import('./advice-math.js');
  const player = (id: string, projectedPoints: number) =>
    ({ id, name: id, position: 'WR', projectedPoints, warnings: [], metrics: [] }) as never;
  const roster = [player('steady', 10), player('boom', 9.8)];
  // Balanced takes the higher projection; a value function can prefer the other.
  expect(optimizeLineup(roster, ['WR']).assignments[0]!.playerId).toBe('steady');
  const upside = optimizeLineup(
    roster,
    ['WR'],
    new Set(),
    (p: { id: string; projectedPoints?: number }) =>
      (p.projectedPoints ?? 0) + (p.id === 'boom' ? 1 : 0),
  );
  expect(upside.assignments[0]!.playerId).toBe('boom');
  expect(upside.points).toBe(9.8);
});

it('drops only the entries of removed leagues', async () => {
  const { prunePreferences } = await import('./preferences.js');
  const pruned = prunePreferences(
    {
      lineupStrategy: 'safe',
      watchlist: [
        { leagueId: 'kept', playerId: '1', name: 'A' },
        { leagueId: 'gone', playerId: '2', name: 'B' },
      ],
      playerNudges: [{ leagueId: 'gone', playerId: '3', name: 'C', percent: 10 }],
    },
    new Set(['kept']),
  )!;
  expect(pruned.lineupStrategy).toBe('safe');
  expect(pruned.watchlist).toEqual([{ leagueId: 'kept', playerId: '1', name: 'A' }]);
  expect(pruned.playerNudges).toEqual([]);
  expect(isValidPreferences(pruned, new Set(['kept']))).toBe(true);
});

it('knows when recorded predictions must leave out the owner’s changes', async () => {
  const { hasProjectionChanges } = await import('./preferences.js');
  expect(hasProjectionChanges(undefined, 'league')).toBe(false);
  expect(hasProjectionChanges({ lineupStrategy: 'safe' }, 'league')).toBe(false);
  expect(
    hasProjectionChanges(
      { playerNudges: [{ leagueId: 'other', playerId: '1', name: 'X', percent: 10 }] },
      'league',
    ),
  ).toBe(false);
  expect(
    hasProjectionChanges(
      { playerNudges: [{ leagueId: 'league', playerId: '1', name: 'X', percent: 10 }] },
      'league',
    ),
  ).toBe(true);
  expect(hasProjectionChanges({ projectionAdjustments: { wind: false } }, 'league')).toBe(true);
});
