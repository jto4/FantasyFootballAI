import { expect, it } from 'vitest';
import type { LeagueConnection } from './domain-types.js';
import { playoffOdds } from './playoff-odds.js';

// Four teams over four played weeks: A always scores most, D least.
const scores = { a: 140, b: 120, c: 100, d: 80 };
const pairs = [
  ['a', 'b', 'c', 'd'],
  ['a', 'c', 'b', 'd'],
  ['a', 'd', 'b', 'c'],
  ['a', 'b', 'c', 'd'],
];
const league = (extra: Partial<LeagueConnection> = {}): LeagueConnection =>
  ({
    id: 'l',
    teams: Object.keys(scores).map((id) => ({ id, name: id.toUpperCase() })),
    settings: { regularSeasonWeeks: 6, playoffTeams: 2 },
    weeklyScores: pairs.flatMap((p, i) => [
      {
        week: i + 1,
        teams: [
          { teamId: p[0]!, points: scores[p[0] as keyof typeof scores] },
          { teamId: p[1]!, points: scores[p[1] as keyof typeof scores] },
        ],
      },
      {
        week: i + 1,
        teams: [
          { teamId: p[2]!, points: scores[p[2] as keyof typeof scores] },
          { teamId: p[3]!, points: scores[p[3] as keyof typeof scores] },
        ],
      },
    ]),
    ...extra,
  }) as unknown as LeagueConnection;

it('simulates the remaining weeks deterministically from scoring and records', () => {
  const odds = playoffOdds(league())!;
  expect(odds.remainingWeeks).toEqual([5, 6]);
  expect(odds.scheduleKnown).toBe(false);
  const [first, , , last] = odds.teams;
  expect(first).toMatchObject({ teamId: 'a', wins: 4, losses: 0 });
  expect(first!.playoffChance).toBeGreaterThan(0.95);
  expect(last).toMatchObject({ teamId: 'd', wins: 0 });
  expect(last!.playoffChance).toBeLessThan(0.05);
  expect(odds.teams.reduce((s, t) => s + t.playoffChance, 0)).toBeCloseTo(2);
  expect(playoffOdds(league())).toEqual(odds);
});

it('uses the listed schedule when every remaining week is known', () => {
  const odds = playoffOdds(
    league({
      upcomingSchedule: [
        { week: 5, teamIds: ['a', 'd'] },
        { week: 5, teamIds: ['b', 'c'] },
        { week: 6, teamIds: ['a', 'c'] },
        { week: 6, teamIds: ['b', 'd'] },
      ],
    }),
  )!;
  expect(odds.scheduleKnown).toBe(true);
});

it('waits for two played weeks', () => {
  expect(playoffOdds(league({ weeklyScores: [] }))).toBeUndefined();
});
