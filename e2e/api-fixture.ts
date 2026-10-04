import { createLeagueRouter } from '../apps/api/src/league-routes.js';
import { createProviderRouter } from '../apps/api/src/provider-routes.js';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LocalStore } from '../apps/api/src/store.js';
import { createLocalHttpApp } from '../apps/api/src/http-app.js';
import { createStateRouter } from '../apps/api/src/state-routes.js';
import { createSettingsRouter } from '../apps/api/src/settings-routes.js';
import { createReportRouter } from '../apps/api/src/report-routes.js';
import { createReportService } from '../apps/api/src/report-service.js';
import { createDeliveryService } from '../apps/api/src/delivery-service.js';
import { createGenerationQueue, createGenerationRouter } from '../apps/api/src/generation-jobs.js';
import { DeliveryGuard } from '../apps/api/src/delivery-guard.js';
import { DeliveryFailure, NFLInjuryReportCache } from '@sidekick/integrations';
import type { OutboundMessage } from '@sidekick/core';

/** Actual production routers and SQLite; substitutes exist only at external provider interfaces. */
export async function apiWorkspace(connected = true) {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-real-browser-'));
  const store = new LocalStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
  await store.load();
  await store.update((state) => {
    if (connected)
      state.leagues.push({
        id: 'browser-league',
        platform: 'sleeper',
        name: 'Real API League',
        displayName: 'Real API League',
        teamCount: 2,
        teams: [
          { id: '1', name: 'Team One', wins: 2, losses: 1, pointsFor: 220 },
          { id: '2', name: 'Team Two', wins: 1, losses: 2, pointsFor: 180 },
        ],
        scoring: {},
        settings: { currentWeek: 3, playoffStartWeek: 14 },
        connectedAt: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString(),
      });
    state.settings.emailRecipient = 'original@example.test';
    const action = state.settings.actions.find((item) => item.kind === 'power-rankings')!;
    action.enabled = true;
    action.channel = 'email';
  });
  const sends: OutboundMessage[] = [];
  let generations = 0,
    failDelivery = false,
    blocked = false;
  let release = () => {};
  const deliveryGuard = new DeliveryGuard();
  const deliveryService = createDeliveryService({
    store,
    deliveryGuard,
    readCredential: async (provider) =>
      provider === 'resend'
        ? JSON.stringify({ apiKey: 'fixture-only', from: 'Sidekick <sender@example.test>' })
        : null,
    channels: {
      email: () => ({
        id: 'controlled-email',
        send: async (message) => {
          sends.push(structuredClone(message));
          if (failDelivery) {
            failDelivery = false;
            throw new DeliveryFailure('Fixture timeout', true);
          }
          return { providerMessageId: 'fixture-message' };
        },
      }),
    },
  });
  const configuredAI = async () => ({
    id: 'fixture-ai',
    generate: async (request: import('@sidekick/core').AIRequest) => {
      if (!request.prompt.includes('untrusted_report_data'))
        return 'Sunday Sidekick runtime ready.';
      generations++;
      if (blocked)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return 'A controlled provider response ready for commissioner review.';
    },
  });
  const { generateAndSaveReport } = createReportService({
    store,
    deliveryGuard,
    delivery: deliveryService,
    footballNewsCache: {
      get: async () => ({ items: [], stale: false, refreshedAt: new Date().toISOString() }),
    },
    nflInjuryReportCache: new NFLInjuryReportCache(),
    configuredAI,
  });
  const queue = createGenerationQueue(store, generateAndSaveReport);
  let port = 0;
  const app = createLocalHttpApp(() => port);
  app.use(
    createStateRouter({
      snapshot: () => store.snapshot(),
      dashboardSnapshot: () => store.dashboardSnapshot(),
      dashboardSummarySnapshot: () => store.dashboardSummarySnapshot(),
      reportsPage: (...args) => store.reportsPage(...args),
      reportById: (id) => store.reportById(id),
    }),
  );
  app.use(createSettingsRouter({ store, afterSave: async () => {} }));
  app.use(
    createLeagueRouter({
      store,
      fetchLeague: async (platform, id) => ({
        id,
        platform,
        name: 'Real API League',
        displayName: 'Real API League',
        teamCount: 2,
        teams: [
          { id: '1', name: 'One' },
          { id: '2', name: 'Two' },
        ],
        settings: {},
        scoring: {},
        connectedAt: new Date().toISOString(),
      }),
      syncErrorMessage: () => 'Fixture league unavailable.',
      reconcileCalendar: () => {},
    }),
  );
  app.use(
    createProviderRouter({
      listCredentialProviders: async () => [
        { provider: 'openai', configured: true },
        { provider: 'resend', configured: true },
      ],
      saveCredential: async () => {},
      removeCredential: async () => {},
      readCredential: async () => 'fixture-only',
      settingsSnapshot: () => store.settingsSnapshot(),
      configuredAI,
      verifyTwilioCredentials: async () => ({ valid: true }),
      sendResendTestEmail: async () => {},
      discoverModels: async () => ['gpt-4o-mini'],
    }),
  );
  app.use(createGenerationRouter(store, queue));
  app.use(
    createReportRouter({
      store,
      generateAndSaveReport,
      deliveryService,
      deliveryGuard,
      generationQueue: queue,
    }),
  );
  app.get('/api/news', (_req, res) => res.json({ items: [], stale: false }));
  app.get('/api/yahoo/oauth/status', (_req, res) =>
    res.json({
      clientConfigured: false,
      authorized: false,
      requiresReconnect: false,
      redirectUri: 'oob',
    }),
  );
  app.get('/api/bluebubbles/webhook', (_req, res) => res.json({ configured: false }));
  app.get('/api/images', (_req, res) => res.json([]));
  app.use(express.static(resolve('apps/dashboard/dist')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback listener.');
  port = address.port;
  return {
    url: `http://127.0.0.1:${port}`,
    store,
    sends,
    generations: () => generations,
    failNextDelivery: () => {
      failDelivery = true;
    },
    block: () => {
      blocked = true;
    },
    release: () => {
      blocked = false;
      release();
    },
    async close() {
      release();
      await queue.stop();
      await queue.idle();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
