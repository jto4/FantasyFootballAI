import { expect, it } from 'vitest';
import type { LeagueConnection, PlayerProjection } from './domain-types.js';
import { reportFacts } from './report-facts.js';

const game = (week: number, a: [string, number], b: [string, number]) => ({
  week,
  teams: [
    { teamId: a[0], points: a[1] },
    { teamId: b[0], points: b[1] },
  ],
});
const league = {
  id: 'l',
  teams: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() })),
  settings: { regularSeasonWeeks: 6, playoffTeams: 2 },
  weeklyScores: [
    game(1, ['a', 130], ['b', 90]),
    game(1, ['c', 100], ['d', 99]),
    game(2, ['a', 120], ['c', 80]),
    game(2, ['b', 140], ['d', 70]),
  ],
  matchups: [
    {
      week: 3,
      teams: [
        { teamId: 'a', starters: ['p1'] },
        { teamId: 'd', starters: ['p2'] },
      ],
    },
  ],
} as unknown as LeagueConnection;
const projection = (playerId: string, projectedPoints: number) =>
  ({ leagueId: 'l', playerId, week: 3, projectedPoints }) as PlayerProjection;

it('summarizes standings, superlatives and this week with projected margins', () => {
  const facts = reportFacts(league, [projection('p1', 20), projection('p2', 12.5)]);
  expect(facts.completedWeeks).toBe(2);
  expect(facts.standings[0]).toMatchObject({ team: 'A', record: '2-0', streak: 'W2' });
  expect(facts.standings.find((t) => t.team === 'D')).toMatchObject({
    record: '0-2',
    streak: 'L2',
  });
  expect(facts.superlatives).toMatchObject({
    highestScore: { team: 'B', points: 140, week: 2 },
    lowestScore: { team: 'D', points: 70 },
    closestGame: { week: 1, margin: 1 },
  });
  expect(facts.thisWeek[0]).toMatchObject({ home: 'A', away: 'D', favorite: 'A', margin: 7.5 });
  // A starter without a projection leaves that side's total unknown rather than zero.
  expect(reportFacts(league, [projection('p1', 20)]).thisWeek[0]!.awayProjected).toBeUndefined();
});
