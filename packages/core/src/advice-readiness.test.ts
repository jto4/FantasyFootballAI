import { expect, it } from 'vitest';
import { buildAdviceReadiness, isAdviceDataReadiness } from './advice-readiness.js';
import { weeklyGameWithheldWarning } from './advice-warnings.js';
it('keeps unknown report publication and future retrieval separate from a fresh roster download', () => {
  const asOf = '2026-10-11T12:00:00Z';
  const report = buildAdviceReadiness({
    request: { mode: 'lineup' },
    league: {
      id: 'l',
      platform: 'sleeper',
      name: 'League',
      displayName: 'League',
      teamCount: 0,
      teams: [],
      scoring: {},
      settings: {},
      connectedAt: asOf,
      lastSyncedAt: asOf,
    },
    players: [],
    sources: [
      { id: 'stats', name: 'Stats', status: 'available', retrievedAt: '2026-10-12T00:00:00Z' },
    ],
    injuries: [{ playerId: 'p', coverage: 'undated' }],
    asOf,
  });
  expect(report.status).toBe('limited');
  expect(report.items.find((i) => i.name === 'Stats')?.state).toBe('unknown');
  expect(report.currentInjuryReports).toBe(0);
  expect(isAdviceDataReadiness(report)).toBe(true);
  expect(isAdviceDataReadiness({ ...report, currentInjuryReports: 2 })).toBe(false);
  expect(
    isAdviceDataReadiness({
      ...report,
      injuryReports: [{ playerId: 'p', coverage: 'current', updatedAt: '2026-10-12T00:00:00Z' }],
    }),
  ).toBe(false);
});

it('explains weekly estimates withheld because a game already started', () => {
  const asOf = '2026-10-18T23:00:00Z';
  const player = (id: string, projectedPoints?: number, warnings: string[] = []) =>
    ({
      id,
      name: id,
      position: 'WR',
      metrics: [],
      warnings,
      projectionSourceIds: [],
      ...(projectedPoints === undefined ? {} : { projectedPoints, projectionScope: 'week' }),
    }) as unknown as Parameters<typeof buildAdviceReadiness>[0]['players'][number];
  const report = buildAdviceReadiness({
    request: { mode: 'lineup' },
    league: undefined,
    players: [
      player('late', 12),
      player('early', undefined, [weeklyGameWithheldWarning]),
      player('other', undefined, [weeklyGameWithheldWarning]),
    ],
    sources: [],
    injuries: [],
    asOf,
  });
  expect(report.items.find((i) => i.name === 'Projection coverage')?.detail).toContain(
    '1 of 3 active players',
  );
  expect(report.items.find((i) => i.name === 'Projection coverage')?.detail).toContain(
    '2 players’ games have already started or finished',
  );
});

it('groups per-season, per-week and per-game sources and keeps the worst state', () => {
  const asOf = '2026-10-18T23:00:00Z';
  const fresh = '2026-10-18T22:00:00Z';
  const report = buildAdviceReadiness({
    request: { mode: 'lineup' },
    league: undefined,
    players: [],
    sources: [
      ...[1, 2, 3].map((week) => ({
        id: `dst-${week}`,
        name: `Sleeper published D/ST stats 2024 week ${week}`,
        status: 'available' as const,
        retrievedAt: fresh,
      })),
      {
        id: 'dst-x',
        name: 'Sleeper published D/ST stats 2025 week 1',
        status: 'unavailable' as const,
      },
      {
        id: 'espn-1',
        name: 'ESPN ARI at HOU, 2025-12-14 (offensive fumble-TD verification)',
        status: 'available' as const,
        retrievedAt: fresh,
      },
      {
        id: 'espn-2',
        name: 'ESPN NE at ARI, 2024-12-15 (offensive fumble-TD verification)',
        status: 'available' as const,
        retrievedAt: fresh,
      },
      ...[1, 2].map((page) => ({
        id: `forecast-${page}`,
        name: `ESPN weekly player forecasts · page ${page}`,
        status: 'available' as const,
        retrievedAt: fresh,
      })),
    ],
    injuries: [],
    asOf,
  });
  const names = report.items.map((item) => item.name);
  expect(names).toContain('ESPN weekly player forecasts (2 files)');
  expect(names).toContain('Sleeper published D/ST stats (4 files)');
  expect(names).toContain('ESPN game summaries (offensive fumble-TD verification) (2 files)');
  expect(report.items.find((i) => i.name.startsWith('Sleeper published'))?.state).toBe('missing');
  expect(isAdviceDataReadiness(report)).toBe(true);
});

it('counts this week’s undated reports separately and validates their kickoff expiry', () => {
  const asOf = '2026-10-09T12:00:00Z';
  const report = buildAdviceReadiness({
    request: { mode: 'lineup' },
    league: undefined,
    players: [],
    sources: [],
    injuries: [
      { playerId: 'a', coverage: 'week-window', validUntil: '2026-10-11T17:00:00Z' },
      { playerId: 'b', coverage: 'current', updatedAt: '2026-10-09T07:00:00Z' },
    ],
    asOf,
  });
  const item = report.items.find((i) => i.name === 'Injury report coverage');
  expect(item?.state).toBe('current');
  expect(item?.detail).toContain('1 has this week’s report without an update time');
  expect(report.currentInjuryReports).toBe(1);
  expect(isAdviceDataReadiness(report)).toBe(true);
  const expired = {
    ...report,
    injuryReports: [
      { playerId: 'a', coverage: 'week-window', validUntil: '2026-10-08T17:00:00Z' },
      report.injuryReports[1]!,
    ],
  };
  expect(isAdviceDataReadiness(expired)).toBe(false);
  const dated = {
    ...report,
    injuryReports: [
      { ...report.injuryReports[0]!, updatedAt: '2026-10-09T07:00:00Z' },
      report.injuryReports[1]!,
    ],
  };
  expect(isAdviceDataReadiness(dated)).toBe(false);
});
