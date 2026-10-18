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
    '1 of 3 considered active players',
  );
  expect(report.items.find((i) => i.name === 'Projection coverage')?.detail).toContain(
    '2 players’ games have already started or finished',
  );
});
