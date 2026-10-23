import { dirname as researchDirname, join as researchJoin } from 'node:path';
import { MarketResearchStore } from './market-research-store.js';
import { createMarketResearchRouter } from './market-research-routes.js';
import {
  PublicNflBoxScores,
  PublicUsageData,
  PublicPredictionMarketData,
  readBoundedJson,
} from '@sidekick/integrations';
import { createChatRouter } from './chat-routes.js';
import { devFaults } from './dev-faults.js';
import { createPropBoardRouter, PropLeanStore } from './prop-board-routes.js';
import { PropLineLedger, startPropLineCapture } from './prop-line-ledger.js';
import { ChatStore } from './chat-store.js';
import { resolveConfiguredAI } from './ai-runtime.js';
import { createImsgRouter } from './imsg-routes.js';
import { RoutineBackups } from './routine-backups.js';
import { createOperationsRouter } from './operations-routes.js';
import { createLocalHttpApp } from './http-app.js';
import { createGenerationQueue, createGenerationRouter } from './generation-jobs.js';
import { storageStartupFailure } from './storage-startup.js';
import { createReportRouter } from './report-routes.js';
import { createScheduledRunRetryRouter } from './scheduled-run-retry-routes.js';
import {
  createPredictionPerformanceService,
  startPredictionTracking,
} from './prediction-performance.js';
import { startLeagueAutoRefresh } from './league-auto-refresh.js';
import { createSettingsRouter } from './settings-routes.js';
import { createDeliveryService } from './delivery-service.js';
import { createReportService } from './report-service.js';
import { createScheduledReportRunner, saveSyncedLeague } from './scheduled-reports.js';
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
  type ActionSetting,
  type LeagueConnection,
  type LeagueCalendarEvent,
} from '@sidekick/core';
import {
  connectorFor,
  FootballNewsCache,
  imessageAvailability,
  ImsgClient,
  resolveImsgExecutable,
  isBlueBubblesConfigured,
  OpenAICompatibleProvider,
  sendResendTestEmail,
  verifyTwilioCredentials,
  generateImage,
  NFLInjuryReportCache,
  PublicFootballData,
  PublicSportsbookLines,
  PublicPropLines,
  PublicNflScoreboard,
  PublicPregameEvidence,
  GameDayInjuries,
  PublicGameWeather,
  SignedInClaudeConnection,
  SignedInCodexConnection,
  getSleeperPlayerCatalog,
} from '@sidekick/integrations';
import { LocalStore } from './store.js';
import { leagueSyncErrorMessage } from './sync-errors.js';
import { retryLeagueFetch } from './sync-retry.js';
import {
  listCredentialProviders,
  readCredential,
  removeCredential,
  saveCredential,
} from './credentials.js';

import { getYahooAccessToken } from './yahoo-token.js';
import {
  markMissedLeagueCalendarEvent as markMissedCalendarEvent,
  runLeagueCalendarEvent as runCalendarEvent,
} from './calendar-events.js';
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
import { createAdviceRouter } from './advice-routes.js';
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
async function currentDatabaseBackup() {
  const directory = await mkdtemp(join(tmpdir(), 'sunday-sidekick-backup-'));
  try {
    const path = join(directory, 'state.sqlite');
    await store.backupTo(path);
    return await readFile(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function currentBackup() {
  return createPortableBackup(await currentDatabaseBackup(), store.path);
}
const routineBackups = new RoutineBackups({
  store,
  currentBackup,
  readPassphrase: () => readCredential('backup-encryption'),
  savePassphrase: (value) => saveCredential('backup-encryption', value),
  removePassphrase: () => removeCredential('backup-encryption'),
});
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
const footballNewsCache = new FootballNewsCache();
const nflInjuryReportCache = new NFLInjuryReportCache();
const publicFootballData = new PublicFootballData();
const publicSportsbookLines = new PublicSportsbookLines();
// Prop lines come from ESPN without a key; a saved Odds API key adds prices and other books.
const publicPropLines = new PublicPropLines(
  async () => (await readCredential('odds-api')) ?? undefined,
);
const publicPregameEvidence = new PublicPregameEvidence();
// Snap counts and depth charts for the prop model; loaded on first use and cached for 12 hours.
const publicUsageData = new PublicUsageData();
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
// Fault injection exists only in development; see dev-faults.ts and docs/setup.md.
if (isDevelopment) {
  const faults = devFaults(process.env.SIDEKICK_FAULTS);
  app.use(faults.router);
  app.use(faults.middleware);
  if (faults.rules().length)
    console.warn(`Simulating API faults (development only): ${process.env.SIDEKICK_FAULTS}`);
}
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
  createOperationsRouter({
    store,
    backups: routineBackups,
    logs: () =>
      readApiLogTail(
        process.env.SIDEKICK_USER_DATA_DIR,
        process.env.SIDEKICK_SERVICE === '1' ? 'service.log' : 'api.log',
      ),
  }),
);
app.use(
  createBackupRouter({
    currentBackup,
    databaseBackup: currentDatabaseBackup,
    validateBackup: (database) => store.validateBackupBuffer(database),
    listSafetyBackups: () => store.listSafetyBackups(),
    readSafetyBackup: (name) => store.readSafetyBackup(name),
    deleteSafetyBackup: (name) => store.deleteSafetyBackup(name),
    restoreBackup: async (database, images) => {
      await store.validateBackupBuffer(database);
      await routineBackups.disableAfterRestore();
      return store.restoreFromBuffer(database, () => replaceLocalImages(store.path, images));
    },
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

  if (store.settingsSnapshot().imessageProvider === 'imsg')
    return res
      .status(409)
      .json({ error: 'BlueBubbles webhooks are disabled for the local imsg provider.' });
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
app.use(
  createScheduledRunRetryRouter({
    store,
    fetchLeague: fetchScheduledLeague,
    generateAndSaveReport,
  }),
);
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
app.use(
  createImsgRouter({
    settingsSnapshot: () => store.settingsSnapshot(),
    reports: () => store.snapshot().reports,
  }),
);
app.get('/api/capabilities', async (_req, res) =>
  res.json({
    platforms: ['sleeper', 'espn', 'yahoo'],
    channels: ['dashboard', 'email', 'sms', 'imessage'],
    imessage:
      store.settingsSnapshot().imessageProvider === 'imsg'
        ? await (async () => {
            try {
              await new ImsgClient(
                await resolveImsgExecutable(store.settingsSnapshot().imsgExecutablePath),
              ).version();
              return { available: true };
            } catch {
              return {
                available: false,
                reason: 'Install local imsg on macOS and configure it in Delivery channels.',
              };
            }
          })()
        : imessageAvailability(
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
const marketResearch = new MarketResearchStore(
  researchJoin(researchDirname(store.path), 'market-research.sqlite'),
);
app.use(
  createMarketResearchRouter({
    data: publicFootballData,
    markets: new PublicPredictionMarketData(),
    odds: publicSportsbookLines,
    news: footballNewsCache,
    catalog: getSleeperPlayerCatalog,
    research: marketResearch,
  }),
);
app.use(
  createAdviceRouter({
    store,
    configuredAI,
    signedInAI: new SignedInClaudeConnection(),
    signedInCodex: new SignedInCodexConnection(),
    discoverModels: async (settings) => {
      // Custom providers retain their saved model/contract. Discovery sends no
      // football data and reads the same OS-stored credential as generation.
      if (
        (settings.aiRuntime?.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '') !==
        'https://api.openai.com/v1'
      )
        return [];
      const key = await readCredential('openai');
      if (!key) return [];
      return new OpenAICompatibleProvider(
        key,
        settings.aiRuntime?.model,
        settings.aiRuntime?.baseUrl,
      ).listModels();
    },
    data: publicFootballData,
    odds: publicSportsbookLines,
    props: publicPropLines,
    scoreboard: new PublicNflScoreboard(),
    boxScores: new PublicNflBoxScores(),
    gameDayInjuries: new GameDayInjuries(),
    weather: new PublicGameWeather(),
    usage: publicUsageData,
    pregame: publicPregameEvidence,
    catalog: getSleeperPlayerCatalog,
    news: footballNewsCache,
    injuries: nflInjuryReportCache,
  }),
);
const propLineLedger = new PropLineLedger(
  researchJoin(researchDirname(store.path), 'prop-lines.sqlite'),
);
const propLineCapture = startPropLineCapture(
  { data: publicFootballData, props: publicPropLines, ledger: propLineLedger },
  (error) =>
    logEvent('warn', 'props.capture.failed', { component: 'advice', errorName: errorName(error) }),
);
const propLeans = new PropLeanStore(researchJoin(researchDirname(store.path), 'prop-leans.sqlite'));
app.use(
  createPropBoardRouter({
    data: publicFootballData,
    props: publicPropLines,
    store,
    leans: propLeans,
    ledger: propLineLedger,
    usage: publicUsageData,
  }),
);
const chats = new ChatStore(researchJoin(researchDirname(store.path), 'chat.sqlite'));
app.use(
  createChatRouter({
    store,
    chats,
    configuredAI,
    // Chat lookups reuse this API's own read-only GET routes, with their validation and caches.
    local: async (path) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Local lookup failed with ${response.status}.`);
      }
      return readBoundedJson<unknown>(response, 3_000_000);
    },
  }),
);
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
async function configuredAI(settings: ReturnType<LocalStore['snapshot']>['settings']) {
  return resolveConfiguredAI(
    settings,
    () => readCredential('openai'),
    undefined,
    () => readCredential('anthropic'),
  );
}

function yahooRedirectUri(): string {
  return 'oob';
}
async function runScheduledAction(action: ActionSetting, occurrenceKey?: string): Promise<void> {
  return createScheduledReportRunner({
    store,
    generateAndSaveReport,
    fetchLeague: fetchScheduledLeague,
  })(action, occurrenceKey);
}

async function fetchScheduledLeague(league: LeagueConnection): Promise<LeagueConnection> {
  if (league.connectionMode === 'snapshot')
    throw new Error(
      'Provider refresh is unavailable for this manual import. Choose saved data in a report schedule to create drafts from a recent import.',
    );
  const credential =
    league.platform === 'espn'
      ? ((await readCredential('espn')) ?? undefined)
      : league.platform === 'yahoo'
        ? ((await getYahooAccessToken({ readCredential, saveCredential }, yahooRedirectUri())) ??
          undefined)
        : undefined;
  return connectorFor(league.platform, credential, league.season).fetchLeague(league.id);
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

// Hoisted wrappers: the calendar scheduler is created before the report service exists.
async function runLeagueCalendarEvent(event: LeagueCalendarEvent): Promise<void> {
  return runCalendarEvent(event, {
    store,
    readCredential,
    saveCredential,
    yahooRedirectUri,
    generateAndSaveReport,
  });
}
async function markMissedLeagueCalendarEvent(event: LeagueCalendarEvent, missedAt: Date) {
  return markMissedCalendarEvent(event, missedAt, store);
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
routineBackups.start();
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
// Provider-connected leagues refresh before kickoffs and after games; snapshots never do.
const leagueAutoRefresh = startLeagueAutoRefresh({
  leagues: () => store.snapshot().leagues,
  games: async (season) => (await publicFootballData.get(season)).games,
  refresh: async (league) => {
    const fetched = await retryLeagueFetch(() => fetchScheduledLeague(league), 1);
    const latest = store.snapshot().leagues.find((item) => item.id === league.id);
    // Skip if the owner disconnected or switched the league to an import while fetching.
    if (!latest || latest.connectionMode === 'snapshot') return;
    await saveSyncedLeague(store, fetched);
  },
});
// Closing prices and settled results update in the background, not only on manual Refresh.
const predictionTracking = startPredictionTracking(
  createPredictionPerformanceService({
    store,
    data: publicFootballData,
    odds: publicSportsbookLines,
  }),
  (error) =>
    logEvent('warn', 'prediction.tracking.failed', {
      component: 'advice',
      errorName: errorName(error),
    }),
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
    routineBackups,
    reportScheduler,
    leagueCalendarScheduler,
    footballNewsRefreshTask,
    conversationRetentionTask,
    blueBubblesAutoSyncTask,
    twilioConversationAutoSyncTask,
    leagueAutoRefresh,
    predictionTracking,
    propLineCapture,
  ],
  () => logEvent('info', 'api.stopping', { component: 'api', reason: 'shutdown_requested' }),
);
process.once('SIGINT', stopApplication);
process.once('SIGTERM', stopApplication);
process.once('beforeExit', () => {
  marketResearch.close();
  chats.close();
  propLeans.close();
  propLineLedger.close();
  store.close();
});
