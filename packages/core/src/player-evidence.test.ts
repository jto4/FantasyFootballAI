import { questionableSettings } from './fantasy-projection-settings.js';
import { expect, it } from 'vitest';
import type { LeagueConnection, PlayerProjection, RosterPlayer } from './domain-types.js';
import type { FootballDataSnapshot, FootballGame, PlayerGameStats } from './advice-types.js';
import {
  buildPlayerEvidence,
  buildPlayerMarketEvidence,
  type PlayerEvidenceInput,
} from './player-evidence.js';

const player: RosterPlayer = {
  id: 'platform-1',
  name: 'Fictional Receiver',
  position: 'WR',
  nflTeam: 'BUF',
  status: 'Active',
};
const league: LeagueConnection = {
  id: 'league',
  name: 'Test',
  displayName: 'Test',
  platform: 'sleeper',
  teamCount: 2,
  season: 2026,
  teams: [],
  settings: {},
  scoring: { rec: 1, rec_yd: 0.1 },
  connectedAt: '2026-09-01',
};
const rows: PlayerGameStats[] = Array.from({ length: 4 }, (_value, index) => ({
  playerId: 'gsis-1',
  name: player.name,
  position: 'WR',
  team: 'BUF',
  opponent: 'MIA',
  gameId: `game-${index}`,
  season: 2026,
  week: index + 1,
  seasonType: 'REG',
  stats: {
    receptions: 5,
    receiving_yards: 50 + 10 * index,
    targets: 8,
    carries: 0,
    rushing_yards: 0,
    passing_yards: 0,
  },
}));
const games: FootballGame[] = rows.map((row, index) => ({
  id: row.gameId,
  season: 2026,
  week: row.week,
  seasonType: 'REG',
  date: `2026-09-${10 + index}`,
  home: 'BUF',
  away: 'MIA',
  homeScore: 24,
  awayScore: 21,
}));
games.push({
  id: 'next',
  season: 2026,
  week: 5,
  seasonType: 'REG',
  date: '2026-10-11',
  home: 'BUF',
  away: 'MIA',
});
const data: FootballDataSnapshot = {
  season: 2026,
  players: rows,
  games,
  sources: [
    {
      id: 'games',
      name: 'Games',
      url: 'https://example.test/games',
      status: 'available',
      retrievedAt: '2026-10-07',
    },
  ],
  market: [{ sleeperId: player.id, lookbackHours: 24, adds: 21 }],
  warnings: [],
};
const input: PlayerEvidenceInput = {
  league,
  players: [player],
  data,
  projections: [],
  season: 2026,
  week: 5,
  scope: 'week',
  asOf: '2026-10-07T12:00:00Z',
};
it('establishes a bench bye only from a complete unambiguous team season schedule', () => {
  const complete = Array.from({ length: 17 }, (_, i) => {
    const week = i < 4 ? i + 1 : i + 2;
    return { ...games[0]!, id: `schedule-${week}`, week };
  });
  const result = (schedule: FootballGame[]) =>
    buildPlayerEvidence({ ...input, data: { ...data, games: schedule } })[0]!;
  expect(result(complete).weeklyGameStatus).toBe('bye');
  expect(result(complete).projectedPoints).toBeUndefined();
  expect(result(complete.slice(1)).weeklyGameStatus).toBeUndefined();
  expect(result([...complete.slice(1), complete[1]!]).weeklyGameStatus).toBeUndefined();
  expect(result(games).weeklyGameStatus).toBeUndefined();
});

it('withholds weekly historical estimates for recorded PUP and NFI players while preserving uncertainty for questionable players', () => {
  for (const status of ['PUP', 'NFI']) {
    const row = buildPlayerEvidence({ ...input, players: [{ ...player, status }] })[0]!;
    expect(row.projectedPoints).toBeUndefined();
    expect(row.warnings.join(' ')).toContain(`Recorded status is ${status}`);
  }
  const questionable = buildPlayerEvidence({
    ...input,
    players: [{ ...player, status: 'Questionable' }],
  })[0]!;
  expect(questionable.projectedPoints).toBeDefined();
  expect(questionable.warnings.join(' ')).toContain('Recheck before kickoff');
});
const projection = (values: Partial<PlayerProjection> = {}): PlayerProjection => ({
  id: 'row',
  sourceId: 'source-a',
  leagueId: 'league',
  scoringMatched: true,
  playerId: player.id,
  playerName: player.name,
  position: 'WR',
  projectedPoints: 15,
  week: 5,
  sourceName: 'Fictional import',
  importedAt: input.asOf,
  ...values,
});

it('uses only the declared remaining season/window and never subtracts played points from full-season forecasts', () => {
  const full = projection({ projectedPoints: 400 });
  delete full.week;
  const remaining = projection({
    sourceId: 'remaining',
    projectedPoints: 130,
    period: { season: 2026, fromWeek: 5, throughWeek: 18 },
  });
  delete remaining.week;
  const rows = [
    full,
    remaining,
    {
      ...remaining,
      sourceId: 'wrong-year',
      projectedPoints: 900,
      period: { season: 2025, fromWeek: 5, throughWeek: 18 },
    },
    {
      ...remaining,
      sourceId: 'past-week',
      projectedPoints: 800,
      period: { season: 2026, fromWeek: 4, throughWeek: 18 },
    },
    {
      ...remaining,
      sourceId: 'short-window',
      projectedPoints: 700,
      period: { season: 2026, fromWeek: 5, throughWeek: 17 },
    },
  ];
  const [evidence] = buildPlayerEvidence({
    ...input,
    scope: 'remaining-season',
    projections: rows,
  });
  expect(evidence).toMatchObject({
    projectedPoints: 130,
    projectionScope: 'remaining-season',
    projectionPeriod: { season: 2026, fromWeek: 5, throughWeek: 18 },
    projectionSourceIds: ['projection:remaining'],
  });
  expect(evidence!.metrics.find((metric) => metric.id.endsWith(':projected'))?.unit).toBe(
    'remaining points',
  );
  const [missing] = buildPlayerEvidence({
    ...input,
    scope: 'remaining-season',
    projections: [full],
  });
  expect(missing!.projectedPoints).toBeUndefined();
  expect(missing!.warnings.join(' ')).toContain('were not reused or reduced');
  const [draft] = buildPlayerEvidence({ ...input, scope: 'season', projections: rows });
  expect(draft!.projectedPoints).toBe(400);
  const [shorter] = buildPlayerEvidence({
    ...input,
    scope: 'remaining-season',
    throughWeek: 17,
    projections: rows,
  });
  expect(shorter).toMatchObject({
    projectedPoints: 700,
    projectionPeriod: { season: 2026, fromWeek: 5, throughWeek: 17 },
  });
});

it('uses verified GSIS identity to resolve matching names without mixing player histories', () => {
  const ambiguous = [
    ...rows,
    ...rows.map((row) => ({
      ...row,
      playerId: 'different-gsis',
      stats: { ...row.stats, receiving_yards: 900 },
    })),
  ];
  const evidence = buildPlayerEvidence({
    ...input,
    players: [{ ...player, gsisId: 'gsis-1' }],
    data: { ...data, players: ambiguous },
  })[0]!;
  expect(evidence.metrics.find((metric) => metric.id.endsWith(':sample'))?.value).toBe(4);
  expect(evidence.projectedPoints).toBeCloseTo(11.5, 0);
  expect(evidence.warnings.join(' ')).not.toContain('Multiple NFL players');
});

it('uses an explicit Sleeper mapping for Yahoo/ESPN/NFL decisions without comparing their other identifiers', () => {
  const mapped = { ...player, id: 'yahoo-identifier', gsisId: 'gsis-1', sleeperId: player.id };
  expect(buildPlayerMarketEvidence(mapped, data)).toEqual([
    expect.objectContaining({
      id: 'yahoo-identifier:market-adds',
      value: 21,
      sourceIds: ['market-add'],
    }),
  ]);
  expect(
    buildPlayerMarketEvidence(
      { ...mapped, id: player.id, sleeperId: 'different-sleeper-id' },
      data,
    ),
  ).toEqual([]);
  expect(buildPlayerMarketEvidence({ ...player, gsisId: player.id }, data)).toEqual([]);
  expect(
    buildPlayerMarketEvidence(mapped, { ...data, market: [...data.market, ...data.market] }),
  ).toEqual([]);
});

it('projects the week with the app’s own model, with supporting sample/workload stats and market activity', () => {
  const evidence = buildPlayerEvidence(input)[0]!;
  expect(evidence.historicalPoints).toEqual([13, 12, 11, 10]);
  // Recent games weigh more, so a rising 10 → 13 trend projects a little above the plain 11.5.
  expect(evidence.projectedPoints).toBeGreaterThan(11.5);
  expect(evidence.projectedPoints).toBeLessThan(13);
  expect(evidence.projectionMethod).toBe('sidekick-model-v1');
  expect(evidence.metrics.find((metric) => metric.id.endsWith(':targets'))).toMatchObject({
    value: 8,
    sampleSize: 4,
  });
  expect(evidence.metrics.find((metric) => metric.id.endsWith(':market-adds'))).toMatchObject({
    value: 21,
    sourceIds: ['market-add'],
  });
  expect(evidence.metrics.find((metric) => metric.id.endsWith(':market-drops'))).toBeUndefined();
  expect(evidence.warnings.join(' ')).toContain('for a player who plays');
  expect(evidence.playChance).toBeUndefined();
});

it('discounts a player listed Questionable and records his chance to play, unless switched off', () => {
  const usage = {
    snaps: new Map<string, number>(),
    depth: new Map(),
    questionable: new Set(['2026:5:gsis-1']),
  };
  const healthy = buildPlayerEvidence(input)[0]!;
  const listed = buildPlayerEvidence({ ...input, usage })[0]!;
  expect(listed.playChance).toBe(questionableSettings.playChance);
  expect(listed.projectedPoints! / healthy.projectedPoints!).toBeCloseTo(
    questionableSettings.whenPlaying,
    2,
  );
  expect(listed.metrics.find((m) => m.id.endsWith(':play-chance'))?.value).toBe(
    Math.round(questionableSettings.playChance * 100),
  );
  const off = buildPlayerEvidence({
    ...input,
    usage,
    preferences: { projectionAdjustments: { questionable: false } },
  })[0]!;
  expect(off.playChance).toBeUndefined();
  expect(off.projectedPoints).toBeCloseTo(healthy.projectedPoints!, 5);
});

it('applies an owner nudge to the decision value while the model metric keeps its own number', () => {
  const plain = buildPlayerEvidence(input)[0]!;
  const nudged = buildPlayerEvidence({
    ...input,
    preferences: {
      playerNudges: [
        { leagueId: input.league.id, playerId: plain.id, name: plain.name, percent: 20 },
      ],
    },
  })[0]!;
  expect(nudged.projectedPoints).toBeCloseTo(plain.projectedPoints! * 1.2, 1);
  const metric = (e: typeof plain, suffix: string) =>
    e.metrics.find((m) => m.id.endsWith(`:${suffix}`))?.value;
  expect(metric(nudged, 'projected')).toBe(metric(plain, 'projected'));
  expect(metric(nudged, 'adjusted-projection')).toBe(nudged.projectedPoints);
  expect(metric(nudged, 'owner-nudge')).toBe(20);
  expect(metric(plain, 'adjusted-projection')).toBeUndefined();
});

it('uses a median of scoring-matched, uniquely matched sources and respects week/league/scope', () => {
  const projections = [
    projection(),
    projection({ sourceId: 'source-b', projectedPoints: 21 }),
    projection({ sourceId: 'wrong-week', week: 4, projectedPoints: 100 }),
    projection({ sourceId: 'unconfirmed', scoringMatched: false, projectedPoints: 200 }),
    projection({ sourceId: 'wrong-league', leagueId: 'other', projectedPoints: 300 }),
  ];
  const evidence = buildPlayerEvidence({ ...input, projections })[0]!;
  expect(evidence.projectedPoints).toBe(18);
  expect(evidence.projectionMethod).toBe('imported');
  expect(evidence.projectionSourceIds).toEqual(['projection:source-a', 'projection:source-b']);
  expect(evidence.metrics.find((metric) => metric.id.endsWith(':source-spread'))?.value).toBe(6);
  expect(
    buildPlayerEvidence({ ...input, projections, scope: 'season' })[0]?.projectedPoints,
  ).toBeUndefined();
});

it('refuses ambiguous historical identities, duplicate import rows and name-only imports for ambiguous candidates', () => {
  const ambiguous = buildPlayerEvidence({
    ...input,
    data: { ...data, players: [...rows, ...rows.map((row) => ({ ...row, playerId: 'gsis-2' }))] },
  })[0]!;
  expect(ambiguous.historicalPoints).toEqual([]);
  expect(ambiguous.projectedPoints).toBeUndefined();
  expect(ambiguous.warnings.join(' ')).toContain('Multiple NFL players');
  const duplicate = buildPlayerEvidence({
    ...input,
    projections: [projection(), projection()],
  })[0]!;
  expect(duplicate.projectionMethod).toBe('sidekick-model-v1');
  expect(duplicate.warnings.join(' ')).toContain('Duplicate player rows');
  const nameOnly = projection();
  delete nameOnly.playerId;
  delete nameOnly.week;
  const twin = { ...player, id: 'platform-2' };
  expect(
    buildPlayerEvidence({
      ...input,
      scope: 'season',
      players: [player, twin],
      projections: [nameOnly],
    })[0]?.projectedPoints,
  ).toBeUndefined();
});

it('never replaces a conflicting explicit GSIS ID with a unique name match', () => {
  const result = buildPlayerEvidence({
    ...input,
    players: [{ ...player, gsisId: 'another-player' }],
  })[0]!;
  expect(result.historicalPoints).toEqual([]);
  expect(result.projectedPoints).toBeUndefined();
  expect(result.warnings.join(' ')).toContain('GSIS identity conflicts');
  // A separately supplied scoring-matched platform import is still usable.
  const imported = buildPlayerEvidence({
    ...input,
    players: [{ ...player, gsisId: 'another-player' }],
    projections: [projection()],
  })[0]!;
  expect(imported.projectedPoints).toBe(15);
  expect(imported.historicalPoints).toEqual([]);
});

it('withholds active-lineup estimates on bye/out flags while keeping factual statistics', () => {
  const out = buildPlayerEvidence({
    ...input,
    players: [{ ...player, status: 'Out' }],
    projections: [projection()],
  })[0]!;
  expect(out.projectedPoints).toBeUndefined();
  expect(out.metrics.find((metric) => metric.id.endsWith(':points-mean'))?.value).toBe(11.5);
  const bye = buildPlayerEvidence({ ...input, week: 6 })[0]!;
  expect(bye.projectedPoints).toBeUndefined();
  expect(bye.warnings.join(' ')).toContain('bye');
});

it('supports confirmed imports when scoring is unfamiliar while exposing the historical scoring gap', () => {
  const evidence = buildPlayerEvidence({
    ...input,
    league: { ...league, platform: 'espn', scoring: { '999': 1 } },
    projections: [projection({ importedAt: '2026-01-01' })],
  })[0]!;
  expect(evidence.historicalPoints).toEqual([]);
  expect(evidence.projectedPoints).toBe(15);
  expect(evidence.warnings.join(' ')).toContain('Historical league points unavailable');
  expect(evidence.warnings.join(' ')).toContain('old or has an invalid/future date');
  expect(evidence.metrics.some((metric) => metric.id.endsWith(':market-adds'))).toBe(false);
});

it('computes rolling baseline error without using a held-out game in its own forecast', () => {
  const longerRows = Array.from({ length: 8 }, (_value, index) => ({
    ...rows[0]!,
    gameId: `long-${index}`,
    week: index + 1,
    stats: { ...rows[0]!.stats, receiving_yards: 50 + 10 * index },
  }));
  const longerGames: FootballGame[] = longerRows.map((row, index) => ({
    ...games[0]!,
    id: row.gameId,
    week: row.week,
    date: `2026-09-${10 + index}`,
  }));
  longerGames.push({
    id: 'next',
    season: 2026,
    week: 9,
    seasonType: 'REG',
    date: '2026-10-11',
    home: 'BUF',
    away: 'MIA',
  });
  const evidence = buildPlayerEvidence({
    ...input,
    week: 9,
    data: { ...data, players: longerRows, games: longerGames },
  })[0]!;
  expect(
    evidence.metrics.find((metric) => metric.id.endsWith(':baseline-backtest-mae')),
  ).toMatchObject({ value: 3.25, sampleSize: 4 });
});

it('normalizes NFL team aliases when checking the selected week for a bye', () => {
  const evidence = buildPlayerEvidence({
    ...input,
    players: [{ ...player, nflTeam: 'LAR' }],
    data: {
      ...data,
      games: [
        ...games,
        {
          id: 'rams',
          season: 2026,
          week: 5,
          seasonType: 'REG',
          date: '2026-10-11',
          home: 'LA',
          away: 'SEA',
        },
      ],
    },
    projections: [projection()],
  })[0]!;
  expect(evidence.projectedPoints).toBe(15);
  expect(evidence.warnings.join(' ')).not.toContain('bye');
});

it('withholds active-lineup estimates for completed, past-date or ambiguous target games', () => {
  for (const change of [{ homeScore: 20 }, { date: '2026-10-06' }, { duplicate: true }]) {
    const changed = structuredClone(data);
    Object.assign(changed.games.at(-1)!, change);
    if ('duplicate' in change)
      changed.games.push({ ...changed.games.at(-1)!, id: 'duplicate-target' });
    const evidence = buildPlayerEvidence({
      ...input,
      data: changed,
      projections: [projection()],
    })[0]!;
    expect(evidence.projectedPoints).toBeUndefined();
    expect(evidence.metrics.find((metric) => metric.id.endsWith(':receiving_yards'))?.value).toBe(
      65,
    );
    expect(evidence.warnings.join(' ')).toContain('upcoming unplayed');
  }
});
