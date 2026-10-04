import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore, SettingsRevisionConflict } from './store.js';
import { createGenerationQueue } from './generation-jobs.js';
import { createReportService } from './report-service.js';
import { createDeliveryService } from './delivery-service.js';
import { DeliveryGuard } from './delivery-guard.js';
import { NFLInjuryReportCache, DeliveryFailure } from '@sidekick/integrations';
import type { OutboundMessage, SavedReport } from '@sidekick/core';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-durable-jobs-'));
  const path = join(directory, 'state.sqlite');
  const store = new LocalStore(path, join(directory, 'missing.json'));
  await store.load();
  cleanup.push(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  await store.update((state) => {
    state.leagues.push({
      id: 'league',
      platform: 'sleeper',
      name: 'Test',
      displayName: 'Test',
      teamCount: 0,
      teams: [],
      scoring: {},
      settings: {},
      connectedAt: new Date().toISOString(),
    });
  });
  let calls = 0,
    release = () => {},
    hold = false,
    fail = false;
  const sends: OutboundMessage[] = [];
  const deliveryGuard = new DeliveryGuard();
  const delivery = createDeliveryService({
    store,
    deliveryGuard,
    readCredential: async () =>
      JSON.stringify({ apiKey: 'private-fixture-key', from: 'sender@example.test' }),
    channels: {
      email: () => ({
        id: 'controlled',
        send: async (message) => {
          sends.push(structuredClone(message));
          if (fail) {
            fail = false;
            throw new DeliveryFailure('Timeout', true);
          }
          return { providerMessageId: 'controlled-message' };
        },
      }),
    },
  });
  const { generateAndSaveReport } = createReportService({
    store,
    deliveryGuard,
    delivery,
    configuredAI: async () => ({
      id: 'controlled',
      generate: async () => {
        calls++;
        if (hold)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return 'Controlled report body';
      },
    }),
    footballNewsCache: { get: async () => ({ items: [], stale: false }) },
    nflInjuryReportCache: new NFLInjuryReportCache(),
  });
  const queue = createGenerationQueue(store, generateAndSaveReport);
  cleanup.push(async () => {
    hold = false;
    release();
    await queue.stop();
    await queue.idle();
  });
  return {
    directory,
    path,
    store,
    queue,
    delivery,
    sends,
    calls: () => calls,
    hold: () => {
      hold = true;
    },
    release: () => {
      hold = false;
      release();
    },
    fail: () => {
      fail = true;
    },
  };
}
const request = {
  requestId: 'durable-request-1',
  leagueId: 'league',
  kind: 'power-rankings' as const,
};
describe('durable workflow boundaries', () => {
  it('deduplicates concurrent request IDs and atomically links one persisted report', async () => {
    const f = await fixture();
    f.hold();
    const jobs = await Promise.all([f.queue.enqueue(request), f.queue.enqueue(request)]);
    expect(jobs[0]!.id).toBe(jobs[1]!.id);
    await expect(f.queue.enqueue({ ...request, kind: 'draft-hype' })).rejects.toThrow(
      'different report details',
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    f.release();
    await f.queue.idle();
    expect(f.calls()).toBe(1);
    const state = f.store.snapshot();
    expect(state.reports).toHaveLength(1);
    expect(state.generationJobs?.[0]).toMatchObject({
      status: 'completed',
      reportId: state.reports[0]!.id,
    });
    const replay = await f.queue.enqueue(request);
    expect(replay.status).toBe('completed');
    expect(f.calls()).toBe(1);
  });
  it('bounds queue size and refuses to publish a stopped generation', async () => {
    const f = await fixture();
    f.hold();
    await f.queue.enqueue(request);
    await new Promise((resolve) => setTimeout(resolve, 10));
    for (let i = 1; i < 20; i++)
      await f.queue.enqueue({ ...request, requestId: `durable-request-${i + 1}` });
    await expect(f.queue.enqueue({ ...request, requestId: 'durable-overflow' })).rejects.toThrow(
      'queue is full',
    );
    await f.queue.stop();
    f.release();
    await f.queue.idle();
    expect(f.store.snapshot().reports).toHaveLength(0);
    expect(f.store.snapshot().generationJobs!.every((job) => job.status === 'interrupted')).toBe(
      true,
    );
    expect(f.calls()).toBe(1);
  });
  it('marks queued and running jobs interrupted on restart without replaying providers', async () => {
    const f = await fixture();
    await f.store.update((state) => {
      state.generationJobs = [
        { ...request, id: 'saved-job', createdAt: new Date().toISOString(), status: 'running' },
      ];
    });
    f.store.close();
    await f.store.load();
    expect(f.store.snapshot().generationJobs?.[0]?.status).toBe('interrupted');
    expect((await f.queue.enqueue(request)).status).toBe('interrupted');
    expect(f.calls()).toBe(0);
  });
  it('rejects stale section revisions while allowing changes to another section', async () => {
    const f = await fixture();
    await f.store.update(
      (state) => {
        state.settings.writingStyle = 'First window';
      },
      { section: 'voice', revision: 0 },
    );
    await expect(
      f.store.update(
        (state) => {
          state.settings.writingStyle = 'Stale window';
        },
        { section: 'voice', revision: 0 },
      ),
    ).rejects.toBeInstanceOf(SettingsRevisionConflict);
    await f.store.update(
      (state) => {
        state.settings.emailRecipient = 'other@example.test';
      },
      { section: 'delivery', revision: 0 },
    );
    expect(f.store.settingsSnapshot().writingStyle).toBe('First window');
  });
  it('checks revisions against SQLite rather than another process cache', async () => {
    const f = await fixture();
    const other = new LocalStore(f.path, join(f.directory, 'missing.json'));
    await other.load();
    try {
      await f.store.update(
        (state) => {
          state.settings.writingStyle = 'Committed voice';
        },
        { section: 'voice', revision: 0 },
      );
      await expect(
        other.update(
          (state) => {
            state.settings.writingStyle = 'Cached voice';
          },
          { section: 'voice', revision: 0 },
        ),
      ).rejects.toBeInstanceOf(SettingsRevisionConflict);
      await other.update(
        (state) => {
          state.settings.emailRecipient = 'other@example.test';
        },
        { section: 'delivery', revision: 0 },
      );
      expect(other.settingsSnapshot().writingStyle).toBe('Committed voice');
    } finally {
      other.close();
    }
  });
  it('retries the complete saved envelope and rejects changed sender identity', async () => {
    const f = await fixture();
    await f.queue.enqueue(request);
    await f.queue.idle();
    const report = f.store.snapshot().reports[0]!;
    const first = await f.delivery.beginDelivery(
      report.id,
      'email',
      'original@example.test',
      undefined,
      '<thread@example.test>',
      'Thread subject',
    );
    expect(first).toBeDefined();
    f.fail();
    await expect(
      f.delivery.deliver(
        report,
        'email',
        'original@example.test',
        undefined,
        undefined,
        undefined,
        first!.idempotencyKey,
        first!.envelope,
      ),
    ).rejects.toBeInstanceOf(DeliveryFailure);
    await f.delivery.updateDeliveryState(report.id, 'uncertain');
    await f.store.update((state) => {
      state.settings.emailRecipient = 'changed@example.test';
    });
    const retry = await f.delivery.beginDelivery(
      report.id,
      'email',
      'changed@example.test',
      undefined,
      '<changed@example.test>',
      'Changed subject',
    );
    await f.delivery.deliver(
      report,
      'email',
      'changed@example.test',
      undefined,
      undefined,
      undefined,
      retry!.idempotencyKey,
      retry!.envelope,
    );
    expect(f.sends[1]).toEqual(f.sends[0]);
    const changed = createDeliveryService({
      store: f.store,
      deliveryGuard: new DeliveryGuard(),
      readCredential: async () =>
        JSON.stringify({ apiKey: 'private-fixture-key', from: 'changed-sender@example.test' }),
    });
    await expect(
      changed.deliver(
        report,
        'email',
        undefined,
        undefined,
        undefined,
        undefined,
        retry!.idempotencyKey,
        retry!.envelope,
      ),
    ).rejects.toThrow('sender changed');
    expect(JSON.stringify(f.store.snapshot())).not.toContain('private-fixture-key');
  });
  it('returns bounded summary pages and keeps bodies out of live snapshots', async () => {
    const f = await fixture();
    await f.queue.enqueue(request);
    await f.queue.idle();
    const original = f.store.snapshot().reports[0]!;
    await f.store.update((state) => {
      state.reports = Array.from({ length: 60 }, (_, i): SavedReport => ({
        ...original,
        id: `report-${String(i).padStart(3, '0')}`,
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
        body: 'Private rendered body',
      }));
    });
    expect(f.store.dashboardSummarySnapshot().reports).toHaveLength(50);
    expect(JSON.stringify(f.store.dashboardSummarySnapshot())).not.toContain(
      'Private rendered body',
    );
    const first = f.store.reportsPage(undefined, undefined, undefined, 20);
    const second = f.store.reportsPage(undefined, undefined, first.nextCursor, 20);
    expect(first.total).toBe(60);
    expect(second.items).toHaveLength(20);
    expect(
      second.items.some((item) => first.items.some((existing) => existing.id === item.id)),
    ).toBe(false);
    expect(f.store.reportById(first.items[0]!.id)?.body).toBe('Private rendered body');
  });
});
