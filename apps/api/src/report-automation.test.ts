import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type cron from 'node-cron';
import type { ScheduledTask, TaskFn } from 'node-cron';
import { expect, it, vi } from 'vitest';
import { defaultActionSettings, type LeagueConnection } from '@sidekick/core';
import { NFLInjuryReportCache } from '@sidekick/integrations';
import { LocalStore, validateState } from './store.js';
import { ReportScheduler } from './scheduler.js';
import { createReportService } from './report-service.js';
import { createDeliveryService } from './delivery-service.js';
import { DeliveryGuard } from './delivery-guard.js';

it('scheduled weekly drafts run once per occurrence, preserve numeric evidence across restart, and never deliver', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-report-automation-'));
  const filename = join(directory, 'state.sqlite');
  const store = new LocalStore(filename);
  let reopened: LocalStore | undefined;
  let scheduler: ReportScheduler | undefined;
  const league: LeagueConnection = {
    id: 'test-league',
    platform: 'sleeper',
    name: 'Test',
    displayName: 'Test league',
    teamCount: 2,
    teams: [
      { id: '1', name: 'One', pointsFor: 200 },
      { id: '2', name: 'Two', pointsFor: 150 },
    ],
    scoring: {},
    settings: { currentWeek: 3 },
    connectedAt: '2026-10-01T12:00:00Z',
    lastSyncedAt: '2026-10-06T13:00:00Z',
  };
  const credential = vi.fn(async () => null);
  const ai = {
    id: 'test-ai',
    name: 'Controlled test provider',
    generate: vi.fn(async () => 'A reviewed report based on supplied evidence.'),
  };
  const scheduleTaskCallbacks: Array<TaskFn> = [];
  try {
    await store.load();
    await store.update((state) => {
      state.leagues = [league];
      state.settings.actions = structuredClone(defaultActionSettings).map((action) => ({
        ...action,
        enabled: action.kind === 'power-rankings',
        mode: 'draft',
        channel: 'dashboard',
        leagueIds: [league.id],
        schedule: { ...action.schedule, timezone: 'UTC', weekday: 2, time: '09:00' },
      }));
      state.settings.emailRecipient = 'would-send@example.test';
    });
    const guard = new DeliveryGuard();
    const delivery = createDeliveryService({
      store,
      readCredential: credential,
      deliveryGuard: guard,
    });
    const service = createReportService({
      store,
      delivery,
      deliveryGuard: guard,
      footballNewsCache: { get: async () => ({ items: [], stale: false }) },
      nflInjuryReportCache: new NFLInjuryReportCache(),
      configuredAI: async () => ai,
    });
    const scheduleTask = ((_expression: string, callback: TaskFn) => {
      scheduleTaskCallbacks.push(callback);
      return { stop: vi.fn() } as unknown as ScheduledTask;
    }) as typeof cron.schedule;
    scheduler = new ReportScheduler(async (action) => {
      await service.generateAndSaveReport(
        league,
        store.reportSnapshot(),
        action.kind,
        true,
        action.channel,
      );
    }, scheduleTask);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T09:00:00Z'));
    scheduler.reconcile(store.settingsSnapshot().actions);
    const fire = scheduleTaskCallbacks[0] as () => Promise<void>;
    await fire();
    await fire();
    expect(ai.generate).toHaveBeenCalledTimes(1);
    expect(credential).not.toHaveBeenCalled();
    const report = store.snapshot().reports[0]!;
    expect(report.status).toBe('draft');
    expect(report.deliveryAttempts).toBeUndefined();
    expect(report.evidence?.visuals?.teams[0]?.pointsFor).toBe(200);
    await store.update((state) => {
      state.leagues[0]!.teams[0]!.pointsFor = 999;
    });
    const exported = store.snapshot();
    expect(validateState(exported).reports[0]!.evidence?.visuals).toEqual(report.evidence?.visuals);
    const invalid = structuredClone(exported);
    invalid.reports[0]!.evidence!.visuals!.matchups = [{ week: 50, teams: [] }];
    expect(() => validateState(invalid)).toThrow('Invalid report');
    store.close();
    reopened = new LocalStore(filename);
    await reopened.load();
    expect(reopened.snapshot().reports[0]!.evidence?.visuals?.teams[0]?.pointsFor).toBe(200);
    expect(reopened.snapshot().leagues[0]!.teams[0]?.pointsFor).toBe(999);
  } finally {
    vi.useRealTimers();
    scheduler?.stop();
    reopened?.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
