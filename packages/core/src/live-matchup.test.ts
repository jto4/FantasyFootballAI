import { expect, it } from 'vitest';
import { liveMatchup } from './live-matchup.js';

const starters = (prefix: string, teams: string[], estimate = 10) =>
  teams.map((team, i) => ({
    id: `${prefix}${i}`,
    name: `${prefix}${i}`,
    position: 'WR',
    nflTeam: team,
    estimate,
  }));
const games = [
  { home: 'CHI', away: 'NE', state: 'post' as const, detail: 'Final' },
  { home: 'ATL', away: 'SF', state: 'in' as const, detail: 'Q3 4:12' },
  { home: 'TEN', away: 'CLE', state: 'pre' as const, detail: '1:00 PM' },
];

it('adds estimates only for starters yet to play and estimates a win chance', () => {
  const live = liveMatchup(
    {
      you: { teamId: 'a', name: 'A', points: 40, starters: starters('y', ['CHI', 'ATL', 'TEN']) },
      opponent: {
        teamId: 'b',
        name: 'B',
        points: 30,
        starters: starters('o', ['NE', 'SF', 'CLE']),
      },
    },
    games,
  );
  expect(live.you.starters.map((s) => s.state)).toEqual(['post', 'in', 'pre']);
  expect(live.you.projectedFinal).toBe(50);
  expect(live.opponent.projectedFinal).toBe(40);
  expect(live.you).toMatchObject({ yetToPlay: 1, playing: 1 });
  expect(live.winChance).toBeGreaterThan(0.75);
  expect(live.winChance).toBeLessThan(1);
});

it('marks byes and withholds the projection when a remaining starter has no estimate', () => {
  const live = liveMatchup(
    {
      you: {
        teamId: 'a',
        name: 'A',
        points: 10,
        starters: [{ id: 'x', name: 'X', position: 'QB', nflTeam: 'TEN' }],
      },
      opponent: { teamId: 'b', name: 'B', points: 5, starters: starters('o', ['BUF']) },
    },
    games,
    ['BUF'],
  );
  expect(live.opponent.starters[0]!.state).toBe('bye');
  expect(live.you.projectedFinal).toBeUndefined();
  expect(live.winChance).toBeUndefined();
});

it('totals box-score points when the platform has no score, and only when every started starter scored', () => {
  const live = liveMatchup(
    {
      you: {
        teamId: 'a',
        name: 'A',
        starters: [
          { id: 'y0', name: 'y0', position: 'WR', nflTeam: 'CHI', estimate: 10, livePoints: 6.3 },
          { id: 'y1', name: 'y1', position: 'WR', nflTeam: 'ATL', estimate: 10, livePoints: 4.2 },
          { id: 'y2', name: 'y2', position: 'WR', nflTeam: 'TEN', estimate: 10 },
        ],
      },
      opponent: {
        teamId: 'b',
        name: 'B',
        starters: [{ id: 'o0', name: 'o0', position: 'WR', nflTeam: 'NE', estimate: 10 }],
      },
    },
    games,
  );
  expect(live.you).toMatchObject({ points: 10.5, scoreSource: 'box-score', projectedFinal: 20.5 });
  expect(live.opponent.points).toBeUndefined();
  expect(live.winChance).toBeUndefined();
});

it('counts a Questionable starter at his chance to play until his game starts', () => {
  const live = liveMatchup(
    {
      you: {
        teamId: 'a',
        name: 'A',
        points: 0,
        starters: [{ ...starters('y', ['TEN'])[0]!, playChance: 0.5 }],
      },
      opponent: { teamId: 'b', name: 'B', points: 0, starters: starters('o', ['CLE'], 6) },
    },
    games,
  );
  expect(live.you.projectedFinal).toBe(5);
  expect(live.winChance).toBeLessThan(0.5);
});

it('counts a starter listed Out before his game as zero, not as an unknown estimate', () => {
  const out = {
    id: 'yo',
    name: 'Out Receiver',
    position: 'WR',
    nflTeam: 'TEN',
    out: true as const,
  };
  const live = liveMatchup(
    {
      you: { teamId: 'a', name: 'A', points: 0, starters: [...starters('y', ['CLE']), out] },
      opponent: { teamId: 'b', name: 'B', points: 0, starters: starters('o', ['CLE']) },
    },
    games,
  );
  expect(live.you.projectedFinal).toBe(10);
  expect(live.winChance).toBeCloseTo(0.5, 1);
  // Without the Out listing a missing estimate still withholds the projection.
  const unknown = { id: 'yo', name: 'Out Receiver', position: 'WR', nflTeam: 'TEN' };
  const withheld = liveMatchup(
    {
      you: { teamId: 'a', name: 'A', points: 0, starters: [...starters('y', ['CLE']), unknown] },
      opponent: { teamId: 'b', name: 'B', points: 0, starters: starters('o', ['CLE']) },
    },
    games,
  );
  expect(withheld.you.projectedFinal).toBeUndefined();
});
