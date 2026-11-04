import { expect, it } from 'vitest';
import type { PlayerAdviceEvidence } from './advice-types.js';
import type { LeagueConnection } from './domain-types.js';
import { findTrades, rankWaivers } from './roster-moves.js';

const player = (id: string, position: string, points?: number): PlayerAdviceEvidence => ({
  id,
  name: id,
  position,
  ...(points !== undefined ? { projectedPoints: points } : {}),
  projectionSourceIds: [],
  metrics: [],
  historicalPoints: [],
  warnings: [],
});
const league = (rosters: Record<string, string[]>): LeagueConnection =>
  ({
    id: 'l',
    platform: 'sleeper',
    displayName: 'Fictional',
    settings: { roster_positions: ['QB', 'RB', 'WR', 'BN', 'BN'] },
    teams: Object.entries(rosters).map(([id, ids]) => ({
      id,
      name: `Team ${id}`,
      roster: ids.map((pid) => ({ id: pid, name: pid })),
    })),
  }) as unknown as LeagueConnection;

it('ranks free agents by best-lineup gain with the cheapest drop', () => {
  const evidence = [
    player('qb1', 'QB', 18),
    player('rb1', 'RB', 6),
    player('wr1', 'WR', 12),
    player('rb-bench', 'RB', 4),
    player('fa-rb', 'RB', 14),
    player('fa-wr', 'WR', 11),
    player('fa-none', 'TE'),
  ];
  const day = rankWaivers(league({ me: ['qb1', 'rb1', 'wr1', 'rb-bench'] }), 'me', evidence);
  expect(day.baseline).toBe(36);
  expect(day.weakSpots[0]).toMatchObject({ playerId: 'rb1', points: 6 });
  expect(day.candidates[0]).toMatchObject({
    playerId: 'fa-rb',
    gain: 8,
    drop: { playerId: 'rb-bench', netGain: 8 },
  });
  // A worse receiver adds nothing; a player without an estimate is never ranked.
  // A pickup that changes nothing is left out while another one helps.
  expect(day.candidates.some((c) => c.playerId === 'fa-wr')).toBe(false);
  expect(day.candidates.some((c) => c.playerId === 'fa-none')).toBe(false);
});

it('says when no pickup helps and shows the best at each position you start', () => {
  const day = rankWaivers(league({ me: ['qb1', 'rb1', 'wr1'] }), 'me', [
    player('qb1', 'QB', 18),
    player('rb1', 'RB', 12),
    player('wr1', 'WR', 12),
    player('fa-qb', 'QB', 17),
    player('fa-qb2', 'QB', 16),
    player('fa-qb3', 'QB', 15),
    player('fa-rb', 'RB', 7),
    player('fa-wr', 'WR', 6),
    player('fa-te', 'TE', 9),
  ]);
  expect(day.noUpgrade).toBe(true);
  expect(day.candidates.map((c) => c.playerId)).toEqual(['fa-qb', 'fa-qb2', 'fa-rb', 'fa-wr']);
  expect(day.candidates.every((c) => c.drop === undefined)).toBe(true);
});

it('never offers a player who did not report to his team', () => {
  const day = rankWaivers(league({ me: ['qb1', 'rb1', 'wr1'] }), 'me', [
    player('qb1', 'QB', 10),
    player('rb1', 'RB', 5),
    player('wr1', 'WR', 5),
    { ...player('holdout', 'WR', 20), status: 'Did not report' },
  ]);
  expect(day.candidates.some((c) => c.playerId === 'holdout')).toBe(false);
});

it('compares lineups with an unestimated spot only against the same missing spot', () => {
  const evidence = [player('rb1', 'RB', 6), player('wr1', 'WR', 12), player('qb-unknown', 'QB')];
  const day = rankWaivers(league({ me: ['qb-unknown', 'rb1', 'wr1'] }), 'me', [
    ...evidence,
    player('fa-rb', 'RB', 10),
    player('fa-qb', 'QB', 20),
  ]);
  expect(day.warnings[0]).toContain('No estimate yet for your QB spot');
  expect(day.candidates.find((c) => c.playerId === 'fa-rb')!.gain).toBe(4);
  // Filling the unknown QB changes which slots are missing, so it is not scored as a gain.
  expect(day.candidates.some((c) => c.playerId === 'fa-qb')).toBe(false);
});

it('suggests only trades that improve both lineups, ranked by the smaller gain', () => {
  const evidence = [
    player('my-qb', 'QB', 20),
    player('my-qb2', 'QB', 19),
    player('my-rb', 'RB', 5),
    player('my-wr', 'WR', 10),
    player('their-qb', 'QB', 8),
    player('their-rb', 'RB', 15),
    player('their-rb2', 'RB', 14),
    player('their-wr', 'WR', 10),
  ];
  const ideas = findTrades(
    league({
      me: ['my-qb', 'my-qb2', 'my-rb', 'my-wr'],
      them: ['their-qb', 'their-rb', 'their-rb2', 'their-wr'],
    }),
    'me',
    evidence,
  );
  expect(ideas[0]).toMatchObject({
    teamName: 'Team them',
    give: { playerId: 'my-qb2' },
    receive: { playerId: 'their-rb' },
    myGain: 10,
    theirGain: 10,
  });
  // A more lopsided version of the same swap (9 vs 11) ranks below the even one.
  expect(ideas[1]).toMatchObject({ myGain: 9, theirGain: 11 });
  expect(ideas.every((idea) => idea.myGain > 0 && idea.theirGain > 0)).toBe(true);
});

it('never suggests dropping a player whose value is unknown', () => {
  const evidence = [
    player('qb1', 'QB', 18),
    player('rb1', 'RB', 6),
    player('wr1', 'WR', 12),
    player('rb-unknown', 'RB'),
    player('rb-bench', 'RB', 4),
    player('fa-rb', 'RB', 14),
  ];
  const day = rankWaivers(
    league({ me: ['qb1', 'rb1', 'wr1', 'rb-unknown', 'rb-bench'] }),
    'me',
    evidence,
  );
  expect(day.candidates[0]!.drop).toMatchObject({ playerId: 'rb-bench', netGain: 8 });
});
