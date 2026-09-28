import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';
import { LocalStore, validateState } from './store.js';
import { blueBubblesMemorySource } from './bluebubbles-memory.js';
import { storedBlueBubblesHistory } from './bluebubbles-memory.js';
import { mergeConversationImport } from './conversation-import.js';
import { twilioConversationMemorySource } from './twilio-conversation-memory.js';
import { storedTwilioConversationHistory } from './twilio-conversation-memory.js';

let directory = '';
const activeStores: LocalStore[] = [];
function openStore(path: string, legacyPath?: string): LocalStore {
  const store = new LocalStore(path, legacyPath);
  activeStores.push(store);
  return store;
}

afterEach(async () => {
  for (const store of activeStores.splice(0)) store.close();
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = '';
});

describe('local SQLite store', () => {
  it('validates restored citation links and upgrades reports missing legacy citations', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-report-citations-'));
    const store = openStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
    await store.load();
    const candidate = structuredClone(store.snapshot());
    candidate.reports.push({
      id: 'citation-report',
      leagueId: 'league-1',
      kind: 'power-rankings',
      createdAt: new Date().toISOString(),
      title: 'Test report',
      body: 'Report',
      citations: [{ title: 'Source', url: 'https://example.com/story' }],
      status: 'draft',
    });
    expect(validateState(candidate).reports[0]?.citations).toEqual([
      { title: 'Source', url: 'https://example.com/story' },
    ]);

    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'https://user:password@example.com/story',
      `https://example.com/${'a'.repeat(2050)}`,
    ]) {
      const invalid = structuredClone(candidate);
      invalid.reports[0]!.citations[0]!.url = url;
      expect(() => validateState(invalid)).toThrow('Invalid report delivery state in local data.');
    }

    const legacy = structuredClone(candidate);
    delete (legacy.reports[0] as Partial<(typeof legacy.reports)[number]>).citations;
    expect(validateState(legacy).reports[0]?.citations).toEqual([]);
  });

  it('validates persisted AI usage summaries and owner-entered rates', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-ai-usage-'));
    const store = openStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
    await store.load();
    const baseline = store.snapshot();
    baseline.reports.push({
      id: 'report-1',
      leagueId: 'league-1',
      kind: 'power-rankings',
      createdAt: new Date().toISOString(),
      title: 'Test report',
      body: 'Report',
      citations: [],
      status: 'draft',
      aiUsage: {
        model: 'model-x',
        inputTokens: 100,
        outputTokens: 50,
        inputUsdPerMillionTokens: 2,
        outputUsdPerMillionTokens: 10,
        estimatedCostUsd: 0.0007,
      },
    });
    expect(() => validateState(baseline)).not.toThrow();

    const invalid = structuredClone(baseline);
    invalid.reports[0]!.aiUsage!.estimatedCostUsd = Number.POSITIVE_INFINITY;
    expect(() => validateState(invalid)).toThrow('Invalid report delivery state in local data.');
  });

  it('validates persisted Twilio Conversations page cursors', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-twilio-cursor-'));
    const store = openStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
    await store.load();
    const candidate = structuredClone(store.snapshot());
    candidate.settings.twilioConversationSyncCursor = {
      conversationSid: `CH${'a'.repeat(32)}`,
      page: 4,
      lastIndex: 399,
      initialized: true,
    };
    expect(() => validateState(candidate)).not.toThrow();

    candidate.settings.twilioConversationSyncCursor.initialized = 'ready' as unknown as boolean;
    expect(() => validateState(candidate)).toThrow('Invalid settings in local state.');
    candidate.settings.twilioConversationSyncCursor.initialized = true;
    candidate.settings.twilioConversationSyncCursor.page = -1;
    expect(() => validateState(candidate)).toThrow('Invalid settings in local state.');
  });

  it('rejects malformed saved writing style presets in local state', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-writing-presets-'));
    const store = openStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
    await store.load();
    const candidate = structuredClone(store.snapshot());
    candidate.settings.customWritingStylePresets = [
      { name: 'Commissioner', value: 'Concise.' },
      { name: 'commissioner', value: 'With more sarcasm.' },
    ];
    expect(() => validateState(candidate)).toThrow('Invalid settings in local state.');
  });

  it('validates opt-in Twilio Conversations polling settings', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-twilio-polling-'));
    const store = openStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
    await store.load();
    const candidate = structuredClone(store.snapshot());
    candidate.settings.twilioConversationAutoSyncEnabled = true;
    candidate.settings.twilioConversationSyncIntervalMinutes = 60;
    expect(() => validateState(candidate)).not.toThrow();

    candidate.settings.twilioConversationSyncIntervalMinutes = 10 as 5;
    expect(() => validateState(candidate)).toThrow('Invalid settings in local state.');
  });

  it('validates the explicit MCP delivery permission', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-mcp-delivery-'));
    const store = openStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
    await store.load();
    const candidate = structuredClone(store.snapshot());
    candidate.settings.mcpDeliveryEnabled = true;
    expect(() => validateState(candidate)).not.toThrow();

    (candidate.settings as unknown as Record<string, unknown>).mcpDeliveryEnabled = 'yes';
    expect(() => validateState(candidate)).toThrow('Invalid settings in local state.');
  });

  it('keeps nflverse injury reports opt-in and validates the saved setting', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-injury-setting-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    expect(store.snapshot().settings.nflInjuryReportsEnabled).toBe(false);

    await store.update((state) => {
      state.settings.nflInjuryReportsEnabled = true;
    });
    store.close();
    activeStores.splice(activeStores.indexOf(store), 1);

    const reopened = openStore(file, join(directory, 'missing.json'));
    await reopened.load();
    expect(reopened.snapshot().settings.nflInjuryReportsEnabled).toBe(true);

    const invalid = reopened.snapshot();
    (invalid.settings as unknown as Record<string, unknown>).nflInjuryReportsEnabled = 'yes';
    expect(() => validateState(invalid)).toThrow('Invalid settings in local state.');
  });

  it('validates API temperature and output-token bounds in persisted settings', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-ai-runtime-settings-'));
    const store = openStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
    await store.load();
    const baseline = store.snapshot();

    for (const [field, invalidValue] of [
      ['temperature', -0.1],
      ['temperature', 2.1],
      ['maxOutputTokens', 127],
      ['maxOutputTokens', 16_385],
      ['maxOutputTokens', 128.5],
    ] as const) {
      const candidate = structuredClone(baseline);
      Object.assign(candidate.settings.aiRuntime!, { [field]: invalidValue });
      expect(() => validateState(candidate)).toThrow('Invalid settings in local state.');
    }
  });

  it('retains independently dated exports when an older merged source expires', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-export-retention-'));
    const store = openStore(
      join(directory, 'state.sqlite'),
      join(directory, 'missing-legacy.json'),
    );
    await store.load();
    const now = Date.now();
    const oldDate = new Date(now - 60 * 24 * 60 * 60 * 1_000).toISOString();
    const newDate = new Date(now - 5 * 24 * 60 * 60 * 1_000).toISOString();
    const oldSource = mergeConversationImport('', {
      digest: 'a'.repeat(64),
      importedAt: oldDate,
      sourceName: 'older.txt',
      memberName: 'League member',
      messages: 'Old authored message',
    });
    const allSources = mergeConversationImport(oldSource.sourceText, {
      digest: 'b'.repeat(64),
      importedAt: newDate,
      sourceName: 'recent.txt',
      memberName: 'League member',
      messages: 'Recent authored message',
    });
    await store.update((state) => {
      state.settings.conversationRetentionDays = 30;
      state.memories.push({
        id: 'merged-profile',
        name: 'League member',
        sourceName: 'Multiple conversation exports',
        importedAt: oldDate,
        sourceText: allSources.sourceText,
        styleNotes: 'Concise and sarcastic',
        contextNotes: 'Favors the Lions',
      });
    });

    expect(await store.purgeExpiredConversationSources()).toBe(1);
    const saved = store.snapshot().memories[0]!;
    expect(saved.sourceText).toContain('recent.txt');
    expect(saved.sourceText).not.toContain('older.txt');
    expect(saved.styleNotes).toBe('Concise and sarcastic');
    expect(saved.contextNotes).toBe('Favors the Lions');
  });

  it('expires original imported text but keeps reviewed profile notes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-retention-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing-legacy.json'));
    await store.load();
    await store.update((state) => {
      state.settings.conversationRetentionDays = 30;
      state.memories = [
        {
          id: 'old',
          name: 'Old Import',
          sourceName: 'old.txt',
          importedAt: '2025-01-01T00:00:00.000Z',
          sourceText: 'old private messages',
          styleNotes: 'Short, sarcastic replies',
          contextNotes: 'Keeps the same keeper roster',
          banterPreference: 'Make fun of his bad picks',
          avoidTopics: 'Family',
        },
        {
          id: 'new',
          name: 'New Import',
          sourceName: 'new.txt',
          importedAt: new Date().toISOString(),
          sourceText: 'new private messages',
          styleNotes: '',
          contextNotes: '',
        },
      ];
    });

    expect(await store.purgeExpiredConversationSources()).toBe(1);
    const reopened = openStore(file, join(directory, 'missing-legacy.json'));
    await reopened.load();
    expect(reopened.snapshot().memories[0]).toMatchObject({
      sourceText: '',
      styleNotes: 'Short, sarcastic replies',
      contextNotes: 'Keeps the same keeper roster',
      banterPreference: 'Make fun of his bad picks',
      avoidTopics: 'Family',
    });
    expect(reopened.snapshot().memories[1]?.sourceText).toBe('new private messages');
  });

  it('expires live chat messages individually by their message timestamps', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-live-retention-'));
    const store = openStore(
      join(directory, 'state.sqlite'),
      join(directory, 'missing-legacy.json'),
    );
    await store.load();
    const now = Date.now();
    await store.update((state) => {
      state.settings.conversationRetentionDays = 30;
      state.memories = [
        {
          id: 'chat-member',
          name: 'League member',
          sourceName: blueBubblesMemorySource,
          sourceAuthorId: 'chat-guid\u0000person@example.test',
          importedAt: new Date(now).toISOString(),
          sourceText: JSON.stringify({
            format: 'bluebubbles-v1',
            messages: [
              { guid: 'expired', dateCreated: now - 31 * 24 * 60 * 60 * 1_000, text: 'old' },
              { guid: 'recent', dateCreated: now - 2 * 24 * 60 * 60 * 1_000, text: 'new' },
            ],
          }),
          styleNotes: 'Dry jokes',
          contextNotes: 'Likes the Bears',
        },
      ];
    });

    expect(await store.purgeExpiredConversationSources()).toBe(1);
    const profile = store.snapshot().memories[0]!;
    expect(storedBlueBubblesHistory(profile.sourceText).messages.map(({ guid }) => guid)).toEqual([
      'recent',
    ]);
    expect(profile.styleNotes).toBe('Dry jokes');
    expect(profile.contextNotes).toBe('Likes the Bears');
  });

  it('expires Twilio Conversations messages individually while keeping profile notes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-twilio-retention-'));
    const store = openStore(
      join(directory, 'state.sqlite'),
      join(directory, 'missing-legacy.json'),
    );
    await store.load();
    const now = Date.now();
    await store.update((state) => {
      state.settings.conversationRetentionDays = 30;
      state.memories = [
        {
          id: 'twilio-member',
          name: 'League member',
          sourceName: twilioConversationMemorySource,
          sourceAuthorId: 'CHgroup\u0000participant',
          importedAt: new Date(now).toISOString(),
          sourceText: JSON.stringify({
            format: 'twilio-conversations-v1',
            messages: [
              {
                sid: `IM${'a'.repeat(32)}`,
                index: 1,
                createdAt: new Date(now - 31 * 24 * 60 * 60 * 1_000).toISOString(),
                text: 'old',
              },
              {
                sid: `IM${'b'.repeat(32)}`,
                index: 2,
                createdAt: new Date(now - 2 * 24 * 60 * 60 * 1_000).toISOString(),
                text: 'new',
              },
            ],
          }),
          styleNotes: 'Dry jokes',
          contextNotes: 'Likes the Bears',
        },
      ];
    });

    expect(await store.purgeExpiredConversationSources()).toBe(1);
    const profile = store.snapshot().memories[0]!;
    expect(
      storedTwilioConversationHistory(profile.sourceText).messages.map(({ sid }) => sid),
    ).toEqual([`IM${'b'.repeat(32)}`]);
    expect(profile.styleNotes).toBe('Dry jokes');
    expect(profile.contextNotes).toBe('Likes the Bears');
  });

  it('expires received email entries individually while preserving newer email and profile notes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-resend-retention-'));
    const store = openStore(
      join(directory, 'state.sqlite'),
      join(directory, 'missing-legacy.json'),
    );
    await store.load();
    const now = Date.now();
    const oldDate = new Date(now - 31 * 24 * 60 * 60 * 1_000).toISOString();
    const recentDate = new Date(now - 2 * 24 * 60 * 60 * 1_000).toISOString();
    await store.update((state) => {
      state.settings.conversationRetentionDays = 30;
      state.memories = [
        {
          id: 'email-member',
          name: 'League mate',
          sourceName: 'Resend received email',
          sourceAuthorId: 'resend:mate@example.test',
          importedAt: recentDate,
          sourceText: `[[resend-email:old]]\nDate: ${oldDate}\nSubject: old\nprivate old\n\n[[resend-email:new]]\nDate: ${recentDate}\nSubject: new\nprivate new`,
          styleNotes: 'Uses short jokes',
          contextNotes: 'Keeps a rookie',
        },
      ];
    });

    expect(await store.purgeExpiredConversationSources()).toBe(1);
    expect(store.snapshot().memories[0]).toMatchObject({
      sourceText: `[[resend-email:new]]\nDate: ${recentDate}\nSubject: new\nprivate new`,
      styleNotes: 'Uses short jokes',
      contextNotes: 'Keeps a rookie',
    });
  });

  it('persists edits and creates a versioned SQLite database', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing-legacy.json'));
    await store.load();
    expect(store.snapshot().settings.newsRefreshMinutes).toBe(15);
    expect(store.snapshot().settings.reportLength).toBe('standard');
    expect(store.snapshot().settings.leagueStaleAfterHours).toBe(24);
    expect(store.snapshot().settings.customWritingStylePresets).toEqual([]);
    await store.update((state) => {
      state.settings.writingStyle = 'Dry and kind';
      state.settings.customWritingStylePresets = [
        { name: 'Sunday desk', value: 'Crisp, funny, and specific.' },
      ];
      state.settings.newsSources = ['fox'];
      state.settings.leagueStaleAfterHours = 72;
      state.leagues.push({
        id: 'league-1',
        platform: 'sleeper',
        name: 'League',
        displayName: 'League',
        teamCount: 0,
        scoring: {},
        settings: {},
        teams: [],
        connectedAt: '2026-01-01',
      });
    });
    const reopened = openStore(file, join(directory, 'missing-legacy.json'));
    await reopened.load();
    expect(reopened.snapshot().settings.writingStyle).toBe('Dry and kind');
    expect(reopened.snapshot().settings.customWritingStylePresets).toEqual([
      { name: 'Sunday desk', value: 'Crisp, funny, and specific.' },
    ]);
    expect(reopened.snapshot().settings.newsSources).toEqual(['fox']);
    expect(reopened.snapshot().settings.leagueStaleAfterHours).toBe(72);

    const database = new Database(file, { readonly: true });
    expect(database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual(
      {
        version: 4,
      },
    );
    expect(database.prepare('SELECT id FROM leagues').all()).toEqual([{ id: 'league-1' }]);
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE name = 'app_state'").get(),
    ).toBeUndefined();
    database.close();
    expect((await readFile(file)).subarray(0, 15).toString()).toBe('SQLite format 3');
    expect(await reopened.listSafetyBackups()).toEqual([]);
  });

  it('rejects unsupported league snapshot warning thresholds in restored state', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-threshold-'));
    const store = openStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
    await store.load();
    const snapshot = store.snapshot();
    expect(() =>
      validateState({
        ...snapshot,
        settings: { ...snapshot.settings, leagueStaleAfterHours: 1 },
      }),
    ).toThrow('Invalid settings in local state.');
  });

  it('serializes concurrent writes without dropping an edit', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const store = openStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
    await store.load();
    await Promise.all([
      store.update((state) => {
        state.settings.writingStyle = 'Voice one';
      }),
      store.update((state) => {
        state.leagues.push({
          id: 'league-1',
          platform: 'sleeper',
          name: 'League',
          displayName: 'League',
          teamCount: 0,
          scoring: {},
          settings: {},
          teams: [],
          connectedAt: '2026-01-01',
        });
      }),
    ]);
    expect(store.snapshot().settings.writingStyle).toBe('Voice one');
    expect(store.snapshot().leagues).toHaveLength(1);
  });

  it('coordinates report delivery claims across store instances and keeps sent reports claimed', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const file = join(directory, 'state.sqlite');
    const first = openStore(file, join(directory, 'missing.json'));
    await first.load();
    await first.update((state) => {
      state.reports.push({
        id: 'report-claim',
        leagueId: 'league-1',
        kind: 'power-rankings',
        createdAt: '2026-01-01T00:00:00.000Z',
        title: 'Weekly rankings',
        body: 'Draft text',
        citations: [],
        status: 'draft',
      });
    });
    const second = openStore(file, join(directory, 'missing.json'));
    await second.load();

    const claim = first.claimReportDelivery('report-claim');
    expect(claim).toBeTruthy();
    expect(second.claimReportDelivery('report-claim')).toBeUndefined();
    first.finishReportDeliveryClaim('report-claim', claim!, 'sent');
    expect(second.claimReportDelivery('report-claim', true)).toBeUndefined();
  });

  it('requires explicit confirmation to replace an uncertain delivery claim', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.reports.push({
        id: 'report-uncertain',
        leagueId: 'league-1',
        kind: 'power-rankings',
        createdAt: '2026-01-01T00:00:00.000Z',
        title: 'Weekly rankings',
        body: 'Draft text',
        citations: [],
        status: 'draft',
        deliveryState: 'uncertain',
      });
    });
    const oldClaim = store.claimReportDelivery('report-uncertain', true);
    expect(oldClaim).toBeTruthy();
    store.finishReportDeliveryClaim('report-uncertain', oldClaim!, 'uncertain');
    expect(store.claimReportDelivery('report-uncertain')).toBeUndefined();
    expect(store.claimReportDelivery('report-uncertain', true)).toBeTruthy();
  });

  it('marks a delivery interrupted by shutdown as uncertain instead of allowing a blind retry', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.reports.push({
        id: 'report-1',
        leagueId: 'league-1',
        kind: 'power-rankings',
        createdAt: '2026-01-01T00:00:00.000Z',
        title: 'Weekly rankings',
        body: 'Draft text',
        citations: [],
        status: 'draft',
        deliveryState: 'sending',
        deliveryAttempts: [
          {
            startedAt: '2026-01-01T00:00:00.000Z',
            channel: 'email',
            status: 'sending',
          },
        ],
      });
    });

    const reopened = openStore(file, join(directory, 'missing.json'));
    await reopened.load();
    expect(reopened.snapshot().reports[0]).toMatchObject({
      id: 'report-1',
      status: 'draft',
      deliveryState: 'uncertain',
    });
    expect(reopened.snapshot().reports[0]?.deliveryUpdatedAt).toBeTruthy();
    expect(reopened.snapshot().reports[0]?.deliveryAttempts?.[0]).toMatchObject({
      status: 'uncertain',
      finishedAt: expect.any(String),
    });
  });

  it('rejects malformed legacy state rather than silently replacing it', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const legacyFile = join(directory, 'legacy.json');
    await writeFile(legacyFile, '{broken');
    await expect(openStore(join(directory, 'state.sqlite'), legacyFile).load()).rejects.toThrow();
  });

  it('imports and upgrades legacy JSON state without deleting the source file', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const legacyFile = join(directory, 'state.json');
    const legacyState = {
      settings: {
        writingStyle: 'Friendly',
        actions: [{ kind: 'power-rankings', channel: 'dashboard', enabled: true, mode: 'draft' }],
      },
      leagues: [],
      reports: [],
    };
    await writeFile(legacyFile, JSON.stringify(legacyState));
    const store = openStore(join(directory, 'state.sqlite'), legacyFile);
    await store.load();
    expect(
      store.snapshot().settings.actions.find((action) => action.kind === 'power-rankings')?.schedule
        .enabled,
    ).toBe(true);
    expect(store.snapshot().settings.actions).toHaveLength(5);
    expect(store.snapshot().settings.analyzeImportsWithAI).toBe(false);
    expect(store.snapshot().settings.includeMemberContextInReports).toBe(false);
    expect(store.snapshot().settings.includeMemberContextInChatReplies).toBe(false);
    expect(store.snapshot().settings.memoryEnabled).toBe(true);
    expect(store.snapshot().settings.chatRepliesEnabled).toBe(false);
    expect(store.snapshot().settings.chatRepliesAutoSend).toBe(false);
    expect(JSON.parse(await readFile(legacyFile, 'utf8'))).toEqual(legacyState);
  });

  it('persists valid league calendar events and removes events for disconnected leagues', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-calendar-store-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.leagues.push({
        id: 'calendar-league',
        platform: 'sleeper',
        name: 'Calendar league',
        displayName: 'Calendar league',
        teamCount: 1,
        scoring: {},
        settings: {},
        teams: [],
        connectedAt: '2026-01-01',
      });
      state.settings.calendarEvents = [
        {
          id: 'c10f595f-c3fd-4bc8-9d08-183cdd533122',
          leagueId: 'calendar-league',
          title: 'Draft night',
          kind: 'draft-hype',
          date: '2026-08-25',
          time: '19:00',
          timezone: 'America/New_York',
        },
        {
          id: 'd20f595f-c3fd-4bc8-9d08-183cdd533123',
          leagueId: 'missing-league',
          title: 'Unknown league',
          kind: 'draft-hype',
          date: '2026-08-25',
          time: '19:00',
          timezone: 'America/New_York',
        },
      ];
    });

    const reopened = openStore(file, join(directory, 'missing.json'));
    await reopened.load();
    expect(reopened.snapshot().settings.calendarEvents?.map((event) => event.title)).toEqual([
      'Draft night',
    ]);
    await reopened.update((state) => {
      state.leagues = [];
    });
    const afterDisconnect = openStore(file, join(directory, 'missing.json'));
    await afterDisconnect.load();
    expect(afterDisconnect.snapshot().settings.calendarEvents).toEqual([]);
  });

  it('upgrades populated schema version 1 databases into separate domain tables', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const file = join(directory, 'state.sqlite');
    const previousState = {
      settings: { writingStyle: 'Old installation' },
      leagues: [
        {
          id: 'league-before-upgrade',
          platform: 'sleeper',
          name: 'Saved league',
          displayName: 'Saved league',
          teamCount: 1,
          scoring: {},
          settings: {},
          teams: [],
          connectedAt: '2026-01-01',
        },
      ],
      reports: [],
      memories: [],
      scheduledRuns: [],
    };
    const previousDatabase = new Database(file);
    previousDatabase.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;
      CREATE TABLE app_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
    `);
    previousDatabase
      .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)')
      .run('2026-01-01T00:00:00.000Z');
    previousDatabase
      .prepare('INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?, ?)')
      .run(JSON.stringify(previousState), '2026-01-01T00:00:00.000Z');
    previousDatabase.close();

    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    const preUpgradeBackups = await store.listSafetyBackups();
    expect(preUpgradeBackups).toHaveLength(1);
    expect(preUpgradeBackups[0]?.name).toMatch(/^before-upgrade-/);
    const preUpgradeContents = await store.readSafetyBackup(preUpgradeBackups[0]!.name);
    expect(preUpgradeContents?.subarray(0, 15).toString()).toBe('SQLite format 3');
    const preUpgradePath = join(directory, 'backup-check.sqlite');
    await writeFile(preUpgradePath, preUpgradeContents!);
    const preUpgradeDatabase = new Database(preUpgradePath, { readonly: true });
    expect(
      preUpgradeDatabase.prepare('SELECT MAX(version) AS version FROM schema_migrations').get(),
    ).toEqual({ version: 1 });
    expect(preUpgradeDatabase.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    preUpgradeDatabase.close();
    expect(store.snapshot().settings.writingStyle).toBe('Old installation');
    expect(store.snapshot().leagues[0]?.id).toBe('league-before-upgrade');
    const upgradedDatabase = new Database(file, { readonly: true });
    expect(
      upgradedDatabase.prepare('SELECT MAX(version) AS version FROM schema_migrations').get(),
    ).toEqual({ version: 4 });
    expect(upgradedDatabase.prepare('SELECT id FROM leagues').all()).toEqual([
      { id: 'league-before-upgrade' },
    ]);
    upgradedDatabase.close();
  });

  it('persists explicit AI privacy opt-ins', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.settings.analyzeImportsWithAI = true;
      state.settings.includeMemberContextInReports = true;
      state.settings.includeMemberContextInChatReplies = true;
    });

    const reopened = openStore(file, join(directory, 'missing.json'));
    await reopened.load();
    expect(reopened.snapshot().settings.analyzeImportsWithAI).toBe(true);
    expect(reopened.snapshot().settings.includeMemberContextInReports).toBe(true);
    expect(reopened.snapshot().settings.includeMemberContextInChatReplies).toBe(true);
  });

  it('migrates old state without scheduled run history and persists new history', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const legacyFile = join(directory, 'state.json');
    await writeFile(legacyFile, JSON.stringify({ settings: {}, leagues: [], reports: [] }));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, legacyFile);
    await store.load();
    expect(store.snapshot().scheduledRuns).toEqual([]);

    await store.update((state) => {
      state.scheduledRuns.push({
        id: 'run-1',
        kind: 'power-rankings',
        startedAt: '2026-09-25T12:00:00.000Z',
        finishedAt: '2026-09-25T12:01:00.000Z',
        status: 'succeeded',
        detail: 'Processed 1 league(s).',
        leagueResults: [
          {
            leagueId: 'league-1',
            displayName: 'Sunday Crew',
            status: 'succeeded',
          },
          {
            leagueId: 'league-2',
            displayName: 'Monday Misfits',
            status: 'failed',
            detail: 'Check platform access, AI settings, and delivery credentials.',
          },
        ],
      });
      state.scheduledRuns.push({
        id: 'run-2',
        kind: 'matchup-preview',
        startedAt: '2026-09-25T12:05:00.000Z',
        status: 'running',
        retryOf: 'run-1',
        leagueResults: [
          {
            leagueId: 'league-2',
            displayName: 'Monday Misfits',
            status: 'failed',
            detail: 'Retry did not finish; retry this league again after reviewing its status.',
          },
        ],
      });
    });
    const reopened = openStore(file, legacyFile);
    await reopened.load();
    expect(reopened.snapshot().scheduledRuns[0]?.status).toBe('succeeded');
    expect(reopened.snapshot().scheduledRuns[0]?.leagueResults).toEqual([
      { leagueId: 'league-1', displayName: 'Sunday Crew', status: 'succeeded' },
      {
        leagueId: 'league-2',
        displayName: 'Monday Misfits',
        status: 'failed',
        detail: 'Check platform access, AI settings, and delivery credentials.',
      },
    ]);
    expect(reopened.snapshot().scheduledRuns[1]).toMatchObject({
      status: 'failed',
      detail: 'Interrupted when the app last stopped.',
      retryOf: 'run-1',
      leagueResults: [
        {
          leagueId: 'league-2',
          status: 'failed',
          detail: 'Retry did not finish; retry this league again after reviewing its status.',
        },
      ],
    });
  });

  it('restores a validated SQLite backup and preserves a pre-restore safety copy', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.settings.writingStyle = 'Backup voice';
      state.leagues.push({
        id: 'league-from-backup',
        platform: 'sleeper',
        name: 'League from backup',
        displayName: 'League from backup',
        teamCount: 1,
        scoring: {},
        settings: {},
        teams: [],
        connectedAt: '2026-01-01',
      });
    });
    const backupFile = join(directory, 'download.sqlite');
    await store.backupTo(backupFile);
    const backup = await readFile(backupFile);

    await store.update((state) => {
      state.settings.writingStyle = 'Newer voice';
      state.leagues = [];
    });
    const safetyCopy = await store.restoreFromBuffer(backup);

    expect(store.snapshot().settings.writingStyle).toBe('Backup voice');
    expect(store.snapshot().leagues.map((league) => league.id)).toEqual(['league-from-backup']);
    const preserved = new Database(safetyCopy, { readonly: true });
    expect(preserved.prepare('SELECT payload FROM app_settings WHERE id = 1').get()).toBeDefined();
    preserved.close();

    const listed = await store.listSafetyBackups();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ name: basename(safetyCopy), size: expect.any(Number) });
    expect((await store.readSafetyBackup(listed[0]!.name))?.subarray(0, 15).toString()).toBe(
      'SQLite format 3',
    );
    expect(await store.readSafetyBackup('../state.sqlite')).toBeUndefined();
    expect(await store.deleteSafetyBackup('../state.sqlite')).toBe(false);
    expect(await store.deleteSafetyBackup(listed[0]!.name)).toBe(true);
    expect(await store.listSafetyBackups()).toEqual([]);

    const salvagedName = 'before-restore-2026-09-27T00-00-00-000Z-salvage-deadbeef.sqlite';
    await writeFile(join(directory, 'backups', salvagedName), backup);
    expect((await store.listSafetyBackups()).map((item) => item.name)).toEqual([salvagedName]);
    expect((await store.readSafetyBackup(salvagedName))?.subarray(0, 15).toString()).toBe(
      'SQLite format 3',
    );
  });

  it('rolls the database back when a coupled restore step fails', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-restore-rollback-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.settings.writingStyle = 'Backup voice';
    });
    const backupFile = join(directory, 'download.sqlite');
    await store.backupTo(backupFile);
    const backup = await readFile(backupFile);
    await store.update((state) => {
      state.settings.writingStyle = 'Current voice';
    });

    await expect(
      store.restoreFromBuffer(backup, async () => {
        throw new Error('Image library replacement failed.');
      }),
    ).rejects.toThrow('Image library replacement failed.');
    expect(store.snapshot().settings.writingStyle).toBe('Current voice');
  });

  it('requires restored CLI runtimes and automatic actions to be reapproved', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.settings.aiRuntime = {
        mode: 'cli',
        model: 'local',
        command: '/tmp/untrusted-program',
        args: '--run',
        baseUrl: 'https://api.openai.com/v1',
      };
      state.settings.actions[0]!.mode = 'automatic';
      state.settings.actions[0]!.schedule.enabled = true;
      state.settings.imessageAutoSyncEnabled = true;
      state.settings.twilioConversationAutoSyncEnabled = true;
      state.settings.mcpDeliveryEnabled = true;
      state.settings.chatRepliesEnabled = true;
      state.settings.chatRepliesAutoSend = true;
    });
    const backupFile = join(directory, 'external.sqlite');
    await store.backupTo(backupFile);
    const backup = await readFile(backupFile);

    await store.update((state) => {
      state.settings.aiRuntime!.mode = 'api';
      state.settings.actions[0]!.mode = 'draft';
      state.settings.actions[0]!.schedule.enabled = false;
    });
    await store.restoreFromBuffer(backup);

    expect(store.snapshot().settings.aiRuntime?.mode).toBe('api');
    expect(store.snapshot().settings.aiRuntime?.command).toBe('');
    expect(store.snapshot().settings.actions[0]).toMatchObject({
      mode: 'draft',
      schedule: { enabled: false },
    });
    expect(store.snapshot().settings.imessageAutoSyncEnabled).toBe(false);
    expect(store.snapshot().settings.twilioConversationAutoSyncEnabled).toBe(false);
    expect(store.snapshot().settings.mcpDeliveryEnabled).toBe(false);
    expect(store.snapshot().settings.chatRepliesEnabled).toBe(false);
    expect(store.snapshot().settings.chatRepliesAutoSend).toBe(false);

    await store.update((state) => {
      state.settings.aiRuntime!.mode = 'apple-cli';
    });
    const appleBackupFile = join(directory, 'apple-runtime.sqlite');
    await store.backupTo(appleBackupFile);
    await store.update((state) => {
      state.settings.aiRuntime!.mode = 'api';
    });
    await store.restoreFromBuffer(await readFile(appleBackupFile));
    expect(store.snapshot().settings.aiRuntime?.mode).toBe('api');
  });

  it('turns off conversational chat replies restored from a backup', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-chat-reply-restore-'));
    const store = openStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.settings.chatRepliesEnabled = true;
      state.settings.chatRepliesAutoSend = true;
    });
    const backupFile = join(directory, 'chat-replies.sqlite');
    await store.backupTo(backupFile);
    await store.update((state) => {
      state.settings.chatRepliesEnabled = false;
      state.settings.chatRepliesAutoSend = false;
    });

    await store.restoreFromBuffer(await readFile(backupFile));

    expect(store.snapshot().settings.chatRepliesEnabled).toBe(false);
    expect(store.snapshot().settings.chatRepliesAutoSend).toBe(false);
  });

  it('turns off restored iMessage polling without changing draft schedules', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.settings.imessageAutoSyncEnabled = true;
      state.settings.imessageSyncIntervalMinutes = 30;
      state.settings.actions[0]!.schedule.enabled = true;
    });
    const backupFile = join(directory, 'polling-enabled.sqlite');
    await store.backupTo(backupFile);

    await store.update((state) => {
      state.settings.imessageAutoSyncEnabled = false;
    });
    await store.restoreFromBuffer(await readFile(backupFile));

    expect(store.snapshot().settings.imessageAutoSyncEnabled).toBe(false);
    expect(store.snapshot().settings.imessageSyncIntervalMinutes).toBe(30);
    expect(store.snapshot().settings.actions[0]!.schedule.enabled).toBe(true);
  });

  it('turns off restored Twilio Conversations polling without changing its interval', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.settings.smsRecipient = 'CH0123456789abcdef0123456789abcdef';
      state.settings.twilioConversationAutoSyncEnabled = true;
      state.settings.twilioConversationSyncIntervalMinutes = 30;
    });
    const backupFile = join(directory, 'twilio-polling-enabled.sqlite');
    await store.backupTo(backupFile);

    await store.update((state) => {
      state.settings.twilioConversationAutoSyncEnabled = false;
    });
    await store.restoreFromBuffer(await readFile(backupFile));

    expect(store.snapshot().settings.twilioConversationAutoSyncEnabled).toBe(false);
    expect(store.snapshot().settings.twilioConversationSyncIntervalMinutes).toBe(30);
  });

  it('persists source-attributed projection rows in SQLite', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-projection-store-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.leagues.push({
        id: 'projection-league',
        platform: 'sleeper',
        name: 'Test League',
        displayName: 'Test League',
        teamCount: 2,
        scoring: {},
        settings: {},
        teams: [],
        connectedAt: '2026-09-01T00:00:00.000Z',
      });
      state.playerProjections.push({
        id: 'projection-1',
        leagueId: 'projection-league',
        sourceId: 'projection-source-1',
        scoringMatched: true,
        playerId: 'player-1',
        playerName: 'Player One',
        position: 'WR',
        projectedPoints: 218.5,
        averageDraftPosition: 16.2,
        sourceName: 'Owner CSV',
        sourceUrl: 'https://example.com/projections',
        importedAt: '2026-09-01T00:00:00.000Z',
      });
    });

    store.close();
    await store.load();

    expect(store.snapshot().playerProjections).toEqual([
      expect.objectContaining({
        sourceId: 'projection-source-1',
        playerId: 'player-1',
        projectedPoints: 218.5,
        averageDraftPosition: 16.2,
        sourceName: 'Owner CSV',
      }),
    ]);
  });

  it('does not restore a custom AI endpoint that could receive provider credentials', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const file = join(directory, 'state.sqlite');
    const store = openStore(file, join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.settings.aiRuntime!.baseUrl = 'https://attacker.example/v1';
    });
    const backupFile = join(directory, 'external.sqlite');
    await store.backupTo(backupFile);
    const backup = await readFile(backupFile);

    await store.update((state) => {
      state.settings.aiRuntime!.baseUrl = 'https://api.openai.com/v1';
    });
    await store.restoreFromBuffer(backup);

    expect(store.snapshot().settings.aiRuntime?.baseUrl).toBe('https://api.openai.com/v1');
  });

  it('rejects a backup with malformed AI runtime settings before replacing live state', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const store = openStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.settings.writingStyle = 'Preserve this';
    });
    const backupFile = join(directory, 'malformed.sqlite');
    await store.backupTo(backupFile);
    const backupDatabase = new Database(backupFile);
    backupDatabase.prepare('UPDATE app_settings SET payload = ? WHERE id = 1').run(
      JSON.stringify({
        aiRuntime: { mode: 'cli', command: 7 },
        allowProfanity: 'yes',
        excludedTopics: 7,
        memoryEnabled: 'off',
        includeMemberContextInChatReplies: 'yes',
      }),
    );
    backupDatabase.close();

    await expect(store.restoreFromBuffer(await readFile(backupFile))).rejects.toThrow(
      'Invalid settings in local state.',
    );
    expect(store.snapshot().settings.writingStyle).toBe('Preserve this');
  });

  it('rejects corrupt backup data without changing the live state', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-store-'));
    const store = openStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
    await store.load();
    await store.update((state) => {
      state.settings.writingStyle = 'Keep this setting';
    });

    await expect(store.restoreFromBuffer(Buffer.from('not a sqlite database'))).rejects.toThrow();
    expect(store.snapshot().settings.writingStyle).toBe('Keep this setting');
    await store.update((state) => {
      state.settings.writingStyle = 'Still writable after rejection';
    });
    expect(store.snapshot().settings.writingStyle).toBe('Still writable after rejection');
  });
});
