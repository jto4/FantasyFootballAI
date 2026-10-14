import { expect, it } from 'vitest';
import { buildAdviceReadiness, isAdviceDataReadiness } from './advice-readiness.js';
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
