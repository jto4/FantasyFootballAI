import Database from 'better-sqlite3';
import type { Database as DatabaseHandle } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
  defaultActionSettings,
  defaultLeagueStaleAfterHours,
  defaultNewsSources,
  isLeagueStaleAfterHours,
  isValidWritingStylePresets,
  normalizeActionSettings,
  normalizeChannelBoundaries,
  normalizeLeagueCalendarEvents,
  normalizeNewsSources,
  type AppSettings,
  type LeagueConnection,
  type MemberMemory,
  type PlayerProjection,
  type SavedReport,
} from '@sidekick/core';
import { blueBubblesMemorySource, pruneBlueBubblesHistory } from './bluebubbles-memory.js';
import {
  pruneTwilioConversationHistory,
  twilioConversationMemorySource,
} from './twilio-conversation-memory.js';
import { pruneConversationImports } from './conversation-import.js';
import { isValidProjectionSourceUrl } from './projections.js';

export interface AppState {
  settings: AppSettings;
  leagues: LeagueConnection[];
  reports: SavedReport[];
  memories: MemberMemory[];
  playerProjections: PlayerProjection[];
  scheduledRuns: ScheduledRun[];
}

export interface ScheduledRun {
  id: string;
  kind: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'succeeded' | 'failed';
  detail?: string;
  leagueResults?: ScheduledLeagueResult[];
  retryOf?: string;
  calendarEventId?: string;
  calendarEventTitle?: string;
}

export interface ScheduledLeagueResult {
  leagueId: string;
  displayName: string;
  status: 'succeeded' | 'failed' | 'skipped';
  detail?: string;
}

/** Remove only original imported text; reviewed member notes remain available to the owner. */
export function purgeExpiredConversationSources(state: AppState, now = Date.now()): number {
  const days = state.settings.conversationRetentionDays;
  if (days !== 30 && days !== 90 && days !== 365) return 0;
  const cutoff = now - days * 24 * 60 * 60 * 1_000;
  let removed = 0;
  for (const profile of state.memories) {
    if (profile.sourceName === twilioConversationMemorySource && profile.sourceText) {
      const pruned = pruneTwilioConversationHistory(profile.sourceText, cutoff);
      if (pruned.removed > 0) {
        profile.sourceText = pruned.sourceText;
        removed += 1;
      }
      continue;
    }
    if (profile.sourceName === blueBubblesMemorySource && profile.sourceText) {
      const pruned = pruneBlueBubblesHistory(profile.sourceText, cutoff);
      if (pruned.removed > 0) {
        profile.sourceText = pruned.sourceText;
        removed += 1;
      }
      continue;
    }
    if (profile.sourceName === 'Resend received email' && profile.sourceText) {
      const entries = profile.sourceText.split(/(?=\[\[resend-email:)/g);
      const retained = entries.filter((entry) => {
        const timestamp = entry.match(/^\[\[resend-email:[^\]]+\]\]\nDate: ([^\n]+)/)?.[1];
        const receivedAt = timestamp ? Date.parse(timestamp) : Number.NaN;
        return !Number.isFinite(receivedAt) || receivedAt >= cutoff;
      });
      if (retained.length < entries.length) {
        profile.sourceText = retained.join('').trim();
        removed += 1;
      }
      continue;
    }
    if (profile.sourceText.includes('[[conversation-import:')) {
      const pruned = pruneConversationImports(profile.sourceText, profile.importedAt, cutoff);
      if (pruned.removed > 0) {
        profile.sourceText = pruned.sourceText;
        removed += 1;
      }
      continue;
    }
    const importedAt = Date.parse(profile.importedAt);
    if (profile.sourceText && Number.isFinite(importedAt) && importedAt < cutoff) {
      profile.sourceText = '';
      removed += 1;
    }
  }
  return removed;
}

const initialState: AppState = {
  settings: {
    actions: structuredClone(defaultActionSettings),
    calendarEvents: [],
    writingStyle: 'Funny, sharp league banter',
    customWritingStylePresets: [],
    reportLength: 'standard',
    leagueStaleAfterHours: defaultLeagueStaleAfterHours,
    allowProfanity: false,
    excludedTopics: '',
    channelBoundaries: {},
    memoryEnabled: true,
    analyzeImportsWithAI: false,
    includeMemberContextInReports: false,
    includeMemberContextInChatReplies: false,
    newsRefreshMinutes: 15,
    newsSources: [...defaultNewsSources],
    nflInjuryReportsEnabled: false,
    scheduledSyncRetries: 0,
    imessageOwnerName: 'League owner',
    imessageAutoSyncEnabled: false,
    imessageSyncIntervalMinutes: 15,
    twilioConversationAutoSyncEnabled: false,
    twilioConversationSyncIntervalMinutes: 15,
    chatRepliesEnabled: false,
    chatRepliesAutoSend: false,
    chatAgentName: 'Sunday Sidekick',
    mcpDeliveryEnabled: false,
    aiRuntime: {
      mode: 'api',
      model: 'gpt-4o-mini',
      command: '',
      args: '',
      baseUrl: 'https://api.openai.com/v1',
      temperature: 0.8,
      maxOutputTokens: 1200,
    },
  },
  leagues: [],
  reports: [],
  memories: [],
  playerProjections: [],
  scheduledRuns: [],
};

const migrations: Array<(database: DatabaseHandle) => void> = [
  (database) => {
    database.exec(`
      CREATE TABLE app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `);
  },
  (database) => {
    database.exec(`
      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE leagues (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT;
      CREATE TABLE reports (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT;
      CREATE TABLE memories (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT;
      CREATE TABLE scheduled_runs (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL CHECK (position >= 0),
        payload TEXT NOT NULL
      ) STRICT;
    `);

    const legacy = database.prepare('SELECT payload FROM app_state WHERE id = 1').get() as
      { payload: string } | undefined;
    if (legacy) {
      const state = JSON.parse(legacy.payload) as Partial<AppState>;
      if (!state.settings || !Array.isArray(state.leagues) || !Array.isArray(state.reports)) {
        throw new Error(
          'The existing state database cannot be migrated because its state is invalid.',
        );
      }
      const insertSettings = database.prepare(
        'INSERT INTO app_settings (id, payload, updated_at) VALUES (1, ?, ?)',
      );
      const now = new Date().toISOString();
      insertSettings.run(JSON.stringify(state.settings), now);
      migrateRows(database, 'leagues', state.leagues);
      migrateRows(database, 'reports', state.reports);
      migrateRows(database, 'memories', Array.isArray(state.memories) ? state.memories : []);
      const runs = Array.isArray(state.scheduledRuns) ? state.scheduledRuns : [];
      const insertRun = database.prepare(
        'INSERT INTO scheduled_runs (id, position, payload) VALUES (?, ?, ?)',
      );
      runs.forEach((run, position) => {
        if (!run || typeof run.id !== 'string')
          throw new Error('Invalid scheduled run in stored state.');
        insertRun.run(run.id, position, JSON.stringify(run));
      });
    }
    database.exec('DROP TABLE app_state');
  },
  (database) => {
    database.exec(`
      CREATE TABLE delivery_claims (
        report_id TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('active', 'failed', 'uncertain', 'sent')),
        updated_at TEXT NOT NULL
      ) STRICT;
    `);
  },
  (database) => {
    database.exec(`
      CREATE TABLE player_projections (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL,
        payload TEXT NOT NULL
      ) STRICT;
      CREATE INDEX player_projections_by_league ON player_projections (league_id);
    `);
  },
];

/**
 * Keep the current state object API while persisting snapshots transactionally in SQLite.
 * Existing JSON state is imported once and left in place as a recoverable migration copy.
 */
export class LocalStore {
  readonly path: string;
  private state: AppState = structuredClone(initialState);
  private transaction: Promise<void> = Promise.resolve();
  private database: DatabaseHandle | undefined;

  constructor(
    path = process.env.SIDEKICK_DATABASE_FILE ?? join(homedir(), '.sidekick', 'state.sqlite'),
    private readonly legacyPath = process.env.SIDEKICK_DATA_FILE ??
      join(homedir(), '.sidekick', 'state.json'),
  ) {
    this.path = path;
  }

  async load(): Promise<void> {
    if (this.database) return;
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await chmod(dirname(this.path), 0o700).catch(() => undefined);
    await this.backupBeforeUpgrade();
    this.database = this.openDatabase(this.path);
    try {
      await chmod(this.path, 0o600).catch(() => undefined);
      const storedState = this.readDatabaseState(this.database);
      if (storedState) {
        this.state = storedState;
        this.recoverInterruptedRuns();
        return;
      }

      let imported = structuredClone(initialState);
      try {
        imported = validateState(JSON.parse(await readFile(this.legacyPath, 'utf8')) as unknown);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      this.persist(imported);
      this.state = imported;
    } catch (error) {
      this.database.close();
      this.database = undefined;
      throw error;
    }
  }

  async backupTo(destination: string): Promise<void> {
    if (!this.database) throw new Error('Local database is not loaded.');
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await chmod(dirname(destination), 0o700).catch(() => undefined);
    await this.database.backup(destination);
    await chmod(destination, 0o600).catch(() => undefined);
  }

  async listSafetyBackups(): Promise<Array<{ name: string; createdAt: string; size: number }>> {
    const directory = join(dirname(this.path), 'backups');
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const backups = await Promise.all(
      names.filter(isSafetyBackupName).map(async (name) => {
        try {
          const details = await lstat(join(directory, name));
          if (!details.isFile() || details.size > 50 * 1024 * 1024) return undefined;
          return { name, createdAt: details.mtime.toISOString(), size: details.size };
        } catch {
          return undefined;
        }
      }),
    );
    return backups
      .filter((backup): backup is NonNullable<typeof backup> => backup !== undefined)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async readSafetyBackup(name: string): Promise<Buffer | undefined> {
    if (!isSafetyBackupName(name)) return undefined;
    const path = join(dirname(this.path), 'backups', name);
    try {
      const details = await lstat(path);
      if (!details.isFile() || details.size > 50 * 1024 * 1024) return undefined;
      return await readFile(path);
    } catch {
      return undefined;
    }
  }

  async deleteSafetyBackup(name: string): Promise<boolean> {
    if (!isSafetyBackupName(name)) return false;
    try {
      await unlink(join(dirname(this.path), 'backups', name));
      return true;
    } catch {
      return false;
    }
  }

  async restoreFromBuffer(
    contents: Buffer,
    afterDatabaseSwap?: () => Promise<void>,
  ): Promise<string> {
    const operation = this.transaction.then(() =>
      this.performRestoreFromBuffer(contents, afterDatabaseSwap),
    );
    this.transaction = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async performRestoreFromBuffer(
    contents: Buffer,
    afterDatabaseSwap?: () => Promise<void>,
  ): Promise<string> {
    if (!this.database) throw new Error('Local database is not loaded.');
    if (contents.length === 0 || contents.length > 50 * 1024 * 1024)
      throw new Error('Backup must be a SQLite file no larger than 50 MB.');

    const incomingPath = `${this.path}.incoming-${randomUUID()}`;
    const previousPath = `${this.path}.previous-${randomUUID()}`;
    const backupDirectory = join(dirname(this.path), 'backups');
    const safetyCopyPath = join(
      backupDirectory,
      `before-restore-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.sqlite`,
    );
    await writeFile(incomingPath, contents, { flag: 'wx', mode: 0o600 });
    let candidate: DatabaseHandle | undefined;

    try {
      candidate = this.openDatabase(incomingPath);
      const integrity = candidate.pragma('integrity_check') as Array<{ integrity_check: string }>;
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok')
        throw new Error('Backup failed SQLite integrity validation.');
      const restoredState = this.readDatabaseState(candidate);
      if (!restoredState) throw new Error('Backup does not contain Sunday Sidekick state.');
      const safeRestoredState = makeRestoredStateSafe(restoredState);
      if (safeRestoredState !== restoredState) {
        candidate
          .prepare('UPDATE app_settings SET payload = ? WHERE id = 1')
          .run(JSON.stringify(safeRestoredState.settings));
      }
      candidate.close();
      candidate = undefined;

      await this.backupTo(safetyCopyPath);
      this.database.close();
      this.database = undefined;
      try {
        await rename(this.path, previousPath);
      } catch (error) {
        this.database = this.openDatabase(this.path);
        throw error;
      }
      try {
        await rename(incomingPath, this.path);
      } catch (error) {
        await rename(previousPath, this.path);
        this.database = this.openDatabase(this.path);
        this.state = this.readDatabaseState(this.database) ?? this.state;
        throw error;
      }

      try {
        this.database = this.openDatabase(this.path);
        const state = this.readDatabaseState(this.database);
        if (!state) throw new Error('Restored database does not contain app state.');
        this.state = state;
        this.recoverInterruptedRuns();
      } catch (error) {
        this.database?.close();
        this.database = undefined;
        await unlink(this.path).catch(() => undefined);
        await unlink(`${this.path}-wal`).catch(() => undefined);
        await unlink(`${this.path}-shm`).catch(() => undefined);
        await rename(previousPath, this.path);
        this.database = this.openDatabase(this.path);
        this.state = this.readDatabaseState(this.database) ?? structuredClone(initialState);
        throw error;
      }

      try {
        await afterDatabaseSwap?.();
      } catch (error) {
        this.database?.close();
        this.database = undefined;
        await unlink(this.path).catch(() => undefined);
        await unlink(`${this.path}-wal`).catch(() => undefined);
        await unlink(`${this.path}-shm`).catch(() => undefined);
        await rename(previousPath, this.path);
        this.database = this.openDatabase(this.path);
        this.state = this.readDatabaseState(this.database) ?? structuredClone(initialState);
        throw error;
      }

      await unlink(previousPath).catch(() => undefined);
      await chmod(this.path, 0o600).catch(() => undefined);
      return safetyCopyPath;
    } finally {
      candidate?.close();
      await unlink(incomingPath).catch(() => undefined);
      await unlink(`${incomingPath}-wal`).catch(() => undefined);
      await unlink(`${incomingPath}-shm`).catch(() => undefined);
    }
  }

  snapshot(): AppState {
    return structuredClone(this.state);
  }

  async update(mutator: (state: AppState) => void): Promise<AppState> {
    let result: AppState | undefined;
    const operation = this.transaction.then(async () => {
      const next = structuredClone(this.state);
      mutator(next);
      this.persist(next);
      this.state = next;
      result = structuredClone(next);
    });
    this.transaction = operation.catch(() => undefined);
    await operation;
    return result!;
  }

  async purgeExpiredConversationSources(): Promise<number> {
    let removed = 0;
    await this.update((state) => {
      removed = purgeExpiredConversationSources(state);
    });
    if (removed > 0) {
      // Secure-delete overwrites freed SQLite content; truncating WAL removes older page images.
      try {
        this.database?.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // Logical deletion has completed; a later checkpoint can reclaim pages after readers exit.
      }
    }
    return removed;
  }

  /** Atomically claim a persisted draft across API processes sharing this database. */
  claimReportDelivery(reportId: string, retryUncertain = false): string | undefined {
    if (!this.database) throw new Error('Local database is not loaded.');
    const token = randomUUID();
    const claim = this.database
      .transaction(() => {
        const row = this.database!.prepare('SELECT payload FROM reports WHERE id = ?').get(
          reportId,
        ) as { payload: string } | undefined;
        if (!row) return undefined;
        const report = JSON.parse(row.payload) as SavedReport;
        if (
          report.status !== 'draft' ||
          report.deliveryState === 'sending' ||
          (report.deliveryState === 'uncertain' && !retryUncertain)
        )
          return undefined;

        const prior = this.database!.prepare(
          'SELECT state FROM delivery_claims WHERE report_id = ?',
        ).get(reportId) as { state: string } | undefined;
        if (
          prior?.state === 'sent' ||
          (prior?.state === 'active' && report.deliveryState !== 'uncertain')
        )
          return undefined;

        this.database!.prepare(
          `
        INSERT INTO delivery_claims (report_id, token, state, updated_at) VALUES (?, ?, 'active', ?)
        ON CONFLICT(report_id) DO UPDATE SET token = excluded.token, state = 'active', updated_at = excluded.updated_at
      `,
        ).run(reportId, token, new Date().toISOString());
        return token;
      })
      .immediate();
    return claim;
  }

  finishReportDeliveryClaim(
    reportId: string,
    token: string,
    state: 'failed' | 'uncertain' | 'sent',
  ): void {
    if (!this.database) throw new Error('Local database is not loaded.');
    this.database
      .prepare(
        "UPDATE delivery_claims SET state = ?, updated_at = ? WHERE report_id = ? AND token = ? AND state = 'active'",
      )
      .run(state, new Date().toISOString(), reportId, token);
  }

  close(): void {
    this.database?.close();
    this.database = undefined;
  }

  private openDatabase(path: string): DatabaseHandle {
    const database = new Database(path, { timeout: 5_000 });
    try {
      database.pragma('journal_mode = WAL');
      database.pragma('synchronous = FULL');
      database.pragma('foreign_keys = ON');
      database.pragma('secure_delete = ON');
      this.applyMigrations(database);
      return database;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  /** Preserve the last committed database before migrations change its schema. */
  private async backupBeforeUpgrade(): Promise<void> {
    let details;
    try {
      details = await stat(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (!details.isFile() || details.size === 0) return;

    const source = new Database(this.path, { readonly: true, fileMustExist: true, timeout: 5_000 });
    try {
      const tableNames = new Set(
        (
          source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
            name: string;
          }>
        ).map(({ name }) => name),
      );
      if (!tableNames.has('app_state') && !tableNames.has('app_settings')) return;

      const version = tableNames.has('schema_migrations')
        ? (
            source
              .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
              .get() as { version: number }
          ).version
        : 0;
      if (version >= migrations.length) return;

      const integrity = source.pragma('integrity_check') as Array<{ integrity_check: string }>;
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok')
        throw new Error(
          'Existing state database failed SQLite integrity validation; migration stopped without changing it.',
        );

      const directory = join(dirname(this.path), 'backups');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700).catch(() => undefined);
      const destination = join(
        directory,
        `before-upgrade-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.sqlite`,
      );
      await source.backup(destination);
      await chmod(destination, 0o600).catch(() => undefined);
      const copy = new Database(destination, { readonly: true, fileMustExist: true });
      try {
        const backupIntegrity = copy.pragma('integrity_check') as Array<{
          integrity_check: string;
        }>;
        if (backupIntegrity.length !== 1 || backupIntegrity[0]?.integrity_check !== 'ok')
          throw new Error(
            'Pre-upgrade database copy failed SQLite integrity validation; migration stopped.',
          );
      } finally {
        copy.close();
      }
    } finally {
      source.close();
    }
  }

  private readDatabaseState(database: DatabaseHandle): AppState | undefined {
    const settingsRow = database.prepare('SELECT payload FROM app_settings WHERE id = 1').get() as
      { payload?: string } | undefined;
    if (settingsRow?.payload === undefined) return undefined;
    const readRows = (
      table: 'leagues' | 'reports' | 'memories' | 'scheduled_runs' | 'player_projections',
    ) => {
      const ordering = table === 'scheduled_runs' ? 'position' : 'rowid';
      return (
        database.prepare(`SELECT payload FROM ${table} ORDER BY ${ordering}`).all() as Array<{
          payload: string;
        }>
      ).map((item) => JSON.parse(item.payload) as unknown);
    };
    return validateState({
      settings: JSON.parse(settingsRow.payload) as unknown,
      leagues: readRows('leagues'),
      reports: readRows('reports'),
      memories: readRows('memories'),
      playerProjections: readRows('player_projections'),
      scheduledRuns: readRows('scheduled_runs'),
    });
  }

  private recoverInterruptedRuns(): void {
    const finishedAt = new Date().toISOString();
    let changed = false;
    for (const run of this.state.scheduledRuns) {
      if (run.status !== 'running') continue;
      run.status = 'failed';
      run.finishedAt = finishedAt;
      run.detail = 'Interrupted when the app last stopped.';
      changed = true;
    }
    for (const report of this.state.reports) {
      if (report.deliveryState !== 'sending') continue;
      report.deliveryState = 'uncertain';
      report.deliveryUpdatedAt = finishedAt;
      const attempt = report.deliveryAttempts?.at(-1);
      if (attempt?.status === 'sending') {
        attempt.status = 'uncertain';
        attempt.finishedAt = finishedAt;
      }
      changed = true;
    }
    if (changed) this.persist(this.state);
  }

  private applyMigrations(database: DatabaseHandle): void {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);
    const getVersion = database.prepare(
      'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
    );
    const insertVersion = database.prepare(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
    );
    for (let index = 0; index < migrations.length; index += 1) {
      const version = index + 1;
      const current = (getVersion.get() as { version: number }).version;
      if (current >= version) continue;
      const migrate = database.transaction(() => {
        migrations[index]!(database);
        insertVersion.run(version, new Date().toISOString());
      });
      migrate();
    }
    const finalVersion = (getVersion.get() as { version: number }).version;
    if (finalVersion > migrations.length)
      throw new Error(`State database version ${finalVersion} is newer than this app supports.`);
  }

  private persist(state: AppState): void {
    if (!this.database) throw new Error('Local database is not loaded.');
    const write = this.database.transaction((next: AppState, updatedAt: string) => {
      const settings = this.database!.prepare(`
        INSERT INTO app_settings (id, payload, updated_at) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
        WHERE payload != excluded.payload
      `);
      settings.run(JSON.stringify(next.settings), updatedAt);
      replaceRows(this.database!, 'leagues', next.leagues);
      replaceRows(this.database!, 'reports', next.reports);
      replaceRows(this.database!, 'memories', next.memories);
      replacePlayerProjectionRows(this.database!, next.playerProjections);
      replaceScheduledRuns(this.database!, next.scheduledRuns);
    });
    write(state, new Date().toISOString());
  }
}

function isSafetyBackupName(name: string): boolean {
  return /^before-(?:restore|upgrade)-[\dTZ.-]+(?:-salvage)?-[a-f\d]{8}\.sqlite$/.test(name);
}

function migrateRows(
  database: DatabaseHandle,
  table: 'leagues' | 'reports' | 'memories',
  rows: unknown[],
): void {
  const insert = database.prepare(`INSERT INTO ${table} (id, payload) VALUES (?, ?)`);
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof (row as { id?: unknown }).id !== 'string')
      throw new Error(`Invalid ${table} item in the state database.`);
    insert.run((row as { id: string }).id, JSON.stringify(row));
  }
}

function replaceRows(
  database: DatabaseHandle,
  table: 'leagues' | 'reports' | 'memories',
  rows: Array<{ id: string }>,
): void {
  const upsert = database.prepare(`
    INSERT INTO ${table} (id, payload) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
    WHERE payload != excluded.payload
  `);
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) throw new Error(`Duplicate ${table} record ID.`);
    ids.add(row.id);
    upsert.run(row.id, JSON.stringify(row));
  }
  deleteRemovedRows(database, table, ids);
}

function replaceScheduledRuns(database: DatabaseHandle, runs: ScheduledRun[]): void {
  const upsert = database.prepare(`
    INSERT INTO scheduled_runs (id, position, payload) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET position = excluded.position, payload = excluded.payload
    WHERE position != excluded.position OR payload != excluded.payload
  `);
  const ids = new Set<string>();
  runs.forEach((run, position) => {
    if (ids.has(run.id)) throw new Error('Duplicate scheduled run ID.');
    ids.add(run.id);
    upsert.run(run.id, position, JSON.stringify(run));
  });
  deleteRemovedRows(database, 'scheduled_runs', ids);
}

function replacePlayerProjectionRows(database: DatabaseHandle, rows: PlayerProjection[]): void {
  const upsert = database.prepare(`
    INSERT INTO player_projections (id, league_id, payload) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET league_id = excluded.league_id, payload = excluded.payload
    WHERE league_id != excluded.league_id OR payload != excluded.payload
  `);
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) throw new Error('Duplicate player projection ID.');
    ids.add(row.id);
    upsert.run(row.id, row.leagueId, JSON.stringify(row));
  }
  deleteRemovedRows(database, 'player_projections', ids);
}

function deleteRemovedRows(
  database: DatabaseHandle,
  table: 'leagues' | 'reports' | 'memories' | 'scheduled_runs' | 'player_projections',
  retainedIds: Set<string>,
): void {
  const existingIds = database.prepare(`SELECT id FROM ${table}`).all() as Array<{ id: string }>;
  const remove = database.prepare(`DELETE FROM ${table} WHERE id = ?`);
  for (const { id } of existingIds) if (!retainedIds.has(id)) remove.run(id);
}

export function validateState(input: unknown): AppState {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid local state file');
  const candidate = input as Partial<AppState>;
  if (
    !candidate.settings ||
    !Array.isArray(candidate.leagues) ||
    !Array.isArray(candidate.reports) ||
    (candidate.playerProjections !== undefined && !Array.isArray(candidate.playerProjections))
  ) {
    throw new Error('Invalid local state structure');
  }
  const rawSettings = candidate.settings as unknown as Record<string, unknown>;
  if (
    !rawSettings ||
    typeof rawSettings !== 'object' ||
    Array.isArray(rawSettings) ||
    (rawSettings.writingStyle !== undefined &&
      (typeof rawSettings.writingStyle !== 'string' || rawSettings.writingStyle.length > 1000)) ||
    (rawSettings.customWritingStylePresets !== undefined &&
      !isValidWritingStylePresets(rawSettings.customWritingStylePresets)) ||
    (rawSettings.reportLength !== undefined &&
      !['short', 'standard', 'long'].includes(String(rawSettings.reportLength))) ||
    (rawSettings.leagueStaleAfterHours !== undefined &&
      !isLeagueStaleAfterHours(rawSettings.leagueStaleAfterHours)) ||
    (rawSettings.allowProfanity !== undefined && typeof rawSettings.allowProfanity !== 'boolean') ||
    (rawSettings.excludedTopics !== undefined &&
      (typeof rawSettings.excludedTopics !== 'string' ||
        rawSettings.excludedTopics.length > 2000)) ||
    (rawSettings.memoryEnabled !== undefined && typeof rawSettings.memoryEnabled !== 'boolean') ||
    (rawSettings.aiRuntime !== undefined && !isValidStoredRuntime(rawSettings.aiRuntime)) ||
    (rawSettings.emailRecipient !== undefined &&
      !isOptionalStoredAddress(rawSettings.emailRecipient)) ||
    (rawSettings.smsRecipient !== undefined &&
      !isOptionalStoredAddress(rawSettings.smsRecipient)) ||
    (rawSettings.imessageChatGuid !== undefined &&
      (typeof rawSettings.imessageChatGuid !== 'string' ||
        rawSettings.imessageChatGuid.length > 500 ||
        (rawSettings.imessageChatGuid !== '' && !rawSettings.imessageChatGuid.trim()) ||
        /[\r\n]/.test(rawSettings.imessageChatGuid))) ||
    (rawSettings.imessageOwnerName !== undefined &&
      (typeof rawSettings.imessageOwnerName !== 'string' ||
        rawSettings.imessageOwnerName.trim().length === 0 ||
        rawSettings.imessageOwnerName.length > 100)) ||
    (rawSettings.imessageSyncCursor !== undefined &&
      !isValidBlueBubblesCursor(rawSettings.imessageSyncCursor)) ||
    (rawSettings.twilioConversationSyncCursor !== undefined &&
      !isValidTwilioConversationCursor(rawSettings.twilioConversationSyncCursor)) ||
    (rawSettings.twilioConversationAutoSyncEnabled !== undefined &&
      typeof rawSettings.twilioConversationAutoSyncEnabled !== 'boolean') ||
    (rawSettings.twilioConversationSyncIntervalMinutes !== undefined &&
      !isBlueBubblesSyncInterval(rawSettings.twilioConversationSyncIntervalMinutes)) ||
    (rawSettings.mcpDeliveryEnabled !== undefined &&
      typeof rawSettings.mcpDeliveryEnabled !== 'boolean') ||
    (rawSettings.analyzeImportsWithAI !== undefined &&
      typeof rawSettings.analyzeImportsWithAI !== 'boolean') ||
    (rawSettings.includeMemberContextInReports !== undefined &&
      typeof rawSettings.includeMemberContextInReports !== 'boolean') ||
    (rawSettings.includeMemberContextInChatReplies !== undefined &&
      typeof rawSettings.includeMemberContextInChatReplies !== 'boolean') ||
    (rawSettings.conversationRetentionDays !== undefined &&
      rawSettings.conversationRetentionDays !== 30 &&
      rawSettings.conversationRetentionDays !== 90 &&
      rawSettings.conversationRetentionDays !== 365) ||
    (rawSettings.newsRefreshMinutes !== undefined &&
      (typeof rawSettings.newsRefreshMinutes !== 'number' ||
        !Number.isInteger(rawSettings.newsRefreshMinutes) ||
        rawSettings.newsRefreshMinutes < 5 ||
        rawSettings.newsRefreshMinutes > 1440)) ||
    (rawSettings.scheduledSyncRetries !== undefined &&
      (typeof rawSettings.scheduledSyncRetries !== 'number' ||
        !Number.isInteger(rawSettings.scheduledSyncRetries) ||
        rawSettings.scheduledSyncRetries < 0 ||
        rawSettings.scheduledSyncRetries > 3)) ||
    (rawSettings.newsSources !== undefined &&
      (!Array.isArray(rawSettings.newsSources) ||
        !rawSettings.newsSources.every(
          (source) => source === 'espn' || source === 'pff' || source === 'fox',
        ))) ||
    (rawSettings.nflInjuryReportsEnabled !== undefined &&
      typeof rawSettings.nflInjuryReportsEnabled !== 'boolean')
  ) {
    throw new Error('Invalid settings in local state.');
  }
  if (
    candidate.reports.some((report) => {
      if (!report || typeof report !== 'object' || Array.isArray(report)) return true;
      const state = report.deliveryState;
      const updatedAt = report.deliveryUpdatedAt;
      const attempts = report.deliveryAttempts;
      const usage = report.aiUsage;
      const citations = report.citations;
      return (
        (usage !== undefined && !isValidAIUsageSummary(usage)) ||
        (citations !== undefined &&
          (!Array.isArray(citations) ||
            citations.length > 20 ||
            citations.some(
              (citation) =>
                !citation ||
                typeof citation !== 'object' ||
                typeof citation.title !== 'string' ||
                citation.title.length > 500 ||
                /[\u0000-\u001f\u007f]/.test(citation.title) ||
                !isSafeCitationUrl(citation.url),
            ))) ||
        (state !== undefined && !['sending', 'failed', 'uncertain'].includes(String(state))) ||
        (updatedAt !== undefined && typeof updatedAt !== 'string') ||
        (attempts !== undefined &&
          (!Array.isArray(attempts) ||
            attempts.length > 50 ||
            attempts.some(
              (attempt) =>
                !attempt ||
                typeof attempt !== 'object' ||
                !['email', 'sms', 'imessage'].includes(String(attempt.channel)) ||
                !['sending', 'sent', 'failed', 'uncertain'].includes(String(attempt.status)) ||
                typeof attempt.startedAt !== 'string' ||
                (attempt.finishedAt !== undefined && typeof attempt.finishedAt !== 'string') ||
                (attempt.providerMessageId !== undefined &&
                  (typeof attempt.providerMessageId !== 'string' ||
                    attempt.providerMessageId.length > 300)) ||
                (attempt.idempotencyKey !== undefined &&
                  (typeof attempt.idempotencyKey !== 'string' ||
                    attempt.idempotencyKey.length > 256)),
            )))
      );
    })
  ) {
    throw new Error('Invalid report delivery state in local data.');
  }
  const playerProjections = candidate.playerProjections ?? [];
  const leagueIds = new Set(candidate.leagues.map((league) => league.id));
  if (
    playerProjections.length > 50_000 ||
    playerProjections.some((projection) => !isValidPlayerProjection(projection, leagueIds)) ||
    new Set(playerProjections.map((projection) => projection.id)).size !== playerProjections.length
  )
    throw new Error('Invalid player projections in local state.');
  return {
    settings: {
      ...initialState.settings,
      ...rawSettings,
      reportLength:
        rawSettings.reportLength === 'short' || rawSettings.reportLength === 'long'
          ? rawSettings.reportLength
          : 'standard',
      leagueStaleAfterHours: isLeagueStaleAfterHours(rawSettings.leagueStaleAfterHours)
        ? rawSettings.leagueStaleAfterHours
        : defaultLeagueStaleAfterHours,
      actions: normalizeActionSettings(rawSettings.actions),
      calendarEvents: normalizeLeagueCalendarEvents(rawSettings.calendarEvents, leagueIds),
      channelBoundaries: normalizeChannelBoundaries(rawSettings.channelBoundaries),
      newsSources: normalizeNewsSources(rawSettings.newsSources),
      nflInjuryReportsEnabled: rawSettings.nflInjuryReportsEnabled === true,
      includeMemberContextInChatReplies: rawSettings.includeMemberContextInChatReplies === true,
      scheduledSyncRetries:
        rawSettings.scheduledSyncRetries === 1 ||
        rawSettings.scheduledSyncRetries === 2 ||
        rawSettings.scheduledSyncRetries === 3
          ? rawSettings.scheduledSyncRetries
          : 0,
      imessageOwnerName:
        typeof rawSettings.imessageOwnerName === 'string' && rawSettings.imessageOwnerName.trim()
          ? rawSettings.imessageOwnerName.trim()
          : 'League owner',
      imessageAutoSyncEnabled: rawSettings.imessageAutoSyncEnabled === true,
      imessageSyncIntervalMinutes: isBlueBubblesSyncInterval(
        rawSettings.imessageSyncIntervalMinutes,
      )
        ? rawSettings.imessageSyncIntervalMinutes
        : 15,
      twilioConversationAutoSyncEnabled: rawSettings.twilioConversationAutoSyncEnabled === true,
      twilioConversationSyncIntervalMinutes: isBlueBubblesSyncInterval(
        rawSettings.twilioConversationSyncIntervalMinutes,
      )
        ? rawSettings.twilioConversationSyncIntervalMinutes
        : 15,
      chatRepliesEnabled: rawSettings.chatRepliesEnabled === true,
      chatRepliesAutoSend: rawSettings.chatRepliesAutoSend === true,
      chatAgentName:
        typeof rawSettings.chatAgentName === 'string' &&
        rawSettings.chatAgentName.trim() &&
        rawSettings.chatAgentName.length <= 60
          ? rawSettings.chatAgentName.trim()
          : 'Sunday Sidekick',
      ...(typeof rawSettings.chatReplyLeagueId === 'string' &&
      leagueIds.has(rawSettings.chatReplyLeagueId)
        ? { chatReplyLeagueId: rawSettings.chatReplyLeagueId }
        : {}),
      mcpDeliveryEnabled: rawSettings.mcpDeliveryEnabled === true,
    } as AppSettings,
    leagues: candidate.leagues,
    reports: candidate.reports.map((report) => ({ ...report, citations: report.citations ?? [] })),
    memories: Array.isArray(candidate.memories) ? candidate.memories : [],
    playerProjections,
    scheduledRuns: Array.isArray(candidate.scheduledRuns) ? candidate.scheduledRuns : [],
  };
}

function isSafeCitationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isValidAIUsageSummary(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const usage = value as Record<string, unknown>;
  const validRate = (rate: unknown) =>
    rate === undefined ||
    (typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 1_000);
  const hasBothRates =
    typeof usage.inputUsdPerMillionTokens === 'number' &&
    typeof usage.outputUsdPerMillionTokens === 'number';
  return (
    typeof usage.model === 'string' &&
    usage.model.length > 0 &&
    usage.model.length <= 120 &&
    Number.isInteger(usage.inputTokens) &&
    Number(usage.inputTokens) >= 0 &&
    Number(usage.inputTokens) <= 10_000_000 &&
    Number.isInteger(usage.outputTokens) &&
    Number(usage.outputTokens) >= 0 &&
    Number(usage.outputTokens) <= 10_000_000 &&
    validRate(usage.inputUsdPerMillionTokens) &&
    validRate(usage.outputUsdPerMillionTokens) &&
    (usage.estimatedCostUsd === undefined ||
      (hasBothRates &&
        typeof usage.estimatedCostUsd === 'number' &&
        Number.isFinite(usage.estimatedCostUsd) &&
        usage.estimatedCostUsd >= 0 &&
        usage.estimatedCostUsd <= 20_000))
  );
}

function isValidPlayerProjection(
  value: unknown,
  leagueIds: Set<string>,
): value is PlayerProjection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const projection = value as Record<string, unknown>;
  return (
    typeof projection.id === 'string' &&
    projection.id.length > 0 &&
    projection.id.length <= 100 &&
    typeof projection.leagueId === 'string' &&
    leagueIds.has(projection.leagueId) &&
    (projection.sourceId === undefined ||
      (typeof projection.sourceId === 'string' &&
        projection.sourceId.length > 0 &&
        projection.sourceId.length <= 100)) &&
    (projection.scoringMatched === undefined || typeof projection.scoringMatched === 'boolean') &&
    typeof projection.playerName === 'string' &&
    projection.playerName.trim().length > 0 &&
    projection.playerName.length <= 120 &&
    !/[\u0000-\u001f\u007f]/.test(projection.playerName) &&
    (projection.playerId === undefined ||
      (typeof projection.playerId === 'string' &&
        projection.playerId.length > 0 &&
        projection.playerId.length <= 100)) &&
    (projection.position === undefined ||
      (typeof projection.position === 'string' &&
        projection.position.length <= 20 &&
        !/[\r\n]/.test(projection.position))) &&
    (projection.nflTeam === undefined ||
      (typeof projection.nflTeam === 'string' &&
        projection.nflTeam.length <= 10 &&
        !/[\r\n]/.test(projection.nflTeam))) &&
    typeof projection.projectedPoints === 'number' &&
    Number.isFinite(projection.projectedPoints) &&
    projection.projectedPoints >= 0 &&
    projection.projectedPoints <= 3000 &&
    (projection.averageDraftPosition === undefined ||
      (typeof projection.averageDraftPosition === 'number' &&
        Number.isFinite(projection.averageDraftPosition) &&
        projection.averageDraftPosition >= 1 &&
        projection.averageDraftPosition <= 600)) &&
    (projection.week === undefined ||
      (typeof projection.week === 'number' &&
        Number.isInteger(projection.week) &&
        projection.week >= 1 &&
        projection.week <= 30)) &&
    typeof projection.sourceName === 'string' &&
    projection.sourceName.trim().length > 0 &&
    projection.sourceName.length <= 100 &&
    !/[\u0000-\u001f\u007f]/.test(projection.sourceName) &&
    (projection.sourceUrl === undefined || isValidProjectionSourceUrl(projection.sourceUrl)) &&
    typeof projection.importedAt === 'string' &&
    Number.isFinite(Date.parse(projection.importedAt))
  );
}

function isValidBlueBubblesCursor(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cursor = value as Record<string, unknown>;
  return (
    typeof cursor.chatGuid === 'string' &&
    cursor.chatGuid.length > 0 &&
    cursor.chatGuid.length <= 500 &&
    typeof cursor.dateCreated === 'number' &&
    Number.isFinite(cursor.dateCreated) &&
    Array.isArray(cursor.messageGuids) &&
    cursor.messageGuids.length <= 200 &&
    cursor.messageGuids.every((guid) => typeof guid === 'string' && guid.length <= 300)
  );
}

function isValidTwilioConversationCursor(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cursor = value as Record<string, unknown>;
  return (
    typeof cursor.conversationSid === 'string' &&
    /^CH[0-9a-fA-F]{32}$/.test(cursor.conversationSid) &&
    typeof cursor.page === 'number' &&
    Number.isInteger(cursor.page) &&
    cursor.page >= 0 &&
    cursor.page <= 1_000_000 &&
    typeof cursor.lastIndex === 'number' &&
    Number.isInteger(cursor.lastIndex) &&
    cursor.lastIndex >= -1 &&
    cursor.lastIndex <= 2_147_483_647 &&
    (cursor.initialized === undefined || typeof cursor.initialized === 'boolean')
  );
}

function isBlueBubblesSyncInterval(value: unknown): value is 5 | 15 | 30 | 60 {
  return value === 5 || value === 15 || value === 30 || value === 60;
}

/** Backups can be untrusted, so imported automation, executables, and credential destinations need reapproval. */
function makeRestoredStateSafe(state: AppState): AppState {
  const defaultRuntime = initialState.settings.aiRuntime!;
  const requiresRuntimeReview =
    state.settings.aiRuntime?.mode === 'cli' ||
    state.settings.aiRuntime?.mode === 'apple-cli' ||
    state.settings.aiRuntime?.baseUrl !== defaultRuntime.baseUrl;
  const hasAutomaticActions = state.settings.actions.some((action) => action.mode === 'automatic');
  const hasAutoSync =
    state.settings.imessageAutoSyncEnabled === true ||
    state.settings.twilioConversationAutoSyncEnabled === true;
  const hasMcpDelivery = state.settings.mcpDeliveryEnabled === true;
  const hasChatReplies =
    state.settings.chatRepliesEnabled === true || state.settings.chatRepliesAutoSend === true;
  if (
    !requiresRuntimeReview &&
    !hasAutomaticActions &&
    !hasAutoSync &&
    !hasMcpDelivery &&
    !hasChatReplies
  )
    return state;

  return {
    ...state,
    settings: {
      ...state.settings,
      ...(requiresRuntimeReview ? { aiRuntime: structuredClone(defaultRuntime) } : {}),
      imessageAutoSyncEnabled: false,
      twilioConversationAutoSyncEnabled: false,
      mcpDeliveryEnabled: false,
      chatRepliesEnabled: false,
      chatRepliesAutoSend: false,
      ...(requiresRuntimeReview || hasAutomaticActions
        ? {
            actions: state.settings.actions.map((action) => ({
              ...action,
              mode: 'draft' as const,
              schedule: { ...action.schedule, enabled: false },
            })),
          }
        : {}),
    },
  };
}

function isValidStoredRuntime(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const runtime = value as Record<string, unknown>;
  return (
    (runtime.mode === 'api' || runtime.mode === 'cli' || runtime.mode === 'apple-cli') &&
    typeof runtime.model === 'string' &&
    runtime.model.length <= 120 &&
    typeof runtime.command === 'string' &&
    runtime.command.length <= 300 &&
    typeof runtime.args === 'string' &&
    runtime.args.length <= 1000 &&
    typeof runtime.baseUrl === 'string' &&
    runtime.baseUrl.length <= 500 &&
    /^https:\/\//.test(runtime.baseUrl) &&
    (runtime.temperature === undefined ||
      (typeof runtime.temperature === 'number' &&
        Number.isFinite(runtime.temperature) &&
        runtime.temperature >= 0 &&
        runtime.temperature <= 2)) &&
    (runtime.maxOutputTokens === undefined ||
      (typeof runtime.maxOutputTokens === 'number' &&
        Number.isInteger(runtime.maxOutputTokens) &&
        runtime.maxOutputTokens >= 128 &&
        runtime.maxOutputTokens <= 16_384)) &&
    (runtime.inputUsdPerMillionTokens === undefined ||
      (typeof runtime.inputUsdPerMillionTokens === 'number' &&
        Number.isFinite(runtime.inputUsdPerMillionTokens) &&
        runtime.inputUsdPerMillionTokens >= 0 &&
        runtime.inputUsdPerMillionTokens <= 1_000)) &&
    (runtime.outputUsdPerMillionTokens === undefined ||
      (typeof runtime.outputUsdPerMillionTokens === 'number' &&
        Number.isFinite(runtime.outputUsdPerMillionTokens) &&
        runtime.outputUsdPerMillionTokens >= 0 &&
        runtime.outputUsdPerMillionTokens <= 1_000))
  );
}

function isOptionalStoredAddress(value: unknown): boolean {
  return value === '' || (typeof value === 'string' && value.length < 320 && !/[\r\n]/.test(value));
}
