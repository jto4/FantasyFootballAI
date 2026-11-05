import { describe, expect, it } from 'vitest';
import type { LeagueConnection, RosterPlayer } from './domain-types.js';
import {
  moveApplied,
  moveRosterKey,
  planLineupMoves,
  platformMovePage,
  type MoveProposal,
} from './move-proposals.js';

const player = (id: string, position: string, rosterPosition?: string): RosterPlayer => ({
  id,
  name: `Player ${id}`,
  position,
  ...(rosterPosition ? { rosterPosition } : {}),
});
const league = (roster: RosterPlayer[]) =>
  ({
    id: '599',
    platform: 'espn',
    season: 2026,
    settings: { roster_positions: ['QB', 'RB', 'WR', 'FLEX', 'DST', 'BENCH', 'BENCH', 'IR'] },
    teams: [{ id: '10', name: 'Mine', roster }],
  }) as unknown as LeagueConnection;
const base = [
  player('q', 'QB', 'QB'),
  player('r', 'RB', 'RB'),
  player('w', 'WR', 'WR'),
  player('f', 'RB', 'FLEX'),
  player('d', 'DST', 'DST'),
  player('b1', 'WR', 'BENCH'),
  player('b2', 'QB', 'BENCH'),
  player('hurt', 'WR', 'IR'),
];

describe('planLineupMoves', () => {
  it('swaps a bench player into the outgoing starter’s spot', () => {
    expect(
      planLineupMoves(league(base), '10', [{ start: { id: 'b2' }, bench: { id: 'q' } }]),
    ).toEqual({
      items: [
        { id: 'b2', name: 'Player b2', from: 'BENCH', to: 'QB' },
        { id: 'q', name: 'Player q', from: 'QB', to: 'BENCH' },
      ],
    });
  });

  it('shifts the flex when the incoming player can’t use the outgoing player’s slot', () => {
    // A WR replaces the RB: the flex RB must move to RB and the WR takes the flex.
    const plan = planLineupMoves(league(base), '10', [{ start: { id: 'b1' }, bench: { id: 'r' } }]);
    expect(plan).toEqual({
      items: [
        { id: 'b1', name: 'Player b1', from: 'BENCH', to: 'FLEX' },
        { id: 'f', name: 'Player f', from: 'FLEX', to: 'RB' },
        { id: 'r', name: 'Player r', from: 'RB', to: 'BENCH' },
      ],
    });
  });

  it('fills an empty starting spot without benching anyone', () => {
    const roster = base.filter((p) => p.id !== 'w');
    expect(planLineupMoves(league(roster), '10', [{ start: { id: 'b1' } }])).toEqual({
      items: [{ id: 'b1', name: 'Player b1', from: 'BENCH', to: 'WR' }],
    });
  });

  it('refuses what it can’t prove legal', () => {
    const problem = (changes: Parameters<typeof planLineupMoves>[2], roster = base) =>
      'problem' in planLineupMoves(league(roster), '10', changes);
    expect(problem([{ start: { id: 'hurt' }, bench: { id: 'w' } }])).toBe(true);
    expect(problem([{ start: { id: 'q' } }])).toBe(true);
    expect(problem([{ start: { id: 'gone' } }])).toBe(true);
    expect(problem([{ start: { id: 'b1' }, bench: { id: 'b2' } }])).toBe(true);
    // A QB can't fill a D/ST spot.
    expect(problem([{ start: { id: 'b2' }, bench: { id: 'd' } }])).toBe(true);
    expect(problem([{ start: { id: 'b1' } }], [...base, player('x', 'WR')])).toBe(true);
    const unknownSlots = league(base);
    unknownSlots.settings.roster_positions = ['QB', 'MYSTERY'];
    expect('problem' in planLineupMoves(unknownSlots, '10', [{ start: { id: 'b2' } }])).toBe(true);
  });
});

describe('moves against league data', () => {
  const move = (fields: Partial<MoveProposal>) => ({ teamId: '10', ...fields }) as MoveProposal;

  it('confirms a lineup only when every player is where the move put them', () => {
    const change = move({
      kind: 'lineup',
      lineup: [
        { id: 'b2', name: '', from: 'BENCH', to: 'QB' },
        { id: 'q', name: '', from: 'QB', to: 'BENCH' },
      ],
    });
    expect(moveApplied(change, league(base))).toBe(false);
    const swapped = base.map((p) =>
      p.id === 'b2'
        ? { ...p, rosterPosition: 'QB' }
        : p.id === 'q'
          ? { ...p, rosterPosition: 'BENCH' }
          : p,
    );
    expect(moveApplied(change, league(swapped))).toBe(true);
  });

  it('confirms pickups and trades from who is on the roster', () => {
    const add = move({
      kind: 'add-drop',
      add: { id: 'new', name: '' },
      drop: { id: 'b1', name: '' },
    });
    expect(moveApplied(add, league(base))).toBe(false);
    const after = [...base.filter((p) => p.id !== 'b1'), player('new', 'WR', 'BENCH')];
    expect(moveApplied(add, league(after))).toBe(true);
    const trade = move({
      kind: 'trade',
      trade: {
        teamId: '2',
        teamName: '',
        give: { id: 'b1', name: '' },
        receive: { id: 'new', name: '' },
      },
    });
    expect(moveApplied(trade, league(after))).toBe(true);
  });

  it('notices any change of slot or player', () => {
    const before = moveRosterKey(league(base), '10');
    expect(moveRosterKey(league([...base].reverse()), '10')).toBe(before);
    const moved = base.map((p) => (p.id === 'b1' ? { ...p, rosterPosition: 'FLEX' } : p));
    expect(moveRosterKey(league(moved), '10')).not.toBe(before);
  });

  it('links to each platform’s team page', () => {
    expect(platformMovePage(league(base), '10', 'lineup')).toBe(
      'https://fantasy.espn.com/football/team?leagueId=599&teamId=10&seasonId=2026',
    );
    const yahoo = { ...league(base), id: '449.l.123', platform: 'yahoo' } as LeagueConnection;
    expect(platformMovePage(yahoo, '449.l.123.t.4', 'trade')).toBe(
      'https://football.fantasysports.yahoo.com/f1/123/4',
    );
    const sleeper = { ...league(base), platform: 'sleeper' } as LeagueConnection;
    expect(platformMovePage(sleeper, '1', 'lineup')).toBe('https://sleeper.com/leagues/599/team');
  });
});
