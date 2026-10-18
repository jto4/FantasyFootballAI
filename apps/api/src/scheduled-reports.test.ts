import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultActionSettings, type LeagueConnection } from '@sidekick/core';
import { LocalStore } from './store.js';
import { createScheduledReportRunner } from './scheduled-reports.js';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0)) await clean();
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-scheduled-reports-'));
  const store = new LocalStore(join(root, 'state.sqlite'));
  await store.load();
  cleanups.push(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  const league: LeagueConnection = {
    id: 'league',
    platform: 'sleeper',
    name: 'Provider label',
    displayName: 'Owner label',
    teamCount: 2,
    teams: [],
    scoring: {},
    settings: { seasonStatus: 'in_season', currentWeek: 6, playoff_start_week: 14 },
    connectedAt: '2026-09-01T12:00:00Z',
  };
  const action = structuredClone(defaultActionSettings.find((a) => a.kind === 'power-rankings')!);
  action.leagueIds = [league.id];
  await store.update((s) => {
    s.leagues = [league];
    s.settings.actions = [action];
  });
  const generate = vi.fn(async () => ({
    report: {
      id: 'r',
      leagueId: league.id,
      kind: action.kind,
      title: 'Report',
      body: 'Report',
      citations: [],
      createdAt: new Date().toISOString(),
      status: 'draft' as const,
    },
  }));
  return { store, league, action, generate };
}
it('passes the persisted owner label and sync time into generation and claims an occurrence once', async () => {
  const { store, league, action, generate } = await setup();
  const run = createScheduledReportRunner({
    store,
    generateAndSaveReport: generate,
    fetchLeague: async () => ({ ...league, displayName: 'Provider changed label' }),
  });
  await run(action, 'weekly-occurrence');
  await run(action, 'weekly-occurrence');
  expect(generate).toHaveBeenCalledTimes(1);
  const received = (generate.mock.calls as unknown as [LeagueConnection][])[0]![0];
  expect(received.displayName).toBe('Owner label');
  expect(received.connectedAt).toBe(league.connectedAt);
  expect(received.lastSyncedAt).toBe(store.snapshot().leagues[0]!.lastSyncedAt);
  expect(received.lastSyncedAt).toBeDefined();
  expect(store.snapshot().scheduledRuns).toHaveLength(1);
  expect(store.snapshot().scheduledRuns[0]!.status).toBe('succeeded');
});
it('honors scope revocation during an awaited league fetch before any AI work', async () => {
  const { store, league, action, generate } = await setup();
  const run = createScheduledReportRunner({
    store,
    generateAndSaveReport: generate,
    fetchLeague: async () => {
      await store.update((s) => {
        s.settings.actions[0]!.leagueIds = [];
      });
      return league;
    },
  });
  await run(action, 'revoked-occurrence');
  expect(generate).not.toHaveBeenCalled();
  expect(store.snapshot().scheduledRuns[0]!.leagueResults?.[0]).toMatchObject({
    status: 'skipped',
  });
});
it('uses fresh complete-season status to pause recurring weekly reports while allowing explicit one-time drafts', async () => {
  const { store, league, action, generate } = await setup();
  const run = createScheduledReportRunner({
    store,
    generateAndSaveReport: generate,
    fetchLeague: async () => ({ ...league, settings: { seasonStatus: 'complete' } }),
  });
  await run(action, 'completed-season');
  expect(generate).not.toHaveBeenCalled();
  expect(store.snapshot().scheduledRuns[0]!.leagueResults?.[0]?.status).toBe('skipped');
  const once = {
    ...action,
    schedule: { ...action.schedule, frequency: 'once' as const, date: '2026-10-14' },
  };
  await store.update((s) => {
    s.settings.actions = [once];
  });
  await run(once);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(store.settingsSnapshot().actions[0]!.schedule.completedAt).toBeDefined();
});
it('creates an opted-in saved-data draft exactly once without provider refresh or invented sync time', async () => {
  const { store, league, action, generate } = await setup();
  const saved = {
    ...action,
    dataMode: 'saved' as const,
    mode: 'draft' as const,
    channel: 'dashboard' as const,
  };
  const imported = {
    ...league,
    platform: 'espn' as const,
    connectionMode: 'snapshot' as const,
    snapshotImportedAt: new Date().toISOString(),
  };
  await store.update((s) => {
    s.settings.actions = [saved];
    s.leagues = [imported];
  });
  const fetchLeague = vi.fn(async () => {
    throw Error('Must not read provider credentials or fetch');
  });
  const run = createScheduledReportRunner({ store, fetchLeague, generateAndSaveReport: generate });
  await run(saved, 'saved-occurrence');
  await run(saved, 'saved-occurrence');
  expect(fetchLeague).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0]).toEqual([
    imported,
    expect.anything(),
    saved.kind,
    false,
    'dashboard',
    undefined,
    undefined,
    'saved',
  ]);
  expect(store.snapshot().leagues[0]!.lastSyncedAt).toBeUndefined();
  expect(store.snapshot().scheduledRuns[0]).toMatchObject({
    status: 'succeeded',
    leagueResults: [
      { status: 'succeeded', detail: expect.stringContaining('no refresh or delivery') },
    ],
  });
  store.close();
  await store.load();
  expect(store.settingsSnapshot().actions.find((a) => a.kind === saved.kind)?.dataMode).toBe(
    'saved',
  );
});
it('rejects expired or default-refresh manual imports before any provider or model work', async () => {
  const { store, league, action, generate } = await setup();
  const fetchLeague = vi.fn(async () => league),
    run = createScheduledReportRunner({ store, fetchLeague, generateAndSaveReport: generate });
  for (const dataMode of [undefined, 'saved' as const]) {
    const current = { ...action, dataMode, mode: 'draft' as const, channel: 'dashboard' as const };
    await store.update((s) => {
      s.settings.actions = [current];
      s.leagues = [
        {
          ...league,
          platform: 'espn',
          connectionMode: 'snapshot',
          snapshotImportedAt: '2020-01-01T00:00:00Z',
        },
      ];
    });
    await expect(run(current, 'blocked-' + String(dataMode))).rejects.toThrow();
    expect(store.snapshot().scheduledRuns[0]!.leagueResults?.[0]?.detail).toMatch(
      dataMode ? /within the last/ : /Choose saved data/,
    );
  }
  expect(fetchLeague).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});
it('does not overwrite an import that replaces a provider connection during awaited refresh', async () => {
  const { store, league, action, generate } = await setup();
  const imported = {
    ...league,
    platform: 'espn' as const,
    connectionMode: 'snapshot' as const,
    snapshotImportedAt: new Date().toISOString(),
  };
  const run = createScheduledReportRunner({
    store,
    generateAndSaveReport: generate,
    fetchLeague: async () => {
      await store.update((s) => {
        s.leagues = [imported];
      });
      return league;
    },
  });
  await run(action, 'source-changed');
  expect(generate).not.toHaveBeenCalled();
  expect(store.snapshot().leagues[0]).toEqual(imported);
  expect(store.snapshot().scheduledRuns[0]!.leagueResults?.[0]?.status).toBe('skipped');
});
