import { expect, it } from 'vitest';
import {
  buildFootballContext,
  buildPlayerEvidence,
  type AdviceMetric,
  type FootballDataSnapshot,
  type FootballDataSource,
  type LeagueConnection,
  type PlayerAdviceEvidence,
} from '@sidekick/core';
import {
  budgetAdviceEvidence,
  compactAdviceEvidence,
  expandCompactAdviceEvidence,
} from './advice-evidence-budget.js';

const source: FootballDataSource = { id: 'games', name: 'Games', status: 'available' };
const metric = (id: string): AdviceMetric => ({
  id,
  label: 'Prior matched recorded performance',
  value: 12,
  unit: 'points/game',
  sourceIds: ['games'],
  sampleSize: 8,
  description: 'Recorded prior games; not an individual projection or a forecast.',
});
const player = (id: string): PlayerAdviceEvidence => ({
  id,
  name: `Fictional ${id}`,
  position: 'WR',
  projectedPoints: 12,
  projectionScope: 'week',
  projectionMethod: 'imported',
  projectionSourceIds: ['projection:used'],
  historicalPoints: [],
  metrics: [metric(`${id}:sample`), metric(`${id}:projected`), metric(`${id}:points-mean`)],
  warnings: [],
});

it('keeps draft-profile provenance and numerical draft facts while trimming optional detail', () => {
  const rookie = player('rookie');
  rookie.draftProfile = {
    sourceId: 'nfl-draft-picks',
    pfrId: 'FictRo00',
    gsisId: '00-0040999',
    name: rookie.name,
    position: 'WR',
    season: 2026,
    round: 1,
    pick: 20,
    draftTeam: 'ATL',
  };
  rookie.metrics.push(
    ...['year', 'round', 'pick', 'age'].map((key, i) => ({
      ...metric(`rookie:nfl-draft-${key}`),
      value: [2026, 1, 20, 0][i]!,
      sourceIds: ['nfl-draft-picks'],
    })),
  );
  rookie.metrics.push(...Array.from({ length: 40 }, (_, i) => metric(`rookie:optional-${i}`)));
  const output = budgetAdviceEvidence(
    [rookie],
    [],
    [
      source,
      { id: 'nfl-draft-picks', name: 'Public draft facts', status: 'available' },
      { id: 'projection:used', name: 'Projection', status: 'available' },
    ],
    new Set(),
  );
  expect(output.omitted).toBeGreaterThan(0);
  expect(output.players[0]!.draftProfile).toEqual(rookie.draftProfile);
  expect(output.players[0]!.metrics.filter((m) => m.id.includes(':nfl-draft-'))).toHaveLength(4);
  expect(output.sources.find((s) => s.id === 'nfl-draft-picks')!.status).toBe('available');
});

it('shares metric caveats in model prompts while persisted metrics keep their descriptions', () => {
  const players = [player('a')],
    metrics = [metric('total')];
  const result = compactAdviceEvidence(players, metrics, [source]);
  expect(result.metricNotes).toEqual([metrics[0]!.description]);
  expect(result.players[0]!.metrics[0]).toMatchObject({ id: 'a:sample', note: 0 });
  expect(result.metrics[0]).toMatchObject({ id: 'total', note: 0 });
  expect(result.metricProfiles[result.metrics[0]!.profile]).toEqual({
    label: metrics[0]!.label,
    unit: metrics[0]!.unit,
    sourceIds: metrics[0]!.sourceIds,
    sampleSize: metrics[0]!.sampleSize,
  });
  expect(players[0]!.metrics[0]!.description).toBeTruthy();
});

it('round-trips metric units, samples, sources and every player caveat through shared prompt metadata', () => {
  const players = [player('a'), player('b')];
  players[0]!.warnings = ['Shared availability limit', 'Only this player has uncertain workload'];
  players[1]!.warnings = ['Shared availability limit'];
  const result = compactAdviceEvidence(players, [], [source]);
  expect(result.playerWarningNotes).toHaveLength(2);
  expect(expandCompactAdviceEvidence(result).players).toEqual(players);
  for (const [index, p] of result.players.entries()) {
    expect(p.warningNotes.map((note) => result.playerWarningNotes[note])).toEqual(
      players[index]!.warnings,
    );
    for (const [metricIndex, m] of p.metrics.entries()) {
      const { profile, note, ...values } = m;
      expect({
        ...values,
        ...result.metricProfiles[profile],
        ...(note === undefined ? {} : { description: result.metricNotes[note] }),
      }).toEqual(players[index]!.metrics[metricIndex]);
    }
  }
});

it('preserves every comparison player, primary estimate and decision total within prompt/history limits', () => {
  const players = Array.from({ length: 40 }, (_, index) => {
    const p = player(`player-${index}`);
    p.metrics.push(
      ...Array.from({ length: 22 }, (_, detail) => ({
        ...metric(`${p.id}:recent-detail-${detail}`),
        label: `Recorded role and opponent context ${detail}: ${'supporting evidence '.repeat(5)}`,
        description: `Context ${detail} includes all position players, recorded sample coverage and descriptive historical evidence. ${'No future forecast is implied. '.repeat(4)}`,
      })),
    );
    return p;
  });
  const before = structuredClone(players);
  const required = metric('lineup-optimized');
  const sources = [
    source,
    { id: 'projection:used', name: 'Used import', status: 'available' as const },
    ...Array.from({ length: 80 }, (_, i) => ({
      id: `projection:unused-${i}`,
      name: 'Unused import',
      status: 'available' as const,
    })),
  ];
  const result = budgetAdviceEvidence(players, [required], sources, new Set([required.id]));
  expect(result.omitted).toBeGreaterThan(0);
  expect(result.players.map((p) => p.id)).toEqual(players.map((p) => p.id));
  expect(result.metrics).toEqual([required]);
  for (const p of result.players) {
    expect(p.metrics.map((m) => m.id)).toEqual(
      expect.arrayContaining([`${p.id}:sample`, `${p.id}:projected`, `${p.id}:points-mean`]),
    );
    expect(p.metrics.length).toBeLessThanOrEqual(30);
    expect(p.metrics.some((m) => m.id.includes(':recent-'))).toBe(true);
  }
  expect(
    Buffer.byteLength(
      JSON.stringify(compactAdviceEvidence(result.players, result.metrics, result.sources)),
    ),
  ).toBeLessThanOrEqual(72_000);
  expect(
    Buffer.byteLength(
      JSON.stringify({ players: result.players, metrics: result.metrics, sources: result.sources }),
    ),
  ).toBeLessThanOrEqual(145_000);
  expect(result.sources.map((s) => s.id)).toEqual(['games', 'projection:used']);
  expect(players).toEqual(before);
});

it('retains missing source metadata as unavailable and refuses to remove required evidence', () => {
  const required = Array.from({ length: 500 }, (_, i) => ({
    ...metric(`required-${i}`),
    label: 'x'.repeat(300),
    sourceIds: ['missing'],
  }));
  expect(() => budgetAdviceEvidence([], required, [], new Set(required.map((m) => m.id)))).toThrow(
    'Required comparison evidence',
  );
  const result = budgetAdviceEvidence([], [required[0]!], [], new Set([required[0]!.id]));
  expect(result.sources).toEqual([
    { id: 'missing', name: 'Unavailable evidence metadata: missing', status: 'unavailable' },
  ]);
  expect(result.omitted).toBe(0);
});

it('does not mistake optional team sample totals for protected player estimates', () => {
  const players = [player('a')];
  const required = metric('decision:sample');
  const optional = Array.from({ length: 300 }, (_, i) => ({
    ...metric(`team-${i}:sample`),
    label: 'Optional team context '.repeat(15),
    description: 'Optional descriptive team totals. '.repeat(8),
  }));
  const result = budgetAdviceEvidence(
    players,
    [required, ...optional],
    [source],
    new Set([required.id]),
  );
  expect(result.omitted).toBeGreaterThan(0);
  expect(result.players).toEqual(players);
  expect(result.metrics).toContainEqual(required);
});

it('never trims the automatic forecast decomposition, uncertainty or evaluation to keep a naked point estimate', () => {
  const suffixes = [
    'baseline',
    'form',
    'workload',
    'opponent',
    'games',
    'recorded',
    'lower',
    'upper',
    'mae',
    'test-weeks',
    'baseline-mae',
  ];
  const players = Array.from({ length: 20 }, (_, index) => {
    const p = player(`automatic-${index}`);
    p.projectionMethod = 'rolling-form-v1';
    p.projectionSourceIds = ['games'];
    p.metrics.push(
      ...suffixes.map((suffix) => metric(`${p.id}:forecast-${suffix}`)),
      ...Array.from({ length: 20 }, (_, i) => ({
        ...metric(`${p.id}:optional-${i}`),
        label: 'optional '.repeat(50),
      })),
    );
    return p;
  });
  const result = budgetAdviceEvidence(players, [], [source], new Set());
  expect(result.omitted).toBeGreaterThan(0);
  for (const p of result.players) {
    expect(p.metrics.map((m) => m.id)).toEqual(
      expect.arrayContaining(suffixes.map((suffix) => `${p.id}:forecast-${suffix}`)),
    );
    expect(p.projectionMethod).toBe('rolling-form-v1');
  }
});

it('fits thirty engine-generated season profiles with actual descriptions, context and protected forecast evidence', () => {
  const asOf = '2026-10-07T12:00:00Z';
  const teams = ['BUF', 'MIA', 'KC', 'NYJ', 'NE', 'LA', 'SF', 'SEA'];
  const roster = teams.flatMap((nflTeam, index) =>
    ['QB', 'RB', 'WR', 'TE'].map((position) => ({
      id: `platform-${index}-${position}`,
      gsisId: `gsis-${index}-${position}`,
      name: `Fictional ${index} ${position}`,
      nflTeam,
      position,
    })),
  );
  const data: FootballDataSnapshot = {
    season: 2026,
    games: [],
    players: [],
    market: [],
    warnings: [],
    sources: ['games', 'stats-2024', 'stats-2025', 'stats-2026'].map((id) => ({
      id,
      name: id,
      status: 'available',
      retrievedAt: asOf,
    })),
  };
  for (const season of [2024, 2025, 2026])
    for (let week = 1; week <= 18; week++) {
      if (week === 10) continue;
      for (let pair = 0; pair < 4; pair++) {
        const complete = season < 2026 || week < 5;
        const game = {
          id: `${season}-${week}-${pair}`,
          season,
          week,
          seasonType: 'REG',
          date: new Date(Date.UTC(season, 8, 13) + (week - 1) * 7 * 86400000)
            .toISOString()
            .slice(0, 10),
          home: teams[pair * 2]!,
          away: teams[pair * 2 + 1]!,
          ...(complete ? { homeScore: 24, awayScore: 21 } : {}),
        };
        data.games.push(game);
        if (complete)
          for (const p of roster.filter((p) => [game.home, game.away].includes(p.nflTeam)))
            data.players.push({
              playerId: p.gsisId,
              name: p.name,
              position: p.position,
              team: p.nflTeam,
              opponent: p.nflTeam === game.home ? game.away : game.home,
              gameId: game.id,
              season,
              week,
              seasonType: 'REG',
              stats: {
                passing_yards: 200,
                receiving_yards: 70,
                rushing_yards: 40,
                attempts: 30,
                targets: 7,
                carries: 10,
              },
            });
      }
    }
  const league: LeagueConnection = {
    id: 'budget',
    name: 'Fictional',
    displayName: 'Fictional',
    platform: 'sleeper',
    season: 2026,
    teamCount: 12,
    teams: [],
    settings: {},
    connectedAt: asOf,
    scoring: { pass_yd: 0.04, rush_yd: 0.1, rec_yd: 0.1 },
  };
  for (const scope of ['season', 'remaining-season'] as const) {
    const selected = roster.slice(0, 30);
    const players = buildPlayerEvidence({
      league,
      players: selected,
      projections: [],
      data,
      season: 2026,
      week: 5,
      throughWeek: 17,
      scope,
      asOf,
    });
    const context = buildFootballContext(data, { season: 2026, week: 5, asOf }, selected, league);
    for (const p of players) {
      const details = context.players.get(p.id)!;
      p.metrics.push(
        ...details.metrics.filter(
          (m) =>
            !m.id.includes(':history-') ||
            !p.metrics.some((existing) => existing.id === m.id.replace(':history-', ':')),
        ),
      );
      p.warnings.push(...details.warnings);
      if (details.matchup) p.matchup = details.matchup;
    }
    const total = metric('decision-total');
    const candidates = Array.from({ length: 12 }, (_, i) => metric(`candidate-${i}:replacement`));
    const result = budgetAdviceEvidence(
      players,
      [total, ...candidates, ...context.metrics],
      data.sources,
      new Set([total.id, ...candidates.map((m) => m.id)]),
    );
    expect(result.players).toHaveLength(30);
    expect(result.metrics).toContainEqual(total);
    for (const p of result.players) {
      expect(p.projectionMethod).toMatch(/^rolling-/);
      for (const suffix of [
        'baseline',
        'form',
        'workload',
        'opponent',
        'games',
        'recorded',
        'lower',
        'upper',
        'mae',
        'test-weeks',
        'baseline-mae',
        'candidate-mae',
      ])
        expect(p.metrics.find((m) => m.id === `${p.id}:forecast-${suffix}`)).toEqual(
          players
            .find((input) => input.id === p.id)!
            .metrics.find((m) => m.id === `${p.id}:forecast-${suffix}`),
        );
      expect(p.metrics.find((m) => m.id === `${p.id}:projected`)!.value).toBe(p.projectedPoints);
      expect(p.warnings).toEqual(players.find((input) => input.id === p.id)!.warnings);
    }
    expect(
      Buffer.byteLength(
        JSON.stringify(compactAdviceEvidence(result.players, result.metrics, result.sources)),
      ),
    ).toBeLessThanOrEqual(72_000);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(145_000);
  }
});

it('retains a full defense cohort provenance and removes unrelated optional defense sources', () => {
  const sources = Array.from({ length: 63 }, (_, i) => ({
    id: `dst-${i}`,
    name: `Week ${i}`,
    status: 'available' as const,
  }));
  const evidence = { ...player('DEF'), projectionSourceIds: sources.slice(0, 60).map((s) => s.id) };
  const result = budgetAdviceEvidence([evidence], [], [source, ...sources], new Set());
  expect(result.sources).toHaveLength(61);
  expect(result.players[0]!.projectionSourceIds).toHaveLength(60);
  expect(result.sources.some((s) => s.id === 'dst-62')).toBe(false);
});

it('preserves forecast yardage, catches and future/recorded decomposition when trimming a large comparison', () => {
  const keys = [
    'future',
    'recorded',
    'games',
    'issued-week',
    'receptions',
    'receiving_yards',
    'receiving_tds',
    'targets',
  ];
  const players = Array.from({ length: 20 }, (_, index) => {
    const value = player(`forecast-${index}`);
    value.projectionMethod = 'public-projection-v1';
    value.metrics.push(...keys.map((key) => metric(`${value.id}:forecast-${key}`)));
    value.metrics.push(
      ...Array.from({ length: 40 }, (_, i) => metric(`${value.id}:optional-${i}`)),
    );
    return value;
  });
  const output = budgetAdviceEvidence(
    players,
    [],
    [source, { id: 'projection:used', name: 'Fixture', status: 'available' }],
    new Set(),
  );
  expect(output.omitted).toBeGreaterThan(0);
  for (const value of output.players) {
    expect(value.metrics.map((m) => m.id)).toEqual(
      expect.arrayContaining(keys.map((key) => `${value.id}:forecast-${key}`)),
    );
    expect(value.metrics.length).toBeLessThanOrEqual(30);
  }
  expect(
    Buffer.byteLength(
      JSON.stringify(compactAdviceEvidence(output.players, output.metrics, output.sources)),
    ),
  ).toBeLessThanOrEqual(72000);
});

it('keeps only referenced public forecast pages in the source closure', () => {
  const value = player('rookie');
  value.projectionMethod = 'public-projection-v1';
  value.projectionSourceIds = ['espn-forecasts-2026-0', 'games'];
  value.metrics = [{ ...metric('rookie:projected'), sourceIds: value.projectionSourceIds }];
  const output = budgetAdviceEvidence(
    [value],
    [],
    [
      source,
      ...[0, 100, 200, 300, 400].map((offset) => ({
        id: `espn-forecasts-2026-${offset}`,
        name: 'Public forecasts',
        status: 'available' as const,
      })),
    ],
    new Set(),
  );
  expect(output.sources.map((source) => source.id)).toEqual(['games', 'espn-forecasts-2026-0']);
});
