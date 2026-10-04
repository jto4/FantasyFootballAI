import { createLocalHttpApp } from './http-app.js';
import { createGenerationQueue, createGenerationRouter } from './generation-jobs.js';
import { storageStartupFailure } from './storage-startup.js';
import { createReportRouter } from './report-routes.js';
import { createSettingsRouter } from './settings-routes.js';
import { createDeliveryService } from './delivery-service.js';
import { createReportService } from './report-service.js';
import { createChatSyncRouter } from './chat-sync-routes.js';
import { parseSecret } from './provider-config.js';
import express from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  leaguesForAction,
  leagueSeasonPhase,
  scheduledReportPhaseSkipReason,
  type ActionSetting,
  type LeagueConnection,
  type LeagueCalendarEvent,
  type AIProvider,
} from '@sidekick/core';
import {
  connectorFor,
  FootballNewsCache,
  imessageAvailability,
  isBlueBubblesConfigured,
  LocalCLIProvider,
  AppleFoundationModelCLIProvider,
  parseCLIArguments,
  OpenAICompatibleProvider,
  sendResendTestEmail,
  verifyTwilioCredentials,
  generateImage,
  NFLInjuryReportCache,
} from '@sidekick/integrations';
import { LocalStore } from './store.js';
import type { ScheduledLeagueResult } from './store.js';
import { leagueSyncErrorMessage } from './sync-errors.js';
import { retryLeagueFetch } from './sync-retry.js';
import {
  listCredentialProviders,
  readCredential,
  removeCredential,
  saveCredential,
} from './credentials.js';

import { getYahooAccessToken } from './yahoo-token.js';
import { DeliveryGuard } from './delivery-guard.js';

import { createShutdownAction } from './lifecycle.js';

import { LeagueCalendarScheduler, ReportScheduler } from './scheduler.js';
import { replaceLocalImages } from './image-library.js';
import { createImageRouter } from './image-routes.js';
import { createReceivedEmailRouter } from './received-email-routes.js';

import { errorName, logEvent } from './logger.js';
import { readApiLogTail } from './diagnostic-logs.js';
import { isRelevantBlueBubblesMessageEvent, sameWebhookToken } from './bluebubbles-webhook.js';
import { startIntervalPoll } from './interval-poll.js';

import { createStateRouter } from './state-routes.js';
import { createProjectionRouter } from './projection-routes.js';
import { createCredentialHealthRouter } from './credential-health-routes.js';
import { createBackupRouter } from './backup-routes.js';
import { createLeagueRouter } from './league-routes.js';
import { createNewsRouter } from './news-routes.js';
import { createMemoryImportRouter } from './memory-import-routes.js';

import { createPortableBackup } from './backup-archive.js';
import { createYahooOAuthRouter } from './yahoo-oauth-routes.js';
import { createProviderRouter } from './provider-routes.js';
import { createMemberMemoryRouter } from './member-memory-routes.js';

const host = '127.0.0.1';
const port = Number(process.env.SIDEKICK_PORT ?? 4173);
// Vite is a separate origin in development; allow only its default local port.
// npm_lifecycle_event is set by npm on every supported operating system.
const isDevelopment =
  process.env.SIDEKICK_DEV_MODE === '1' || process.env.npm_lifecycle_event === 'dev';
const store = new LocalStore();
const reportScheduler = new ReportScheduler(
  runScheduledAction,
  undefined,
  undefined,
  markMissedScheduledAction,
);
const leagueCalendarScheduler = new LeagueCalendarScheduler(
  runLeagueCalendarEvent,
  undefined,
  markMissedLeagueCalendarEvent,
);
const deliveryGuard = new DeliveryGuard();
const retryingScheduledRuns = new Set<string>();
const footballNewsCache = new FootballNewsCache();
const nflInjuryReportCache = new NFLInjuryReportCache();
let footballNewsRefreshTimer: NodeJS.Timeout | undefined;
let conversationRetentionTimer: NodeJS.Timeout | undefined;
let blueBubblesAutoSyncTimer: NodeJS.Timeout | undefined;
let blueBubblesAutoSyncInFlight = false;
const chatSyncClaims = { imessage: false, twilio: false };
let stopTwilioConversationAutoSync: (() => void) | undefined;
const blueBubblesAutoSyncStatus: {
  lastCheckedAt?: string;
  lastAddedMessages?: number;
  lastError?: string;
} = {};
const twilioConversationAutoSyncStatus: {
  lastCheckedAt?: string;
  lastAddedMessages?: number;
  lastError?: string;
} = {};
const blueBubblesAutoSyncToken = randomBytes(32).toString('hex');
const twilioConversationAutoSyncToken = randomBytes(32).toString('hex');
const footballNewsRefreshTask = {
  stop() {
    if (footballNewsRefreshTimer) clearInterval(footballNewsRefreshTimer);
    footballNewsRefreshTimer = undefined;
  },
};
const conversationRetentionTask = {
  stop() {
    if (conversationRetentionTimer) clearInterval(conversationRetentionTimer);
    conversationRetentionTimer = undefined;
  },
};
const blueBubblesAutoSyncTask = {
  stop() {
    if (blueBubblesAutoSyncTimer) clearInterval(blueBubblesAutoSyncTimer);
    blueBubblesAutoSyncTimer = undefined;
  },
};
const twilioConversationAutoSyncTask = {
  stop() {
    stopTwilioConversationAutoSync?.();
    stopTwilioConversationAutoSync = undefined;
  },
};
const deliveryService = createDeliveryService({ store, readCredential, deliveryGuard });
const { autoSendChatReplyDrafts } = deliveryService;
const { generateAndSaveReport } = createReportService({
  store,
  footballNewsCache,
  nflInjuryReportCache,
  configuredAI,
  deliveryGuard,
  delivery: deliveryService,
});
const app = createLocalHttpApp(() => port, isDevelopment);
let stopApplication: () => void = () => undefined;
app.use(
  createStateRouter({
    snapshot: () => store.snapshot(),
    dashboardSnapshot: () => store.dashboardSnapshot(),
    dashboardSummarySnapshot: () => store.dashboardSummarySnapshot(),
    reportsPage: (...args) => store.reportsPage(...args),
    reportById: (id) => store.reportById(id),
  }),
);
app.use(createProjectionRouter({ store }));
app.use(
  createLeagueRouter({
    store,
    fetchLeague: async (platform, leagueId, season) => {
      const credential =
        platform === 'espn'
          ? await readCredential('espn')
          : platform === 'yahoo'
            ? await getYahooAccessToken({ readCredential, saveCredential }, yahooRedirectUri())
            : null;
      return connectorFor(platform, credential ?? undefined, season).fetchLeague(leagueId);
    },
    syncErrorMessage: leagueSyncErrorMessage,
    reconcileCalendar: (events) => leagueCalendarScheduler.reconcile(events),
  }),
);
app.use(
  createBackupRouter({
    currentBackup: async () => {
      const directory = await mkdtemp(join(tmpdir(), 'sunday-sidekick-backup-'));
      try {
        const databasePath = join(directory, 'state.sqlite');
        await store.backupTo(databasePath);
        return createPortableBackup(await readFile(databasePath), store.path);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    listSafetyBackups: () => store.listSafetyBackups(),
    readSafetyBackup: (name) => store.readSafetyBackup(name),
    deleteSafetyBackup: (name) => store.deleteSafetyBackup(name),
    restoreBackup: (database, images) =>
      store.restoreFromBuffer(database, () => replaceLocalImages(store.path, images)),
    afterRestore: async () => {
      await store.purgeExpiredConversationSources();
      const restored = store.snapshot();
      reportScheduler.reconcile(restored.settings.actions);
      leagueCalendarScheduler.reconcile(restored.settings.calendarEvents ?? []);
      configureFootballNewsRefresh(restored.settings.newsRefreshMinutes ?? 15);
      configureFootballNewsSources(restored.settings.newsSources);
      configureConversationRetention(restored.settings.conversationRetentionDays);
      configureBlueBubblesAutoSync(
        restored.settings.imessageAutoSyncEnabled,
        restored.settings.imessageSyncIntervalMinutes,
      );
      configureTwilioConversationAutoSync(
        restored.settings.twilioConversationAutoSyncEnabled === true,
        restored.settings.twilioConversationSyncIntervalMinutes ?? 15,
      );
      return restored.settings;
    },
  }),
);
app.use(
  createCredentialHealthRouter({
    readEspnCredential: () => readCredential('espn'),
    connectedEspnLeague: () =>
      store.snapshot().leagues.find((league) => league.platform === 'espn'),
    verifyEspnLeagueAccess: async (league, sessionCookie) => {
      await connectorFor('espn', sessionCookie, league.season).fetchLeague(league.id);
    },
  }),
);

app.get('/api/bluebubbles/webhook', async (_req, res) => {
  try {
    const token = await readCredential('bluebubbles-webhook-token');
    res.json({ configured: Boolean(token) });
  } catch {
    res.status(503).json({ error: 'The operating system credential store is unavailable.' });
  }
});
app.post('/api/bluebubbles/webhook', async (_req, res) => {
  try {
    const token = randomBytes(32).toString('base64url');
    await saveCredential('bluebubbles-webhook-token', token);
    res.status(201).json({
      configured: true,
      url: `http://${host}:${port}/api/bluebubbles/webhook/${token}`,
    });
  } catch {
    res.status(503).json({ error: 'Could not save the webhook token in the OS credential store.' });
  }
});
app.delete('/api/bluebubbles/webhook', async (_req, res) => {
  try {
    await removeCredential('bluebubbles-webhook-token');
    res.status(204).end();
  } catch {
    res
      .status(503)
      .json({ error: 'Could not remove the webhook token from the OS credential store.' });
  }
});
app.post('/api/bluebubbles/webhook/:token', async (req, res) => {
  let expectedToken: string | null;
  try {
    expectedToken = await readCredential('bluebubbles-webhook-token');
  } catch {
    return res.status(503).json({ error: 'Webhook credential storage is unavailable.' });
  }
  if (!expectedToken || !sameWebhookToken(req.params.token, expectedToken))
    return res.status(404).end();

  const chatGuid = store.settingsSnapshot().imessageChatGuid?.trim();
  if (!chatGuid || !isRelevantBlueBubblesMessageEvent(req.body, chatGuid))
    return res.status(202).json({ accepted: true, imported: 0 });
  if (!store.settingsSnapshot().memoryEnabled || blueBubblesAutoSyncInFlight)
    return res.status(202).json({ accepted: true, imported: 0 });

  // Webhook bodies only signal that history may have changed. The established bounded,
  // deduplicating sync path remains the source of message content and memory policy.
  blueBubblesAutoSyncInFlight = true;
  try {
    const response = await fetch(`http://${host}:${port}/api/memory/imessage-sync`, {
      method: 'POST',
      headers: { 'x-sidekick-internal-sync-token': blueBubblesAutoSyncToken },
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) return res.status(503).json({ error: 'Could not sync the configured chat.' });
    return res.status(202).json({ accepted: true });
  } catch {
    return res.status(503).json({ error: 'Could not sync the configured chat.' });
  } finally {
    blueBubblesAutoSyncInFlight = false;
  }
});

app.post('/api/shutdown', (_req, res) => {
  res.status(202).json({ status: 'stopping' });
  // Let the browser receive confirmation before closing the local service.
  res.once('finish', stopApplication);
});
app.get('/api/health', (_req, res) =>
  res.json({
    status: 'ok',
    localOnly: true,
    backgroundService: process.env.SIDEKICK_SERVICE === '1',
  }),
);
app.get('/api/diagnostics/logs', async (_req, res) => {
  try {
    const filename = process.env.SIDEKICK_SERVICE === '1' ? 'service.log' : 'api.log';
    res.json(await readApiLogTail(process.env.SIDEKICK_USER_DATA_DIR, filename));
  } catch {
    res.status(500).json({ error: 'Local runtime logs could not be read.' });
  }
});
app.post('/api/scheduled-runs/:id/retry', async (req, res) => {
  const original = store.snapshot().scheduledRuns.find((run) => run.id === req.params.id);
  if (!original) return res.status(404).json({ error: 'Scheduled run not found.' });
  const retryAction = store
    .snapshot()
    .settings.actions.find((action) => action.kind === original.kind);
  if (!retryAction)
    return res.status(409).json({ error: 'This run uses an unsupported report type.' });
  const failedResults =
    original.leagueResults?.filter((result) => result.status === 'failed') ?? [];
  if (original.status !== 'failed' || failedResults.length === 0)
    return res.status(409).json({ error: 'This run has no failed league results to retry.' });
  if (retryingScheduledRuns.has(original.id))
    return res.status(409).json({ error: 'A retry for this run is already in progress.' });

  retryingScheduledRuns.add(original.id);
  const retryRun = {
    id: randomUUID(),
    kind: original.kind,
    startedAt: new Date().toISOString(),
    status: 'running' as const,
    retryOf: original.id,
  };
  await store.update((state) => {
    state.scheduledRuns.unshift(retryRun);
    state.scheduledRuns = state.scheduledRuns.slice(0, 100);
  });

  const outcomes: ScheduledLeagueResult[] = failedResults.map((result) => ({
    ...result,
    detail: 'Retry did not finish; retry this league again after reviewing its status.',
  }));
  async function persistRetryOutcomes(): Promise<void> {
    await store.update((state) => {
      const run = state.scheduledRuns.find((item) => item.id === retryRun.id);
      if (run) run.leagueResults = structuredClone(outcomes);
    });
  }
  const failures: string[] = [];
  try {
    for (const [index, failed] of failedResults.entries()) {
      const league = store.snapshot().leagues.find((item) => item.id === failed.leagueId);
      if (!league) {
        const detail = 'This league is no longer connected.';
        outcomes[index] = { ...failed, detail };
        failures.push(`${failed.displayName}: ${detail}`);
        await persistRetryOutcomes();
        continue;
      }
      let refreshed: LeagueConnection;
      try {
        const credential =
          league.platform === 'espn'
            ? ((await readCredential('espn')) ?? undefined)
            : league.platform === 'yahoo'
              ? ((await getYahooAccessToken(
                  { readCredential, saveCredential },
                  yahooRedirectUri(),
                )) ?? undefined)
              : undefined;
        refreshed = await connectorFor(league.platform, credential, league.season).fetchLeague(
          league.id,
        );
        await store.update((state) => {
          state.leagues = state.leagues.map((item) =>
            item.id === refreshed.id
              ? {
                  ...refreshed,
                  displayName: item.displayName,
                  connectedAt: item.connectedAt,
                  lastSyncedAt: new Date().toISOString(),
                }
              : item,
          );
        });
        await generateAndSaveReport(
          refreshed,
          store.reportSnapshot(),
          retryAction.kind,
          false,
          retryAction.channel,
        );
        outcomes[index] = {
          leagueId: league.id,
          displayName: league.displayName,
          status: 'succeeded',
          detail: 'A new draft is ready for review; no message was sent.',
        };
        await persistRetryOutcomes();
      } catch {
        const detail = 'Check platform access and AI settings, then try again.';
        outcomes[index] = {
          leagueId: league.id,
          displayName: league.displayName,
          status: 'failed',
          detail,
        };
        failures.push(`${league.displayName}: ${detail}`);
        await persistRetryOutcomes();
      }
    }
  } finally {
    const finishedAt = new Date().toISOString();
    await store.update((state) => {
      const run = state.scheduledRuns.find((item) => item.id === retryRun.id);
      if (!run) return;
      run.finishedAt = finishedAt;
      run.status = failures.length ? 'failed' : 'succeeded';
      run.detail = `${outcomes.filter((result) => result.status === 'succeeded').length} retry draft(s) created; ${failures.length} still failed.`;
      run.leagueResults = outcomes;
    });
    retryingScheduledRuns.delete(original.id);
  }
  res.status(201).json(store.snapshot().scheduledRuns.find((run) => run.id === retryRun.id));
});
app.use(
  createProviderRouter({
    listCredentialProviders,
    saveCredential: (provider, value) => saveCredential(provider ?? '', value),
    removeCredential: (provider) => removeCredential(provider ?? ''),
    readCredential,
    settingsSnapshot: () => store.settingsSnapshot(),
    configuredAI,
    verifyTwilioCredentials,
    sendResendTestEmail,
    discoverModels: async (key, model, baseUrl) =>
      new OpenAICompatibleProvider(key, model, baseUrl).listModels(),
  }),
);
app.use(
  createYahooOAuthRouter({
    readCredential,
    saveCredential,
    removeCredential,
  }),
);
app.use(createNewsRouter({ getNews: (forceRefresh) => footballNewsCache.get(forceRefresh) }));
app.get('/api/capabilities', async (_req, res) =>
  res.json({
    platforms: ['sleeper', 'espn', 'yahoo'],
    channels: ['dashboard', 'email', 'sms', 'imessage'],
    imessage: imessageAvailability(
      isBlueBubblesConfigured(parseSecret(await readCredential('bluebubbles'))),
    ),
  }),
);
app.use(
  createImageRouter({
    databasePath: store.path,
    readImageGenerationKey: async (provider) =>
      (await readCredential(
        provider === 'stability' ? 'stability-image-generation' : 'image-generation',
      )) ?? undefined,
    generateImage,
  }),
);
app.use(createMemoryImportRouter({ store, configuredAI }));
app.use(
  createSettingsRouter({
    store,
    afterSave: async (settings) => {
      await store.purgeExpiredConversationSources();
      reportScheduler.reconcile(settings.actions);
      leagueCalendarScheduler.reconcile(settings.calendarEvents ?? []);
      configureFootballNewsRefresh(settings.newsRefreshMinutes ?? 15);
      configureFootballNewsSources(settings.newsSources);
      configureConversationRetention(settings.conversationRetentionDays);
      configureBlueBubblesAutoSync(
        settings.imessageAutoSyncEnabled,
        settings.imessageSyncIntervalMinutes,
      );
      configureTwilioConversationAutoSync(
        settings.twilioConversationAutoSyncEnabled === true,
        settings.twilioConversationSyncIntervalMinutes ?? 15,
      );
    },
  }),
);
app.use(
  createReceivedEmailRouter({
    store,
    readResendConfig: async () => {
      const config = parseSecret(await readCredential('resend'));
      return typeof config.apiKey === 'string' ? { apiKey: config.apiKey } : null;
    },
    configuredAI,
  }),
);
app.use(
  createChatSyncRouter({
    store,
    readCredential,
    configuredAI,
    autoSendChatReplyDrafts,
    blueBubblesAutoSyncToken,
    twilioConversationAutoSyncToken,
    blueBubblesAutoSyncStatus,
    twilioConversationAutoSyncStatus,
    claims: chatSyncClaims,
  }),
);
app.use(createMemberMemoryRouter({ store }));
const generationQueue = createGenerationQueue(store, generateAndSaveReport);
app.use(createGenerationRouter(store, generationQueue));
app.use(
  createReportRouter({
    store,
    generateAndSaveReport,
    deliveryService,
    deliveryGuard,
    generationQueue,
  }),
);
async function configuredAI(
  settings: ReturnType<LocalStore['snapshot']>['settings'],
): Promise<AIProvider | null> {
  const runtime = settings.aiRuntime;
  if (runtime?.mode === 'apple-cli')
    return process.platform === 'darwin' ? new AppleFoundationModelCLIProvider() : null;
  if (runtime?.mode === 'cli')
    return new LocalCLIProvider(runtime.command, parseCLIArguments(runtime.args));
  const key = await readCredential('openai');
  return key ? new OpenAICompatibleProvider(key, runtime?.model, runtime?.baseUrl) : null;
}

function yahooRedirectUri(): string {
  return 'oob';
}
async function runScheduledAction(action: ActionSetting, occurrenceKey?: string): Promise<void> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  let currentAction: ActionSetting | undefined;
  let claimed = false;
  await store.update((state) => {
    const savedAction = state.settings.actions.find((item) => item.kind === action.kind);
    if (
      !savedAction?.enabled ||
      !savedAction.schedule.enabled ||
      !sameScheduleOccurrence(savedAction, action)
    )
      return;
    if (occurrenceKey && state.scheduledRuns.some((run) => run.occurrenceKey === occurrenceKey))
      return;
    if (action.schedule.frequency === 'once') {
      if (savedAction.schedule.frequency !== 'once' || savedAction.schedule.completedAt) return;
      savedAction.schedule.completedAt = startedAt;
    }
    state.scheduledRuns.unshift({
      id: runId,
      kind: action.kind,
      startedAt,
      status: 'running',
      ...(occurrenceKey ? { occurrenceKey } : {}),
    });
    state.scheduledRuns = state.scheduledRuns.slice(0, 100);
    currentAction = structuredClone(savedAction);
    claimed = true;
  });
  if (!claimed || !currentAction) return;
  const allLeagues = store.snapshot().leagues;
  const selectedLeagueIds = currentAction.leagueIds;
  const leagueIds = leaguesForAction(currentAction, allLeagues).map((league) => league.id);
  const failures: string[] = [];
  const leagueResults: ScheduledLeagueResult[] = [];
  try {
    if (selectedLeagueIds?.length === 0)
      failures.push('No leagues are selected for this scheduled action.');
    else if (selectedLeagueIds && leagueIds.length === 0)
      failures.push('No selected leagues are currently connected.');
    for (const leagueId of leagueIds) {
      const latestState = store.snapshot();
      const league = latestState.leagues.find((item) => item.id === leagueId);
      if (!league) continue;
      const latestAction = latestState.settings.actions.find((item) => item.kind === action.kind);
      if (!latestAction?.enabled || !latestAction.schedule.enabled) break;

      let refreshed: LeagueConnection;
      try {
        const credential =
          league.platform === 'espn'
            ? ((await readCredential('espn')) ?? undefined)
            : league.platform === 'yahoo'
              ? ((await getYahooAccessToken(
                  { readCredential, saveCredential },
                  yahooRedirectUri(),
                )) ?? undefined)
              : undefined;
        refreshed = await retryLeagueFetch(
          () => connectorFor(league.platform, credential, league.season).fetchLeague(league.id),
          store.settingsSnapshot().scheduledSyncRetries ?? 0,
        );
        await store.update((state) => {
          state.leagues = state.leagues.map((item) =>
            item.id === refreshed.id
              ? {
                  ...refreshed,
                  displayName: item.displayName,
                  connectedAt: item.connectedAt,
                  lastSyncedAt: new Date().toISOString(),
                }
              : item,
          );
        });
      } catch (error) {
        const detail = leagueSyncErrorMessage(error);
        await store.update((state) => {
          state.leagues = state.leagues.map((item) =>
            item.id === league.id ? { ...item, lastSyncError: detail } : item,
          );
        });
        failures.push(`${league.displayName}: ${detail}`);
        leagueResults.push({
          leagueId: league.id,
          displayName: league.displayName,
          status: 'failed',
          detail,
        });
        continue;
      }

      const phaseSkip = scheduledReportPhaseSkipReason(
        action.kind,
        leagueSeasonPhase(refreshed),
        action.schedule.frequency,
      );
      if (phaseSkip) {
        leagueResults.push({
          leagueId: refreshed.id,
          displayName: refreshed.displayName,
          status: 'skipped',
          detail: phaseSkip,
        });
        continue;
      }

      try {
        const result = await generateAndSaveReport(
          refreshed,
          store.reportSnapshot(),
          action.kind,
          true,
          action.channel,
        );
        if (result.deliveryError) {
          failures.push(`${league.displayName}: automatic delivery failed; report remains saved`);
          leagueResults.push({
            leagueId: league.id,
            displayName: league.displayName,
            status: 'failed',
            detail: 'Report saved, but automatic delivery failed. Review its delivery status.',
          });
        } else {
          leagueResults.push({
            leagueId: league.id,
            displayName: league.displayName,
            status: 'succeeded',
          });
        }
      } catch {
        const detail = 'Report generation failed. Check AI settings and try again.';
        failures.push(`${league.displayName}: ${detail}`);
        leagueResults.push({
          leagueId: league.id,
          displayName: league.displayName,
          status: 'failed',
          detail,
        });
      }
    }
    if (failures.length) throw new Error(failures.join('; ').slice(0, 1000));
  } finally {
    const finishedAt = new Date().toISOString();
    await store.update((state) => {
      const run = state.scheduledRuns.find((item) => item.id === runId);
      if (!run) return;
      run.finishedAt = finishedAt;
      run.status = failures.length ? 'failed' : 'succeeded';
      if (leagueResults.length) run.leagueResults = leagueResults;
      run.detail = failures.length
        ? failures.join('; ').slice(0, 1000)
        : `${leagueResults.filter((result) => result.status === 'succeeded').length} league(s) processed; ${leagueResults.filter((result) => result.status === 'skipped').length} paused by season phase.`;
    });
  }
}

function sameScheduleOccurrence(current: ActionSetting, scheduled: ActionSetting): boolean {
  const left = current.schedule;
  const right = scheduled.schedule;
  return (
    left.frequency === right.frequency &&
    left.weekday === right.weekday &&
    left.dayOfMonth === right.dayOfMonth &&
    left.date === right.date &&
    left.time === right.time &&
    left.timezone === right.timezone
  );
}

async function markMissedScheduledAction(action: ActionSetting, missedAt: Date): Promise<void> {
  const finishedAt = missedAt.toISOString();
  let recorded = false;
  await store.update((state) => {
    const savedAction = state.settings.actions.find((item) => item.kind === action.kind);
    if (
      !savedAction?.enabled ||
      !savedAction.schedule.enabled ||
      savedAction.schedule.frequency !== 'once' ||
      savedAction.schedule.date !== action.schedule.date ||
      savedAction.schedule.time !== action.schedule.time ||
      savedAction.schedule.timezone !== action.schedule.timezone ||
      savedAction.schedule.completedAt
    )
      return;

    savedAction.schedule.completedAt = finishedAt;
    state.scheduledRuns.unshift({
      id: randomUUID(),
      kind: action.kind,
      startedAt: finishedAt,
      finishedAt,
      status: 'failed',
      detail: 'Missed its scheduled local date while the app was stopped; no report was generated.',
    });
    state.scheduledRuns = state.scheduledRuns.slice(0, 100);
    recorded = true;
  });
  if (recorded) reportScheduler.reconcile(store.settingsSnapshot().actions);
}

async function runLeagueCalendarEvent(event: LeagueCalendarEvent): Promise<void> {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  let claimed = false;
  await store.update((state) => {
    const savedEvent = state.settings.calendarEvents?.find(
      (candidate) => candidate.id === event.id,
    );
    if (
      !savedEvent ||
      savedEvent.completedAt ||
      savedEvent.leagueId !== event.leagueId ||
      savedEvent.kind !== event.kind ||
      savedEvent.date !== event.date ||
      savedEvent.time !== event.time ||
      savedEvent.timezone !== event.timezone
    )
      return;
    savedEvent.completedAt = startedAt;
    state.scheduledRuns.unshift({
      id: runId,
      kind: event.kind,
      startedAt,
      status: 'running',
      calendarEventId: event.id,
      calendarEventTitle: savedEvent.title,
      leagueResults: [
        {
          leagueId: event.leagueId,
          displayName:
            state.leagues.find((league) => league.id === event.leagueId)?.displayName ??
            'Disconnected league',
          status: 'failed',
          detail:
            'Calendar event was interrupted before completion; retry as a draft after review.',
        },
      ],
    });
    state.scheduledRuns = state.scheduledRuns.slice(0, 100);
    claimed = true;
  });
  if (!claimed) return;
  const leagueResults: ScheduledLeagueResult[] = [];
  let detail: string;
  let failureDetail: string | undefined;
  try {
    const league = store.snapshot().leagues.find((candidate) => candidate.id === event.leagueId);
    if (!league) {
      failureDetail = 'This league is no longer connected.';
      throw new Error(failureDetail);
    }
    const credential =
      league.platform === 'espn'
        ? ((await readCredential('espn')) ?? undefined)
        : league.platform === 'yahoo'
          ? ((await getYahooAccessToken({ readCredential, saveCredential }, yahooRedirectUri())) ??
            undefined)
          : undefined;
    let refreshed: LeagueConnection;
    try {
      refreshed = await retryLeagueFetch(
        () => connectorFor(league.platform, credential, league.season).fetchLeague(league.id),
        store.settingsSnapshot().scheduledSyncRetries ?? 0,
      );
    } catch (error) {
      const syncFailure = leagueSyncErrorMessage(error);
      failureDetail = syncFailure;
      await store.update((state) => {
        state.leagues = state.leagues.map((current) =>
          current.id === league.id ? { ...current, lastSyncError: syncFailure } : current,
        );
      });
      throw error;
    }
    const lastSyncedAt = new Date().toISOString();
    await store.update((state) => {
      state.leagues = state.leagues.map((current) =>
        current.id === refreshed.id
          ? {
              ...refreshed,
              displayName: current.displayName,
              connectedAt: current.connectedAt,
              lastSyncedAt,
            }
          : current,
      );
    });
    try {
      await generateAndSaveReport(
        refreshed,
        store.reportSnapshot(),
        event.kind,
        false,
        'dashboard',
      );
    } catch {
      failureDetail = 'Report generation failed. Check AI settings and try again.';
      throw new Error(failureDetail);
    }
    leagueResults.push({
      leagueId: league.id,
      displayName: league.displayName,
      status: 'succeeded',
      detail: 'A draft is ready for review; calendar events never send messages.',
    });
    detail = `Created a draft for ${league.displayName}.`;
  } catch (error) {
    const league = store.snapshot().leagues.find((candidate) => candidate.id === event.leagueId);
    const failure =
      failureDetail ??
      (error instanceof Error && error.message === 'This league is no longer connected.'
        ? error.message
        : 'Report generation failed. Check platform access and AI settings, then try again.');
    if (league) {
      leagueResults.push({
        leagueId: league.id,
        displayName: league.displayName,
        status: 'failed',
        detail: failure,
      });
    }
    detail = failure;
  } finally {
    const finishedAt = new Date().toISOString();
    await store.update((state) => {
      const run = state.scheduledRuns.find((candidate) => candidate.id === runId);
      if (!run) return;
      run.finishedAt = finishedAt;
      run.status =
        leagueResults.some((result) => result.status === 'failed') || !leagueResults.length
          ? 'failed'
          : 'succeeded';
      run.detail = detail;
      if (leagueResults.length) run.leagueResults = leagueResults;
    });
  }
}

async function markMissedLeagueCalendarEvent(
  event: LeagueCalendarEvent,
  missedAt: Date,
): Promise<void> {
  const finishedAt = missedAt.toISOString();
  await store.update((state) => {
    const savedEvent = state.settings.calendarEvents?.find(
      (candidate) => candidate.id === event.id,
    );
    if (!savedEvent || savedEvent.completedAt) return;
    savedEvent.completedAt = finishedAt;
    state.scheduledRuns.unshift({
      id: randomUUID(),
      kind: event.kind,
      startedAt: finishedAt,
      finishedAt,
      status: 'failed',
      detail: 'Missed its scheduled local date while the app was stopped; no report was generated.',
      calendarEventId: event.id,
      calendarEventTitle: savedEvent.title,
      leagueResults: [
        {
          leagueId: event.leagueId,
          displayName:
            state.leagues.find((league) => league.id === event.leagueId)?.displayName ??
            'Disconnected league',
          status: 'failed',
          detail:
            'The event date passed while the app was stopped; retry as a draft if still useful.',
        },
      ],
    });
    state.scheduledRuns = state.scheduledRuns.slice(0, 100);
  });
}

function configureFootballNewsRefresh(minutes: number): void {
  footballNewsRefreshTask.stop();
  footballNewsCache.setRefreshIntervalMinutes(minutes);
  footballNewsRefreshTimer = setInterval(() => {
    void footballNewsCache.get(true).then((snapshot) => {
      if (snapshot.error)
        logEvent('warn', 'news.refresh.partial_failure', {
          component: 'news',
          reason: 'feed_unavailable',
        });
    });
  }, minutes * 60_000);
  footballNewsRefreshTimer.unref();
}

function configureFootballNewsSources(sources: unknown): void {
  footballNewsCache.setSources(sources);
  void footballNewsCache.get();
}

function configureConversationRetention(days: unknown): void {
  conversationRetentionTask.stop();
  if (days !== 30 && days !== 90 && days !== 365) return;
  conversationRetentionTimer = setInterval(
    () => {
      void store.purgeExpiredConversationSources().catch((error: unknown) =>
        logEvent('error', 'memory.retention.failed', {
          component: 'storage',
          errorName: errorName(error),
        }),
      );
    },
    24 * 60 * 60 * 1_000,
  );
  conversationRetentionTimer.unref();
}

try {
  await store.load();
} catch (error) {
  const failure = storageStartupFailure(error);
  logEvent('error', failure.event, {
    component: 'storage',
    errorName: errorName(error),
  });
  throw new Error(failure.message);
}
if (store.settingsSnapshot().conversationRetentionDays !== undefined) {
  await store.purgeExpiredConversationSources();
}
configureFootballNewsRefresh(store.settingsSnapshot().newsRefreshMinutes ?? 15);
configureFootballNewsSources(store.settingsSnapshot().newsSources);
configureConversationRetention(store.settingsSnapshot().conversationRetentionDays);
reportScheduler.reconcile(store.settingsSnapshot().actions);
leagueCalendarScheduler.reconcile(store.settingsSnapshot().calendarEvents ?? []);

const staticRoot = join(dirname(fileURLToPath(import.meta.url)), '../../dashboard/dist');
if (existsSync(staticRoot)) {
  app.use(express.static(staticRoot, { index: false, maxAge: '1h' }));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(staticRoot, 'index.html'));
  });
}

app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const statusCode =
      error && typeof error === 'object' && 'status' in error
        ? Number((error as { status: unknown }).status)
        : 400;
    logEvent('warn', 'http.request.rejected', {
      component: 'api',
      errorName: errorName(error),
      status: statusCode === 413 ? 413 : 400,
    });
    res.status(statusCode === 413 ? 413 : 400).json({
      error: statusCode === 413 ? 'Request body exceeds the allowed size.' : 'Invalid request.',
    });
  },
);

const server = app.listen(port, host, () =>
  logEvent('info', 'api.started', { component: 'api', host, port }),
);
function configureBlueBubblesAutoSync(enabled: boolean, intervalMinutes: number): void {
  blueBubblesAutoSyncTask.stop();
  if (!enabled || ![5, 15, 30, 60].includes(intervalMinutes)) return;
  blueBubblesAutoSyncTimer = setInterval(() => {
    const settings = store.settingsSnapshot();
    if (
      !settings.imessageAutoSyncEnabled ||
      !settings.memoryEnabled ||
      blueBubblesAutoSyncInFlight ||
      chatSyncClaims.imessage
    )
      return;
    const address = server.address();
    if (!address || typeof address === 'string') return;

    blueBubblesAutoSyncInFlight = true;
    chatSyncClaims.imessage = true;
    // Reuse the manual import path so polling shares its privacy, deduplication, and retention rules.
    void fetch(`http://${host}:${address.port}/api/memory/imessage-sync`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(45_000),
      headers: { 'x-sidekick-internal-sync-token': blueBubblesAutoSyncToken },
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          addedMessages?: unknown;
          error?: unknown;
        };
        blueBubblesAutoSyncStatus.lastCheckedAt = new Date().toISOString();
        if (response.ok) {
          blueBubblesAutoSyncStatus.lastAddedMessages =
            typeof result.addedMessages === 'number' ? result.addedMessages : 0;
          delete blueBubblesAutoSyncStatus.lastError;
        } else {
          blueBubblesAutoSyncStatus.lastError =
            typeof result.error === 'string' ? result.error : 'iMessage sync failed.';
        }
      })
      .catch(() => {
        blueBubblesAutoSyncStatus.lastCheckedAt = new Date().toISOString();
        blueBubblesAutoSyncStatus.lastError =
          'Could not reach the local service to sync iMessage history.';
      })
      .finally(() => {
        blueBubblesAutoSyncInFlight = false;
        chatSyncClaims.imessage = false;
      });
  }, intervalMinutes * 60_000);
  blueBubblesAutoSyncTimer.unref();
}
function configureTwilioConversationAutoSync(enabled: boolean, intervalMinutes: number): void {
  twilioConversationAutoSyncTask.stop();
  stopTwilioConversationAutoSync = startIntervalPoll({
    enabled,
    intervalMinutes,
    status: twilioConversationAutoSyncStatus,
    failureMessage: 'Could not reach the local service to sync Twilio Conversations history.',
    run: async () => {
      const settings = store.settingsSnapshot();
      const conversationSid = settings.smsRecipient?.trim() ?? '';
      if (
        !settings.twilioConversationAutoSyncEnabled ||
        !settings.memoryEnabled ||
        !/^CH[0-9a-fA-F]{32}$/.test(conversationSid) ||
        chatSyncClaims.twilio
      )
        return undefined;
      const address = server.address();
      if (!address || typeof address === 'string') return undefined;

      chatSyncClaims.twilio = true;
      try {
        // Use the same bounded, deduplicating import path as the owner-triggered button.
        const response = await fetch(
          `http://${host}:${address.port}/api/memory/twilio-conversation-sync`,
          {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(45_000),
            headers: { 'x-sidekick-internal-sync-token': twilioConversationAutoSyncToken },
          },
        );
        const result = (await response.json()) as { addedMessages?: unknown; error?: unknown };
        if (!response.ok)
          return {
            error:
              typeof result.error === 'string' ? result.error : 'Twilio Conversations sync failed.',
          };
        return {
          addedMessages: typeof result.addedMessages === 'number' ? result.addedMessages : 0,
        };
      } finally {
        chatSyncClaims.twilio = false;
      }
    },
  });
}
configureBlueBubblesAutoSync(
  store.settingsSnapshot().imessageAutoSyncEnabled,
  store.settingsSnapshot().imessageSyncIntervalMinutes,
);
configureTwilioConversationAutoSync(
  store.settingsSnapshot().twilioConversationAutoSyncEnabled === true,
  store.settingsSnapshot().twilioConversationSyncIntervalMinutes ?? 15,
);
stopApplication = createShutdownAction(
  server,
  [
    {
      stop: () => {
        void generationQueue.stop().catch((error) =>
          logEvent('warn', 'generation.shutdown.failed', {
            component: 'generation',
            errorName: errorName(error),
          }),
        );
      },
    },
    reportScheduler,
    leagueCalendarScheduler,
    footballNewsRefreshTask,
    conversationRetentionTask,
    blueBubblesAutoSyncTask,
    twilioConversationAutoSyncTask,
  ],
  () => logEvent('info', 'api.stopping', { component: 'api', reason: 'shutdown_requested' }),
);
process.once('SIGINT', stopApplication);
process.once('SIGTERM', stopApplication);
process.once('beforeExit', () => store.close());
