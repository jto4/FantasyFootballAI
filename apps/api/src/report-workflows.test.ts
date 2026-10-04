import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalStore } from './store.js';
import { createReportRouter } from './report-routes.js';
import { createSettingsRouter } from './settings-routes.js';
import { createDeliveryService } from './delivery-service.js';
import { DeliveryGuard } from './delivery-guard.js';
import type { createReportService } from './report-service.js';
import type { SavedReport } from '@sidekick/core';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-workflows-'));
  const store = new LocalStore(join(directory, 'state.sqlite'), join(directory, 'state.json'));
  await store.load();
  cleanup.push(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const report: SavedReport = {
    id: 'draft',
    leagueId: 'league',
    kind: 'power-rankings',
    createdAt: new Date().toISOString(),
    title: 'Rankings',
    body: 'Original report',
    citations: [],
    status: 'draft',
  };
  await store.update((state) => {
    state.leagues.push({
      id: 'league',
      platform: 'sleeper',
      name: 'Test',
      displayName: 'Test',
      teamCount: 0,
      teams: [],
      settings: {},
      scoring: {},
      connectedAt: new Date().toISOString(),
    });
    state.reports.push(report);
    const action = state.settings.actions.find((item) => item.kind === 'power-rankings')!;
    action.enabled = true;
    action.channel = 'email';
    action.mode = 'automatic';
    state.settings.emailRecipient = 'owner@example.test';
  });
  const generate = vi.fn(
    async (
      ..._args: Parameters<ReturnType<typeof createReportService>['generateAndSaveReport']>
    ) => ({ report }),
  );
  const readCredential = vi.fn(async () => null);
  const deliveryGuard = new DeliveryGuard();
  const deliveryService = createDeliveryService({ store, readCredential, deliveryGuard });
  const afterSave = vi.fn(async () => undefined);
  const app = express();
  app.use(express.json());
  app.use(createSettingsRouter({ store, afterSave }));
  app.use(
    createReportRouter({ store, generateAndSaveReport: generate, deliveryService, deliveryGuard }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  cleanup.push(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const request = (path: string, body: unknown, method = 'PATCH') =>
    fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(path.startsWith('/api/settings/')
          ? {
              'If-Match': String(
                store.settingsSnapshot().sectionRevisions?.[
                  path.split('/').at(-1) as import('@sidekick/core').SettingsSection
                ] ?? 0,
              ),
            }
          : {}),
      },
      body: JSON.stringify(body),
    });
  return { store, generate, readCredential, afterSave, report, request, directory };
}
describe('review and scoped settings workflows', () => {
  it('defaults HTTP generation to drafts even when automatic delivery is configured', async () => {
    const { request, generate } = await setup();
    expect(
      (await request('/api/reports/power-rankings', { leagueId: 'league' }, 'POST')).status,
    ).toBe(201);
    expect(generate.mock.calls[0]?.[3]).toBe(false);
    await request('/api/reports/power-rankings', { leagueId: 'league', draftOnly: false }, 'POST');
    expect(generate.mock.calls[1]?.[3]).toBe(true);
    expect((await request('/api/reports/power-rankings', null, 'POST')).status).toBe(400);
  });
  it('saves only the selected settings group and rejects cross-group fields', async () => {
    const { request, store, afterSave } = await setup();
    const before = store.settingsSnapshot();
    const response = await request('/api/settings/ai', {
      aiRuntime: { ...before.aiRuntime, model: 'new-model' },
    });
    expect(response.status).toBe(200);
    expect(store.settingsSnapshot().writingStyle).toBe(before.writingStyle);
    expect(store.settingsSnapshot().actions).toEqual(before.actions);
    expect(afterSave).toHaveBeenCalledOnce();
    expect((await request('/api/settings/ai', { writingStyle: 'Unrelated edit' })).status).toBe(
      400,
    );
    expect((await request('/api/settings/privacy', { memoryEnabled: null })).status).toBe(400);
  });
  it('retention can be cleared and disabling memory stops history polling', async () => {
    const { store, request } = await setup();
    await request('/api/settings/privacy', { conversationRetentionDays: 30 });
    expect(store.settingsSnapshot().conversationRetentionDays).toBe(30);
    await request('/api/settings/privacy', { conversationRetentionDays: null });
    expect(store.settingsSnapshot().conversationRetentionDays).toBeUndefined();
    await store.update((state) => {
      state.settings.imessageAutoSyncEnabled = true;
    });
    await request('/api/settings/privacy', { memoryEnabled: false });
    expect(store.settingsSnapshot().imessageAutoSyncEnabled).toBe(false);
  });
  it('rejects malformed retry values and persists valid schedule retries', async () => {
    const { request, store } = await setup();
    expect((await request('/api/settings/schedules', { scheduledSyncRetries: '2' })).status).toBe(
      400,
    );
    expect((await request('/api/settings/schedules', { scheduledSyncRetries: 2 })).status).toBe(
      200,
    );
    expect(store.settingsSnapshot().scheduledSyncRetries).toBe(2);
  });
  it('edits draft text durably and rejects an outdated editor revision', async () => {
    const { request, store, directory } = await setup();
    const response = await request('/api/reports/draft', {
      title: 'Edited title',
      body: 'Edited body',
      revision: 0,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).revision).toBe(1);
    expect(
      (
        await request('/api/reports/draft', {
          title: 'Stale title',
          body: 'Stale body',
          revision: 0,
        })
      ).status,
    ).toBe(409);
    const second = new LocalStore(join(directory, 'state.sqlite'));
    await second.load();
    expect(second.snapshot().reports[0]?.body).toBe('Edited body');
    expect(second.claimReportDelivery('draft', false, 0)).toBeUndefined();
    second.close();
    expect(store.snapshot().reports[0]?.title).toBe('Edited title');
  });
  it('prevents edits while another API process owns a delivery claim', async () => {
    const { request, directory } = await setup();
    const second = new LocalStore(join(directory, 'state.sqlite'));
    await second.load();
    expect(second.claimReportDelivery('draft')).toBeTruthy();
    expect(
      (await request('/api/reports/draft', { title: 'Changed', body: 'Changed', revision: 0 }))
        .status,
    ).toBe(409);
    second.close();
  });
  it('rejects editing attempted reports, oversized text, and unknown fields', async () => {
    const { request, store } = await setup();
    expect(
      (
        await request('/api/reports/draft', {
          title: 'Title',
          body: 'x'.repeat(100001),
          revision: 0,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/api/reports/draft', {
          title: 'Title',
          body: 'Body',
          revision: 0,
          status: 'sent',
        })
      ).status,
    ).toBe(400);
    await store.update((state) => {
      state.reports[0]!.deliveryState = 'uncertain';
    });
    expect(
      (await request('/api/reports/draft', { title: 'Title', body: 'Body', revision: 0 })).status,
    ).toBe(409);
  });
  it('requires the displayed recipient and revision to still match before reading credentials', async () => {
    const { request, readCredential } = await setup();
    expect(
      (
        await request(
          '/api/reports/draft/send',
          { revision: 0, expectedChannel: 'email', expectedDestination: 'old@example.test' },
          'POST',
        )
      ).status,
    ).toBe(409);
    expect(readCredential).not.toHaveBeenCalled();
  });
});
