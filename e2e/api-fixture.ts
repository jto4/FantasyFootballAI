import { createMarketResearchRouter } from '../apps/api/src/market-research-routes.js';
import { MarketResearchStore } from '../apps/api/src/market-research-store.js';
import { createLeagueRouter } from '../apps/api/src/league-routes.js';
import { createProviderRouter } from '../apps/api/src/provider-routes.js';
import express from 'express';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
import {
  DeliveryFailure,
  NFLInjuryReportCache,
  SignedInAIError,
  SignedInCodexError,
  PublicSportsbookLines,
} from '@sidekick/integrations';
import type { OutboundMessage, SignedInAIStatus, AIRequest } from '@sidekick/core';
import { RoutineBackups } from '../apps/api/src/routine-backups.js';
import { createOperationsRouter } from '../apps/api/src/operations-routes.js';
import { createBackupRouter } from '../apps/api/src/backup-routes.js';
import { createPortableBackup } from '../apps/api/src/backup-archive.js';
import { createAdviceRouter } from '../apps/api/src/advice-routes.js';
import { createChatRouter } from '../apps/api/src/chat-routes.js';
import { ChatStore } from '../apps/api/src/chat-store.js';
import { createPropBoardRouter, PropLeanStore } from '../apps/api/src/prop-board-routes.js';
import { createProjectionRouter } from '../apps/api/src/projection-routes.js';
import type { NFLInjuryReportRow } from '@sidekick/integrations';
import { adviceAnswer, adviceCatalog, adviceData, adviceNow } from './advice-fixture';

/** Actual production routers and SQLite; substitutes exist only at external provider interfaces. */
export async function apiWorkspace(
  connected = true,
  aiCredential = true,
  adviceModels?: string[],
  signedInStatus?: SignedInAIStatus,
  signedInConnection: 'claude-cli' | 'codex-cli' = 'claude-cli',
) {
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
  const credentials = new Map<string, string>([
    ...(aiCredential ? [['openai', 'fixture-only'] as const] : []),
    ['resend', 'fixture-only'],
  ]);
  const credentialWrites: { provider: string; value: string }[] = [];
  let generations = 0,
    failDelivery = false,
    blocked = false;
  let release = () => {};
  const adviceCalls: import('@sidekick/core').AIRequest[] = [];
  const signedInCalls: AIRequest[] = [];
  let signedInFailure = false,
    signedInProbeBlocked = false;
  let signedInLimit = false;
  let savedAdviceConfigurations = 0;
  let invalidAdvice = false,
    adviceBlocked = false,
    adviceNewsStale = false;
  let adviceInjuryRows: NFLInjuryReportRow[] = [];
  let adviceFootballData = adviceData();
  let adviceClock = adviceNow,
    oddsMissing = false,
    oddsFinal = false,
    oddsHomePrice = -180;
  const sportsbook = new PublicSportsbookLines(
    async () => {
      if (oddsMissing) throw new Error('Fixture odds outage');
      const game = adviceFootballData.games.find((g) => g.id === 'upcoming')!;
      return new Response(
        JSON.stringify({
          header: {
            id: game.espnId,
            uid: `s:20~l:28~e:${game.espnId}`,
            season: { year: game.season, type: 2 },
            timeValid: true,
            competitions: [
              {
                id: game.espnId,
                date: game.kickoffAt,
                status: { type: { state: oddsFinal ? 'post' : 'pre', completed: oddsFinal } },
                competitors: [
                  { id: '2', homeAway: 'home', team: { abbreviation: game.home }, score: '24' },
                  { id: '15', homeAway: 'away', team: { abbreviation: game.away }, score: '17' },
                ],
              },
            ],
          },
          pickcenter: [
            {
              provider: { id: '100', name: 'Fictional sportsbook' },
              homeTeamOdds: { teamId: '2' },
              awayTeamOdds: { teamId: '15' },
              moneyline: {
                home: { close: { odds: String(oddsHomePrice) } },
                away: { close: { odds: '+150' } },
              },
              pointSpread: {
                home: { close: { line: '-3.5', odds: '-105' } },
                away: { close: { line: '+3.5', odds: '-115' } },
              },
              total: {
                over: { close: { line: 'o54.5', odds: '-115' } },
                under: { close: { line: 'u54.5', odds: '-105' } },
              },
            },
          ],
        }),
      );
    },
    () => adviceClock,
  );
  let advicePlayers = new Map(adviceCatalog);
  let modelAdviceAnswer = adviceAnswer;
  let releaseAdvice = () => {};
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
      if (request.prompt.includes('<untrusted_advice_data>')) {
        adviceCalls.push(request);
        if (adviceBlocked)
          await new Promise<void>((resolve) => {
            releaseAdvice = resolve;
          });
        return invalidAdvice ? 'unverified model response' : modelAdviceAnswer(request);
      }
      // Chat: ask for the standings once, then answer from them.
      if (request.prompt.includes("User's question:"))
        return request.prompt.includes('<lookup_result>')
          ? '{"answer":"**Start your studs.** The fixture standings are in, and the trash talk writes itself."}'
          : '{"lookups":[{"tool":"league_overview"}]}';
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
  const marketResearch = new MarketResearchStore(join(directory, 'market-research.sqlite'));
  let marketTape: import('@sidekick/core').ExternalTotalTape | undefined;
  let researchOdds: import('@sidekick/core').SportsbookSnapshot | undefined;
  let researchNews: import('@sidekick/integrations').FootballNewsSnapshot = {
    items: [],
    stale: false,
  };
  app.use(
    createMarketResearchRouter({
      research: marketResearch,
      now: () => adviceClock,
      data: { get: async () => structuredClone(adviceFootballData) },
      markets: {
        getTotal: async (_g, p, cutoff) =>
          marketTape && marketTape.provider === p
            ? {
                ...structuredClone(marketTape),
                cutoffAt: cutoff,
                windowStartAt: new Date(Date.parse(cutoff) - 86400000).toISOString(),
                capturedAt: new Date(adviceClock).toISOString(),
              }
            : undefined,
      },
      odds: {
        get: async (g) => researchOdds ?? sportsbook.get(g),
        result: (g) => sportsbook.result(g),
      },
      news: { get: async () => researchNews },
      catalog: async () => new Map(advicePlayers),
    }),
  );
  app.use(createProjectionRouter({ store, now: () => adviceNow }));
  app.get('/api/email/received', (_req, res) => res.json([]));
  app.use(
    createAdviceRouter({
      store,
      data: {
        get: async () => structuredClone(adviceFootballData),
        outcomes: async () => ({
          ...structuredClone(adviceFootballData),
          sources: adviceFootballData.sources.map((s) => ({
            ...s,
            retrievedAt: new Date(adviceClock).toISOString(),
          })),
        }),
      },
      odds: sportsbook,
      catalog: async () => new Map(advicePlayers),
      configuredAI: async () => {
        savedAdviceConfigurations++;
        return store.settingsSnapshot().aiRuntime?.mode === 'codex-cli' || credentials.has('openai')
          ? await configuredAI()
          : null;
      },
      ...(signedInStatus !== undefined
        ? {
            [signedInConnection === 'codex-cli' ? 'signedInCodex' : 'signedInAI']: {
              status: async () => signedInStatus!,
              provider: async () => {
                if (signedInStatus !== 'signed-in') throw new Error('Fixture signed out');
                return {
                  id: signedInConnection,
                  generate: async (request: AIRequest) => {
                    signedInCalls.push(request);
                    if (signedInLimit)
                      throw signedInConnection === 'codex-cli'
                        ? new SignedInCodexError('limit-reported')
                        : new SignedInAIError('limit-reported');
                    if (signedInFailure) throw new Error('Private fixture provider detail');
                    if (request.prompt === 'Return only {"ok":true}.') {
                      if (signedInProbeBlocked)
                        await new Promise<void>((_resolve, reject) =>
                          request.signal!.addEventListener(
                            'abort',
                            () => reject(new Error('canceled')),
                            { once: true },
                          ),
                        );
                      return '{"ok":true}';
                    }
                    return (await configuredAI()).generate(request);
                  },
                };
              },
            },
          }
        : {}),
      ...(adviceModels ? { discoverModels: async () => adviceModels } : {}),
      now: () => adviceClock,
      news: {
        get: async () => ({
          stale: adviceNewsStale,
          refreshedAt: new Date(adviceNow).toISOString(),
          items: [
            {
              id: 'fictional-news',
              title: 'Harper Receiver earns a larger role',
              source: 'Fictional News',
              url: 'https://example.test/story',
              publishedAt: new Date(adviceNow).toISOString(),
              summary: 'A fictional practice report for test evidence.',
            },
            {
              title: 'Buffalo Bills adjust their offense for the upcoming game',
              source: 'Fictional Team News',
              url: 'https://example.test/team-story',
              publishedAt: new Date(adviceNow - 3_600_000).toISOString(),
            },
            {
              title: 'Kansas City Chiefs receiver returns to practice',
              source: 'Unrelated News',
              url: 'https://example.test/unrelated-story',
              publishedAt: new Date(adviceNow).toISOString(),
            },
          ],
        }),
      },
      injuries: {
        get: async () => ({
          rows: adviceInjuryRows,
          retrievedAt: new Date(adviceNow).toISOString(),
          sourceUrl: 'https://example.test/injuries',
        }),
      },
    }),
  );
  const currentBackup = async () => {
    const capture = join(directory, 'capture.sqlite');
    await store.backupTo(capture);
    return createPortableBackup(await readFile(capture), store.path);
  };
  let backupKey: string | null = null;
  const backups = new RoutineBackups({
    store,
    currentBackup,
    readPassphrase: async () => backupKey,
    savePassphrase: async (value) => {
      backupKey = value;
    },
    removePassphrase: async () => {
      backupKey = null;
    },
  });
  app.use(
    createOperationsRouter({
      store,
      backups,
      logs: async () => ({ available: false, entries: [] }),
    }),
  );
  app.use(
    createBackupRouter({
      currentBackup,
      validateBackup: (contents) => store.validateBackupBuffer(contents),
      listSafetyBackups: () => store.listSafetyBackups(),
      readSafetyBackup: (name) => store.readSafetyBackup(name),
      deleteSafetyBackup: (name) => store.deleteSafetyBackup(name),
      restoreBackup: (contents) => store.restoreFromBuffer(contents),
      afterRestore: async () => {
        await backups.disableAfterRestore();
        return store.settingsSnapshot();
      },
    }),
  );
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
        { provider: 'openai', configured: credentials.has('openai') },
        { provider: 'resend', configured: true },
      ],
      saveCredential: async (provider, value) => {
        if (provider) {
          credentials.set(provider, value);
          credentialWrites.push({ provider, value });
        }
      },
      removeCredential: async (provider) => {
        if (provider) credentials.delete(provider);
      },
      readCredential: async (provider) => credentials.get(provider) ?? null,
      settingsSnapshot: () => store.settingsSnapshot(),
      configuredAI,
      verifyTwilioCredentials: async () => ({ valid: true }),
      sendResendTestEmail: async () => {},
      discoverModels: async () => ['gpt-6-luna'],
    }),
  );
  const propLeans = new PropLeanStore(':memory:');
  app.use(
    createPropBoardRouter({
      data: {
        get: async () => ({
          ...structuredClone(adviceFootballData),
          playerForecasts: [
            {
              espnId: '900',
              name: 'Alex Quarterback',
              position: 'QB',
              team: 'BUF',
              season: 2026,
              week: 5,
              issuedWeek: 5,
              stats: { passing_yards: 300 },
              sourceId: 'espn-forecasts-2026-0',
            },
          ],
        }),
      },
      props: {
        props: async (game) => ({
          gameId: game.id,
          lines: [
            {
              id: `espn:${game.id}:900:passing_yards:265.5`,
              gameId: game.id,
              playerName: 'Alex Quarterback',
              team: 'BUF',
              stat: 'passing_yards',
              line: 265.5,
              sportsbook: 'DraftKings',
              source: 'espn',
              observedAt: new Date(adviceClock).toISOString(),
            },
          ],
          priced: false,
          warnings: [],
        }),
      },
      store,
      leans: propLeans,
      now: () => adviceClock,
    }),
  );
  const chats = new ChatStore(':memory:');
  app.use(
    createChatRouter({
      store,
      chats,
      configuredAI,
      local: async (path) => (await fetch(`http://127.0.0.1:${port}${path}`)).json(),
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
    app,
    marketResearch,
    setMarketTape: (t: import('@sidekick/core').ExternalTotalTape | undefined) => {
      marketTape = t;
    },
    setResearchOdds: (o: import('@sidekick/core').SportsbookSnapshot) => {
      researchOdds = o;
    },
    setResearchNews: (n: import('@sidekick/integrations').FootballNewsSnapshot) => {
      researchNews = n;
    },
    url: `http://127.0.0.1:${port}`,
    store,
    sends,
    credentialWrites,
    generations: () => generations,
    adviceCalls,
    signedInCalls,
    savedAdviceConfigurations: () => savedAdviceConfigurations,
    setSignedInStatus: (status: SignedInAIStatus) => {
      signedInStatus = status;
    },
    failSignedIn: (fail: boolean) => {
      signedInFailure = fail;
    },
    reportSignedInLimit: () => {
      signedInLimit = true;
    },
    blockSignedInProbe: (block: boolean) => {
      signedInProbeBlocked = block;
    },
    setAdviceAnswer: (answer: typeof adviceAnswer) => {
      modelAdviceAnswer = answer;
    },
    staleAdviceNews: () => {
      adviceNewsStale = true;
    },
    setAdviceInjuries: (rows: NFLInjuryReportRow[]) => {
      adviceInjuryRows = structuredClone(rows);
    },
    setAdviceClock: (time: number) => {
      adviceClock = time;
    },
    setOddsMissing: (missing: boolean) => {
      oddsMissing = missing;
    },
    setOddsFinal: (final: boolean) => {
      oddsFinal = final;
    },
    setOddsHomePrice: (price: number) => {
      oddsHomePrice = price;
    },
    setAdviceFootballData: (data: import('@sidekick/core').FootballDataSnapshot) => {
      adviceFootballData = structuredClone(data);
    },
    setAdviceCatalog: (catalog: typeof advicePlayers) => {
      advicePlayers = structuredClone(catalog);
    },
    invalidAdvice: () => {
      invalidAdvice = true;
    },
    blockAdvice: () => {
      adviceBlocked = true;
    },
    releaseAdvice: () => {
      adviceBlocked = false;
      releaseAdvice();
    },
    failNextDelivery: () => {
      failDelivery = true;
    },
    block: () => {
      blocked = true;
    },
    release: () => {
      blocked = false;
      release();
      adviceBlocked = false;
      releaseAdvice();
    },
    async close() {
      backups.stop();
      release();
      await queue.stop();
      await queue.idle();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      marketResearch.close();
      chats.close();
      propLeans.close();
      store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
