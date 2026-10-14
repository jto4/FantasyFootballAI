import { expect, it } from 'vitest';
import type { LeagueConnection } from './domain-types.js';
import type { PlayerAdviceEvidence } from './advice-types.js';
import {
  buildFantasyAdvicePlan,
  evaluateLineupSelection,
  validateStartSitAssessment,
} from './fantasy-advice.js';
import { adviceDecisionPolicy } from './advice-policy.js';

const asOf = '2026-10-07T12:00:00Z';
const player = (
  id: string,
  position: string,
  projectedPoints: number,
  scope: 'week' | 'season' | 'remaining-season' = 'week',
): PlayerAdviceEvidence => ({
  id,
  name: id,
  position,
  projectedPoints,
  projectionScope: scope,
  ...(scope === 'remaining-season'
    ? { projectionPeriod: { season: 2026, fromWeek: 5, throughWeek: 18 } }
    : {}),
  projectionMethod: 'imported',
  projectionSourceIds: ['test-projection'],
  metrics: [],
  historicalPoints: [10, 11, 12, 13],
  warnings: [],
});
const league: LeagueConnection = {
  id: 'test',
  name: 'Test',
  displayName: 'Test',
  platform: 'sleeper',
  season: 2026,
  teamCount: 2,
  settings: { roster_positions: ['QB', 'WR', 'BN'], currentWeek: 5 },
  scoring: { rec: 1 },
  connectedAt: asOf,
  lastSyncedAt: asOf,
  teams: [
    {
      id: 'mine',
      name: 'Mine',
      rosterSize: 2,
      roster: [
        { id: 'qb', name: 'qb', position: 'QB' },
        { id: 'wr', name: 'wr', position: 'WR' },
      ],
    },
    {
      id: 'other',
      name: 'Other',
      rosterSize: 2,
      roster: [
        { id: 'incoming-1', name: 'incoming-1', position: 'WR' },
        { id: 'incoming-2', name: 'incoming-2', position: 'WR' },
      ],
    },
  ],
};

function focusedComparison() {
  const connected = structuredClone(league);
  connected.settings.roster_positions = ['QB', 'WR', 'K', 'DST', 'BN'];
  connected.teams[0]!.roster!.push(
    { id: 'bench', name: 'bench', position: 'WR' },
    { id: 'k', name: 'k', position: 'K' },
  );
  connected.teams[0]!.rosterSize = 4;
  const rows = [
    player('qb', 'QB', 20),
    player('wr', 'WR', 15),
    player('bench', 'WR', 12),
    player('k', 'K', 5),
  ];
  delete rows[3]!.projectedPoints;
  for (const row of rows)
    row.metrics.push({
      id: `${row.id}:projected`,
      label: 'Weekly estimate',
      value: row.projectedPoints ?? 0,
      unit: 'points',
      sourceIds: ['test-projection'],
    });
  const request = {
    mode: 'lineup' as const,
    leagueId: connected.id,
    teamId: 'mine',
    candidateIds: ['wr', 'bench'],
  };
  return { connected, rows, request };
}

it('compares one spot despite unrelated missing kicker/defense estimates, without a whole-lineup claim', () => {
  const { connected, rows, request } = focusedComparison();
  const plan = buildFantasyAdvicePlan(connected, request, rows, asOf);
  expect(plan.startSit).toEqual({ candidateIds: ['wr', 'bench'], eligibleSlots: ['WR'] });
  expect(plan.players.map((row) => row.id)).toEqual(['wr', 'bench']);
  expect(plan.lineup).toBeUndefined();
  expect(plan.metrics.find((metric) => metric.id === 'start-sit-gap')?.value).toBe(3);
  expect(adviceDecisionPolicy(request, plan, undefined, plan.players).maximumVerdict).toBe(
    'recommend',
  );
  const full = buildFantasyAdvicePlan(connected, { mode: 'lineup', teamId: 'mine' }, rows, asOf);
  expect(full.lineup?.complete).toBe(false);
  expect(
    adviceDecisionPolicy(
      { mode: request.mode, leagueId: request.leagueId, teamId: request.teamId },
      full,
      undefined,
      full.players,
    ).maximumVerdict,
  ).toBe('insufficient');
});

it('withholds a focused pick when a selected active player lacks a matched weekly estimate', () => {
  const { connected, rows, request } = focusedComparison();
  rows[2]!.projectionScope = 'season';
  const plan = buildFantasyAdvicePlan(connected, request, rows, asOf);
  expect(adviceDecisionPolicy(request, plan, undefined, plan.players).maximumVerdict).toBe(
    'insufficient',
  );
  rows[2]!.status = 'Out';
  const inactive = buildFantasyAdvicePlan(connected, request, rows, asOf);
  expect(inactive.candidates.map((row) => row.playerId)).toEqual(['wr']);
  expect(adviceDecisionPolicy(request, inactive, undefined, inactive.players).maximumVerdict).toBe(
    'recommend',
  );
});

it('verifies focused ownership and common starter eligibility, including cross-position Flex', () => {
  const { connected, rows, request } = focusedComparison();
  expect(() =>
    buildFantasyAdvicePlan(
      connected,
      { ...request, candidateIds: ['wr', 'incoming-1'] },
      [...rows, player('incoming-1', 'WR', 16)],
      asOf,
    ),
  ).toThrow('from your team');
  expect(() =>
    buildFantasyAdvicePlan(connected, { ...request, candidateIds: ['qb', 'wr'] }, rows, asOf),
  ).toThrow('share a supported starting spot');
  connected.settings.roster_positions = ['WR', 'FLEX', 'BN'];
  rows[2]!.position = 'RB';
  expect(buildFantasyAdvicePlan(connected, request, rows, asOf).startSit?.eligibleSlots).toEqual([
    'FLEX',
  ]);
});

it('a focused choice requires one eligible player and visible estimates for every available alternative', () => {
  const { connected, rows, request } = focusedComparison();
  const plan = buildFantasyAdvicePlan(connected, request, rows, asOf);
  const assessment = {
    verdict: 'lean' as const,
    headline: 'Compare receivers',
    recommendedPlayerIds: ['bench'],
    reasons: [
      {
        text: 'Compare {{wr:projected}} with {{bench:projected}}.',
        metricIds: ['wr:projected', 'bench:projected'],
        sourceIds: [],
      },
    ],
    risks: [],
    alternative: { text: 'Confirm availability.', metricIds: [], sourceIds: [] },
    perception: { tone: 'unknown' as const, text: 'Unknown.', metricIds: [], sourceIds: [] },
  };
  expect(() => validateStartSitAssessment(assessment, plan)).not.toThrow();
  for (const recommendedPlayerIds of [[], ['qb'], ['wr', 'bench']])
    expect(() => validateStartSitAssessment({ ...assessment, recommendedPlayerIds }, plan)).toThrow(
      'exactly one eligible',
    );
  expect(() =>
    validateStartSitAssessment(
      {
        ...assessment,
        reasons: [
          { text: 'Compare {{wr:projected}}.', metricIds: ['wr:projected'], sourceIds: [] },
        ],
      },
      plan,
    ),
  ).toThrow('every eligible alternative');
});

it('allows eligible bench choices and verifies the actual complete selection without filling missing slots', () => {
  const connected = structuredClone(league);
  const data = [
    player('qb', 'QB', 20),
    player('wr', 'WR', 15),
    player('bench', 'WR', 12),
    player('out', 'WR', 40),
  ];
  data[1]!.status = 'Questionable';
  data[3]!.status = 'Out';
  connected.teams[0]!.roster!.push(
    ...data.slice(2).map(({ id, name, position }) => ({ id, name, position })),
  );
  connected.teams[0]!.rosterSize = 4;
  const plan = buildFantasyAdvicePlan(connected, { mode: 'lineup', teamId: 'mine' }, data, asOf);
  expect(plan.candidates.map((candidate) => candidate.playerId)).toEqual(['qb', 'wr', 'bench']);
  expect(plan.lineup!.points).toBe(35);
  const chosen = evaluateLineupSelection(
    plan,
    ['bench', 'qb'],
    connected.settings.roster_positions,
  );
  expect(chosen.points).toBe(32);
  expect(chosen.assignments.map((row) => row.playerId).sort()).toEqual(['bench', 'qb']);
  for (const ids of [
    ['bench'],
    ['qb', 'bench', 'wr'],
    ['qb', 'qb'],
    ['wr', 'bench'],
    ['qb', 'out'],
    ['qb', 'incoming-1'],
  ])
    expect(() => evaluateLineupSelection(plan, ids, connected.settings.roster_positions)).toThrow(
      'complete legal lineup',
    );
  expect(plan.lineup!.points).toBe(35);
});

it('validates FLEX choices through global slot matching instead of assuming array order', () => {
  const connected = structuredClone(league);
  connected.settings.roster_positions = ['TE', 'FLEX', 'BN'];
  const data = [player('te', 'TE', 15), player('rb', 'RB', 10), player('wr', 'WR', 12)];
  connected.teams[0]!.roster = data.map(({ id, name, position }) => ({ id, name, position }));
  connected.teams[0]!.rosterSize = 3;
  const plan = buildFantasyAdvicePlan(connected, { mode: 'lineup', teamId: 'mine' }, data, asOf);
  expect(
    evaluateLineupSelection(plan, ['rb', 'te'], connected.settings.roster_positions).points,
  ).toBe(25);
  expect(() =>
    evaluateLineupSelection(plan, ['rb', 'wr'], connected.settings.roster_positions),
  ).toThrow('complete legal lineup');
});

it('can compare a complete replacement lineup when a recorded inactive bench player has no estimate', () => {
  const connected = structuredClone(league);
  connected.teams[0]!.roster!.push({ id: 'out', name: 'out', position: 'WR' });
  connected.teams[0]!.rosterSize = 3;
  const inactive = player('out', 'WR', 0);
  inactive.status = 'Out';
  delete inactive.projectedPoints;
  const request = { mode: 'lineup' as const, leagueId: league.id, teamId: 'mine', week: 5 };
  const data = [player('qb', 'QB', 20), player('wr', 'WR', 10), inactive];
  const plan = buildFantasyAdvicePlan(connected, request, data, asOf);
  expect(plan.lineup?.assignments.map((row) => row.playerId)).toEqual(['qb', 'wr']);
  expect(adviceDecisionPolicy(request, plan, undefined, plan.players).maximumVerdict).toBe(
    'recommend',
  );
  delete inactive.status;
  const unknown = buildFantasyAdvicePlan(connected, request, data, asOf);
  expect(adviceDecisionPolicy(request, unknown, undefined, unknown.players).maximumVerdict).toBe(
    'insufficient',
  );
  connected.teams[0]!.roster = connected.teams[0]!.roster!.filter((row) => row.id !== 'wr');
  connected.teams[0]!.rosterSize = 2;
  inactive.status = 'Out';
  const unavailable = buildFantasyAdvicePlan(connected, request, data, asOf);
  expect(unavailable.lineup?.complete).toBe(false);
  expect(
    adviceDecisionPolicy(request, unavailable, undefined, unavailable.players).maximumVerdict,
  ).toBe('insufficient');
});

it('permits a complete replacement lineup around a verified bench bye, but retains unknown-data and missing-slot gates', () => {
  const connected = structuredClone(league);
  connected.teams[0]!.roster!.push({ id: 'bye', name: 'bye', position: 'WR' });
  connected.teams[0]!.rosterSize = 3;
  const unavailable = player('bye', 'WR', 100);
  unavailable.weeklyGameStatus = 'bye';
  const rows = [player('qb', 'QB', 20), player('wr', 'WR', 10), unavailable];
  const request = { mode: 'lineup' as const, leagueId: league.id, teamId: 'mine', week: 5 };
  const plan = buildFantasyAdvicePlan(connected, request, rows, asOf);
  expect(plan.lineup?.assignments.map((r) => r.playerId)).toEqual(['qb', 'wr']);
  expect(adviceDecisionPolicy(request, plan, undefined, plan.players).maximumVerdict).toBe(
    'recommend',
  );
  delete unavailable.weeklyGameStatus;
  delete unavailable.projectedPoints;
  const unknown = buildFantasyAdvicePlan(connected, request, rows, asOf);
  expect(adviceDecisionPolicy(request, unknown, undefined, unknown.players).maximumVerdict).toBe(
    'insufficient',
  );
  unavailable.weeklyGameStatus = 'bye';
  connected.teams[0]!.roster = connected.teams[0]!.roster!.filter((p) => p.id !== 'wr');
  connected.teams[0]!.rosterSize = 2;
  const incomplete = buildFantasyAdvicePlan(connected, request, rows, asOf);
  expect(incomplete.lineup?.complete).toBe(false);
  expect(
    adviceDecisionPolicy(request, incomplete, undefined, incomplete.players).maximumVerdict,
  ).toBe('insufficient');
});

it('calculates a legal weekly lineup and limits current-start comparison to the selected week', () => {
  const data = [player('qb', 'QB', 20), player('wr', 'WR', 10)];
  const plan = buildFantasyAdvicePlan(
    { ...league, matchups: [{ week: 4, teams: [{ teamId: 'mine', starters: ['qb', 'wr'] }] }] },
    { mode: 'lineup', teamId: 'mine', week: 5 },
    data,
    asOf,
  );
  expect(plan.lineup?.points).toBe(30);
  expect(plan.metrics.find((metric) => metric.id === 'lineup-current')).toBeUndefined();
  expect(plan.warnings.join(' ')).toContain('Current starter assignments are incomplete');
  expect(
    buildFantasyAdvicePlan(
      league,
      { mode: 'lineup', teamId: 'mine' },
      data.map((row) => ({ ...row, projectionScope: 'season' })),
      asOf,
    ).lineup?.points,
  ).toBeUndefined();
});

it('evaluates trade starting-slot impact instead of adding bench point totals', () => {
  const data = [
    player('qb', 'QB', 200, 'remaining-season'),
    player('wr', 'WR', 150, 'remaining-season'),
    player('incoming-1', 'WR', 100, 'remaining-season'),
    player('incoming-2', 'WR', 90, 'remaining-season'),
  ];
  const request = {
    mode: 'trade' as const,
    teamId: 'mine',
    tradeTeamId: 'other',
    giveIds: ['wr'],
    receiveIds: ['incoming-1', 'incoming-2'],
  };
  const plan = buildFantasyAdvicePlan(league, request, data, asOf);
  expect(plan.metrics.find((metric) => metric.id === 'trade-gain')?.value).toBe(-50);
  expect(plan.lineup?.points).toBe(350);
  expect(plan.alternativeLineup?.points).toBe(300);
  const shorter = buildFantasyAdvicePlan(
    league,
    { ...request, throughWeek: 17 },
    data.map((row) => ({
      ...row,
      projectedPoints: row.projectedPoints! * 0.9,
      projectionPeriod: { season: 2026, fromWeek: 5, throughWeek: 17 },
    })),
    asOf,
  );
  expect(shorter.metrics.find((metric) => metric.id === 'trade-gain')?.value).toBe(-45);
  for (const change of [
    { projectionScope: 'season' as const },
    { projectionPeriod: { season: 2025, fromWeek: 5, throughWeek: 18 } },
    { projectionPeriod: { season: 2026, fromWeek: 4, throughWeek: 18 } },
    { projectionPeriod: undefined },
  ]) {
    const invalid = buildFantasyAdvicePlan(
      league,
      request,
      data.map((row) => {
        const changed = { ...row };
        if ('projectionScope' in change) changed.projectionScope = change.projectionScope;
        else if (change.projectionPeriod) changed.projectionPeriod = change.projectionPeriod;
        else delete changed.projectionPeriod;
        return changed;
      }),
      asOf,
    );
    expect(invalid.metrics.find((metric) => metric.id === 'trade-gain')).toBeUndefined();
    expect(
      adviceDecisionPolicy({ ...request, leagueId: league.id }, invalid, undefined, invalid.players)
        .maximumVerdict,
    ).toBe('insufficient');
  }
  expect(() =>
    buildFantasyAdvicePlan(league, { ...request, giveIds: ['incoming-1'] }, data, asOf),
  ).toThrow('selected teams');
});

it('ranks free waiver players by marginal lineup gain and refuses rostered selections', () => {
  const data = [
    player('qb', 'QB', 20),
    player('wr', 'WR', 10),
    player('free', 'WR', 15),
    player('incoming-1', 'WR', 30),
    player('incoming-2', 'WR', 25),
  ];
  const plan = buildFantasyAdvicePlan(league, { mode: 'waivers', teamId: 'mine' }, data, asOf);
  expect(plan.candidates).toHaveLength(1);
  expect(plan.candidates[0]).toMatchObject({ playerId: 'free', value: 5 });
  expect(plan.warnings.join(' ')).toContain('legal drop');
  expect(() =>
    buildFantasyAdvicePlan(
      league,
      { mode: 'waivers', teamId: 'mine', candidateIds: ['incoming-1'] },
      data,
      asOf,
    ),
  ).toThrow('already rostered');
});

it('recomputes every starting slot after a waiver drop instead of assigning add-only gains', () => {
  const connected = structuredClone(league);
  connected.teams[0]!.roster!.push({ id: 'qb-backup', name: 'qb-backup', position: 'QB' });
  connected.teams[0]!.rosterSize = 3;
  const data = [
    player('qb', 'QB', 30),
    player('qb-backup', 'QB', 5),
    player('wr', 'WR', 10),
    player('free', 'WR', 15),
  ];
  const request = {
    mode: 'waivers' as const,
    teamId: 'mine',
    candidateIds: ['free'],
    dropPlayerId: 'qb',
  };
  const plan = buildFantasyAdvicePlan(connected, request, data, asOf);
  expect(plan.candidates[0]?.value).toBe(-20);
  expect(plan.metrics.find((m) => m.id === 'waiver-before')?.value).toBe(40);
  expect(plan.metrics.find((m) => m.id === 'waiver-drop')?.value).toBe(30);
  expect(plan.metrics.find((m) => m.id === 'free:waiver-after')?.value).toBe(20);
  const policy = adviceDecisionPolicy(request, plan, undefined, plan.players);
  expect(policy.maximumVerdict).toBe('hold');
  const better = buildFantasyAdvicePlan(connected, { ...request, dropPlayerId: 'wr' }, data, asOf);
  expect(better.candidates[0]?.value).toBe(5);
  expect(
    adviceDecisionPolicy({ ...request, dropPlayerId: 'wr' }, better, undefined, better.players)
      .maximumVerdict,
  ).toBe('recommend');
  const screenRequest = {
    mode: request.mode,
    teamId: request.teamId,
    candidateIds: request.candidateIds,
  };
  const screen = buildFantasyAdvicePlan(connected, screenRequest, data, asOf);
  expect(screen.candidates[0]?.value).toBe(5);
  expect(
    adviceDecisionPolicy(screenRequest, screen, undefined, screen.players).maximumVerdict,
  ).toBe('lean');
  expect(() =>
    buildFantasyAdvicePlan(connected, { ...request, dropPlayerId: 'incoming-1' }, data, asOf),
  ).toThrow('owned player');
  const noQuarterback = buildFantasyAdvicePlan(
    league,
    request,
    data.filter((p) => p.id !== 'qb-backup'),
    asOf,
  );
  expect(noQuarterback.candidates[0]?.value).toBeUndefined();
});

it('excludes inactive waiver options and permits a complete active roster despite an inactive bench estimate', () => {
  const connected = structuredClone(league);
  connected.teams[0]!.roster!.push({ id: 'inactive', name: 'inactive', position: 'WR' });
  connected.teams[0]!.rosterSize = 3;
  const inactive = player('inactive', 'WR', 100);
  inactive.status = 'Out';
  delete inactive.projectedPoints;
  const unavailable = player('unavailable', 'WR', 200);
  unavailable.status = 'Out';
  const data = [
    player('qb', 'QB', 20),
    player('wr', 'WR', 10),
    inactive,
    player('free', 'WR', 15),
    unavailable,
  ];
  const request = { mode: 'waivers' as const, teamId: 'mine', dropPlayerId: 'inactive' };
  const plan = buildFantasyAdvicePlan(connected, request, data, asOf);
  expect(plan.candidates.map((c) => c.playerId)).toEqual(['free']);
  expect(plan.candidates[0]?.value).toBe(5);
  expect(adviceDecisionPolicy(request, plan, undefined, plan.players).maximumVerdict).toBe(
    'recommend',
  );
});

it('calculates draft replacement using league-wide starting demand and compares actual picks to ADP', () => {
  const empty = {
    ...league,
    teams: league.teams.map((team) => ({ ...team, roster: [], rosterSize: 0 })),
  };
  const data = [
    player('QB1', 'QB', 300, 'season'),
    player('QB2', 'QB', 250, 'season'),
    player('QB3', 'QB', 200, 'season'),
    player('WR1', 'WR', 250, 'season'),
    player('WR2', 'WR', 200, 'season'),
    player('WR3', 'WR', 150, 'season'),
  ];
  const plan = buildFantasyAdvicePlan(empty, { mode: 'draft-plan', teamId: 'mine' }, data, asOf);
  expect(plan.candidates.find((candidate) => candidate.playerId === 'QB1')?.value).toBe(100);
  data[0]!.metrics.push({
    id: 'QB1:adp',
    label: 'Imported ADP',
    value: 5,
    unit: 'pick',
    sourceIds: ['import'],
  });
  const completed = {
    ...empty,
    draft: { id: 'draft', picks: [{ playerId: 'QB1', teamId: 'mine', pickNumber: 7 }] },
  };
  const review = buildFantasyAdvicePlan(
    completed,
    { mode: 'draft-review', teamId: 'mine' },
    data,
    asOf,
  );
  expect(review.metrics.find((metric) => metric.id === 'QB1:draft-adp')?.value).toBe(2);
  expect(review.metrics.find((metric) => metric.id === 'QB1:replacement')).toMatchObject({
    value: 100,
    description: expect.stringContaining('not draft-time value'),
  });
  expect(() =>
    buildFantasyAdvicePlan(
      completed,
      { mode: 'draft-plan', teamId: 'mine', candidateIds: ['QB1'] },
      data,
      asOf,
    ),
  ).toThrow('already picked');
});

it('withholds complete totals and lowers evidence confidence for partial league/roster snapshots', () => {
  const partial = { ...league, teams: [{ ...league.teams[0]!, rosterSize: 3 }] };
  const data = [player('qb', 'QB', 20), player('wr', 'WR', 10), player('free', 'WR', 15)];
  const lineup = buildFantasyAdvicePlan(partial, { mode: 'lineup', teamId: 'mine' }, data, asOf);
  expect(lineup.lineup?.complete).toBe(false);
  expect(lineup.lineup?.points).toBeUndefined();
  expect(lineup.confidence.score).toBeLessThanOrEqual(49);
  const waivers = buildFantasyAdvicePlan(partial, { mode: 'waivers', teamId: 'mine' }, data, asOf);
  expect(waivers.warnings.join(' ')).toContain('free-agent availability cannot be verified');
  expect(waivers.confidence.score).toBeLessThanOrEqual(49);
});

it('retains every explicitly selected draft/waiver player with missing estimates and refuses a complete-comparison claim', () => {
  for (const mode of ['draft-plan', 'waivers'] as const) {
    const scope = mode === 'draft-plan' ? 'season' : 'week';
    const rows = [
      player('qb', 'QB', 20, scope),
      player('wr', 'WR', 10, scope),
      player('supported', 'WR', 15, scope),
      player('rookie', 'WR', 0, scope),
    ];
    const rookie = rows[3]!;
    delete rookie.projectedPoints;
    rookie.metrics = [
      {
        id: 'rookie:nfl-draft-pick',
        label: 'NFL draft pick',
        value: 20,
        unit: 'pick',
        sourceIds: ['nfl-draft-picks'],
      },
    ];
    rookie.historicalPoints = [];
    rookie.warnings = ['No scoring-confirmed estimate is available.'];
    const request = {
      mode,
      leagueId: league.id,
      teamId: 'mine',
      candidateIds: ['supported', 'rookie'],
    };
    const plan = buildFantasyAdvicePlan(league, request, rows, asOf);
    expect(plan.players.find((p) => p.id === 'rookie')).toMatchObject({
      metrics: rookie.metrics,
      warnings: rookie.warnings,
    });
    expect(plan.candidates.map((c) => c.playerId)).toEqual(['supported']);
    expect(adviceDecisionPolicy(request, plan, undefined, plan.players).maximumVerdict).toBe(
      'insufficient',
    );
  }
});
