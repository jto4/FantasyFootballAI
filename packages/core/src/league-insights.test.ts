import { expect, it } from 'vitest';
import { leagueInsights } from './league-insights.js';

const team = (id: string) => ({ id, name: id.toUpperCase() });
const game = (week: number, a: [string, number], b: [string, number]) => ({
  week,
  teams: [
    { teamId: a[0], points: a[1] },
    { teamId: b[0], points: b[1] },
  ],
});

it('derives records, points against, all-play and luck from completed weeks', () => {
  const insights = leagueInsights({
    teams: [team('a'), team('b'), team('c'), team('d')],
    weeklyScores: [
      // Week 1: a scores second-most but plays the top scorer.
      game(1, ['a', 120], ['b', 130]),
      game(1, ['c', 90], ['d', 80]),
      // Week 2: d scores least but faces the second-lowest and still wins nothing.
      game(2, ['a', 100], ['c', 110]),
      game(2, ['b', 70], ['d', 60]),
    ],
  })!;
  const a = insights.teams.find((row) => row.id === 'a')!;
  expect(a).toMatchObject({ games: 2, wins: 0, losses: 2, pointsFor: 220, pointsAgainst: 240 });
  // Week 1 beats c and d (2 of 3); week 2 beats b and d (2 of 3).
  expect(a.allPlayWins).toBe(4);
  expect(a.allPlayLosses).toBe(2);
  expect(a.expectedWins).toBeCloseTo(4 / 3);
  expect(a.luck).toBeCloseTo(-4 / 3);
  const b = insights.teams.find((row) => row.id === 'b')!;
  expect(b.wins).toBe(2);
  expect(b.luck).toBeGreaterThan(0);
  // After week 1, b (130) leads; after week 2, a's two strong weeks rank it first.
  expect(insights.teams.find((row) => row.id === 'b')!.rankByWeek[0]).toEqual({ week: 1, rank: 1 });
  expect(a.rankByWeek.map((r) => r.rank)).toEqual([2, 1]);
  expect(insights.weeks).toEqual([
    { week: 1, median: 105, low: 80, high: 130 },
    { week: 2, median: 85, low: 60, high: 110 },
  ]);
});

it('counts ties as half and ignores unknown teams and malformed games', () => {
  const insights = leagueInsights({
    teams: [team('a'), team('b')],
    weeklyScores: [
      game(1, ['a', 100], ['b', 100]),
      game(2, ['a', 90], ['ghost', 50]),
      game(3, ['a', 80], ['a', 70]),
    ],
  })!;
  const a = insights.teams.find((row) => row.id === 'a')!;
  expect(a).toMatchObject({ games: 1, wins: 0, ties: 1, allPlayTies: 1 });
  expect(a.expectedWins).toBeCloseTo(0.5);
  expect(a.luck).toBeCloseTo(0);
  expect(leagueInsights({ teams: [team('a')], weeklyScores: [] })).toBeUndefined();
});
