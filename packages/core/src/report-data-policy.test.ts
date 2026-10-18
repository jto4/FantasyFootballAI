import { expect, it } from 'vitest';
import { defaultActionSettings, normalizeActionSettings, type LeagueConnection } from './index.js';
import {
  isValidReportDataMode,
  reportDataProblem,
  reportDataProblemAt,
} from './report-data-policy.js';
const now = Date.parse('2026-10-15T20:00:00Z');
const action = {
  ...structuredClone(defaultActionSettings[0]!),
  dataMode: 'saved' as const,
  mode: 'draft' as const,
  channel: 'dashboard' as const,
  leagueIds: ['league'],
};
const league: LeagueConnection = {
  id: 'league',
  platform: 'espn',
  name: 'League',
  displayName: 'League',
  teamCount: 0,
  teams: [],
  scoring: {},
  settings: {},
  connectedAt: '2026-10-01T00:00:00Z',
  connectionMode: 'snapshot',
  snapshotImportedAt: '2026-10-15T19:00:00Z',
};
it('requires explicit scoped drafts and keeps legacy schedules in refresh mode', () => {
  expect(isValidReportDataMode(defaultActionSettings[0])).toBe(true);
  expect(isValidReportDataMode(action)).toBe(true);
  for (const patch of [
    { mode: 'automatic' },
    { channel: 'email' },
    { leagueIds: undefined },
    { leagueIds: [] },
    { dataMode: 'fallback' },
  ])
    expect(isValidReportDataMode({ ...action, ...patch })).toBe(false);
  expect(normalizeActionSettings([action])[0]).toMatchObject({
    dataMode: 'saved',
    mode: 'draft',
    channel: 'dashboard',
    leagueIds: ['league'],
  });
  expect(normalizeActionSettings([])[0]!.dataMode).toBeUndefined();
});
it('bounds saved age without interpreting import time as provider freshness or using a false timestamp', () => {
  expect(reportDataProblem(league, action, 24, now)).toBeUndefined();
  for (const at of [undefined, 'invalid', '2026-10-16T00:00:00Z', '2026-10-14T20:00:00Z'])
    expect(
      reportDataProblem({ ...league, snapshotImportedAt: at } as LeagueConnection, action, 24, now),
    ).toMatch(/within the last 24 hours/);
  expect(
    reportDataProblem(
      {
        ...league,
        lastSyncedAt: '2026-10-15T19:59:00Z',
        snapshotImportedAt: '2026-10-01T00:00:00Z',
      },
      action,
      24,
      now,
    ),
  ).toMatch(/within the last/);
  expect(reportDataProblem(league, { ...action, dataMode: undefined }, 24, now)).toMatch(
    /Choose saved data/,
  );
  expect(reportDataProblem(league, { ...action, leagueIds: ['other'] }, 24, now)).toMatch(
    /not selected/,
  );
  const provider = { ...league };
  delete provider.connectionMode;
  delete provider.snapshotImportedAt;
  expect(
    reportDataProblem({ ...provider, lastSyncedAt: '2026-10-15T19:00:00Z' }, action, 24, now),
  ).toBeUndefined();
  expect(reportDataProblem(provider, action, 24, now)).toMatch(/within the last/);
});

it('warns when data will expire before a planned run without accepting currently future-dated imports', () => {
  expect(reportDataProblemAt(league, action, 24, now + 7 * 86400000, now)).toMatch(
    /expire before the planned run/,
  );
  expect(reportDataProblemAt(league, action, 24, now + 3600000, now)).toBeUndefined();
  expect(
    reportDataProblemAt(
      { ...league, snapshotImportedAt: '2026-10-16T00:00:00Z' },
      action,
      24,
      now + 12 * 3600000,
      now,
    ),
  ).toMatch(/within the last/);
});
