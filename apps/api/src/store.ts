import {
  reportSummary,
  type ReportSummary,
  type ReportPage,
  settingsSectionFields,
  settingsSectionPatch,
  type GenerationJob,
  type SettingsSection,
} from '@sidekick/core';
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
import { type AppSettings, type SavedReport } from '@sidekick/core';
import type { AppState, DashboardStateSnapshot } from './store-types.js';
export * from './store-types.js';
import { initialState } from './store-defaults.js';
import { purgeExpiredConversationSources } from './store-retention.js';
export { purgeExpiredConversationSources } from './store-retention.js';
import { validateState, makeRestoredStateSafe } from './store-validation.js';
export { validateState } from './store-validation.js';
import {
  migrations,
  replaceRows,
  replaceMemoryRows,
  replacePlayerProjectionRows,
  replaceScheduledRuns,
  isSafetyBackupName,
} from './store-database.js';

function cloneAppState(state: AppState): AppState {
  const { memories, ...stateWithoutMemories } = state;
  return {
    ...structuredClone(stateWithoutMemories),
    memories: memories.map((profile) => {
      const { sourceText, ...metadata } = profile;
      return { ...structuredClone(metadata), sourceText };
    }),
  };
}

/**
 * Keep the current state object API while persisting snapshots transactionally in SQLite.
 * Existing JSON state is imported once and left in place as a recoverable migration copy.
 */
export class SettingsRevisionConflict extends Error {}

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
    return cloneAppState(this.state);
  }

  settingsSnapshot(): AppState['settings'] {
    return structuredClone(this.state.settings);
  }

  /** Avoid cloning private imported text when the dashboard only needs profile summaries. */
  dashboardSnapshot(): DashboardStateSnapshot {
    const { memories, playerProjections: _projections, ...dashboardState } = this.state;
    void _projections;
    return {
      ...structuredClone(dashboardState),
      memories: memories.map(({ sourceText, sourceAuthorId, ...profile }) => ({
        ...structuredClone(profile),
        canMergeImportedConversation: !sourceAuthorId,
        sourceLength: sourceText.length,
      })),
    };
  }

  dashboardSummarySnapshot(): Omit<DashboardStateSnapshot, 'reports'> & {
    reports: ReportSummary[];
    reportCounts: Record<string, { drafts: number; issues: number }>;
    generationJobs: GenerationJob[];
  } {
    const {
      reports,
      memories,
      playerProjections: _projections,
      generationJobs,
      ...state
    } = this.state;
    void _projections;
    const reportCounts = Object.create(null) as Record<string, { drafts: number; issues: number }>;
    for (const report of reports) {
      const count = (reportCounts[report.leagueId] ??= { drafts: 0, issues: 0 });
      if (report.status === 'draft' && !report.deliveryState) count.drafts++;
      if (report.deliveryState === 'failed' || report.deliveryState === 'uncertain') count.issues++;
    }
    return {
      ...structuredClone(state),
      reports: reports.slice(0, 50).map(reportSummary),
      reportCounts,
      generationJobs: structuredClone((generationJobs ?? []).slice(-50).reverse()),
      memories: memories.map(({ sourceText, sourceAuthorId, ...profile }) => ({
        ...structuredClone(profile),
        sourceLength: sourceText.length,
        canMergeImportedConversation: !sourceAuthorId,
      })),
    };
  }

  generationJobByRequest(requestId: string): GenerationJob | undefined {
    const job = this.state.generationJobs?.find((item) => item.requestId === requestId);
    return job ? structuredClone(job) : undefined;
  }

  reportById(id: string): SavedReport | undefined {
    const report = this.state.reports.find((item) => item.id === id);
    return report ? structuredClone(report) : undefined;
  }

  reportsPage(leagueId?: string, status?: string, cursor?: string, limit = 20): ReportPage {
    const rows = this.state.reports.filter(
      (item) =>
        (!leagueId || item.leagueId === leagueId) &&
        (!status ||
          (status === 'draft'
            ? item.status === 'draft' && !item.deliveryState
            : status === 'sent'
              ? item.status === 'sent'
              : item.deliveryState === status)),
    );
    const sorted = [...rows].sort((a, b) => {
      const left = `${a.createdAt}|${a.id}`,
        right = `${b.createdAt}|${b.id}`;
      return left < right ? 1 : left > right ? -1 : 0;
    });
    const after = cursor
      ? sorted.filter((item) => `${item.createdAt}|${item.id}` < cursor)
      : sorted;
    const items = after.slice(0, limit).map(reportSummary);
    const last = items.at(-1);
    return {
      items,
      total: rows.length,
      ...(after.length > limit && last ? { nextCursor: `${last.createdAt}|${last.id}` } : {}),
    };
  }

  /** Report generation reads profile notes, never the original imported conversation text. */
  reportSnapshot(): AppState {
    const { memories, ...state } = this.state;
    return {
      ...structuredClone(state),
      memories: memories.map((profile) => {
        const { sourceText: _sourceText, ...reportProfile } = profile;
        void _sourceText;
        return { ...structuredClone(reportProfile), sourceText: '' };
      }),
    };
  }

  async update(
    mutator: (state: AppState) => void,
    expected?: { section: SettingsSection; revision: number },
  ): Promise<void> {
    const operation = this.transaction.then(async () => {
      if (!this.database) throw new Error('Local database is not loaded.');
      this.database
        .transaction(() => {
          const stored = this.database!.prepare(
            'SELECT payload FROM app_settings WHERE id = 1',
          ).get() as { payload: string };
          const settings = JSON.parse(stored.payload) as AppSettings;
          if (
            expected &&
            (settings.sectionRevisions?.[expected.section] ?? 0) !== expected.revision
          )
            throw new SettingsRevisionConflict();
          const previous = { ...this.state, settings };
          const next = cloneAppState(previous);
          mutator(next);
          const revisions = { ...settings.sectionRevisions };
          for (const section of Object.keys(settingsSectionFields) as SettingsSection[]) {
            if (
              JSON.stringify(settingsSectionPatch(settings, section)) !==
              JSON.stringify(settingsSectionPatch(next.settings, section))
            )
              revisions[section] = (revisions[section] ?? 0) + 1;
          }
          next.settings.sectionRevisions = revisions;
          this.persist(next, previous);
          this.state = next;
        })
        .immediate();
    });
    this.transaction = operation.catch(() => undefined);
    await operation;
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

  /** Editing and sending take the same SQLite write lock, including across API processes. */
  async editReportDraft(
    id: string,
    title: string,
    body: string,
    revision: number,
  ): Promise<{ status: 404 | 409 } | { status: 200; report: SavedReport }> {
    const operation = this.transaction.then(() => {
      if (!this.database) throw new Error('Local database is not loaded.');
      const result = this.database
        .transaction(() => {
          const row = this.database!.prepare('SELECT payload FROM reports WHERE id = ?').get(id) as
            { payload: string } | undefined;
          if (!row) return { status: 404 as const };
          const report = JSON.parse(row.payload) as SavedReport;
          const claim = this.database!.prepare(
            'SELECT state FROM delivery_claims WHERE report_id = ?',
          ).get(id);
          if (
            report.status !== 'draft' ||
            report.deliveryState ||
            report.deliveryAttempts?.length ||
            claim ||
            (report.revision ?? 0) !== revision
          )
            return { status: 409 as const };
          const edited: SavedReport = {
            ...report,
            title,
            body,
            revision: revision + 1,
            editedAt: new Date().toISOString(),
          };
          this.database!.prepare('UPDATE reports SET payload = ? WHERE id = ?').run(
            JSON.stringify(edited),
            id,
          );
          return { status: 200 as const, report: edited };
        })
        .immediate();
      if (result.status === 200)
        this.state.reports = this.state.reports.map((report) =>
          report.id === id ? result.report : report,
        );
      return result;
    });
    this.transaction = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  /** Atomically claim a persisted draft across API processes sharing this database. */
  claimReportDelivery(
    reportId: string,
    retryUncertain = false,
    revision?: number,
  ): string | undefined {
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
          (revision !== undefined && (report.revision ?? 0) !== revision) ||
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
      table:
        | 'leagues'
        | 'reports'
        | 'memories'
        | 'scheduled_runs'
        | 'player_projections'
        | 'generation_jobs',
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
      generationJobs: readRows('generation_jobs'),
    });
  }

  private recoverInterruptedRuns(): void {
    const finishedAt = new Date().toISOString();
    let changed = false;
    for (const run of this.state.scheduledRuns) {
      if (run.status !== 'running') continue;
      run.status = 'failed';
      run.finishedAt = finishedAt;
      run.detail = run.calendarEventId
        ? 'Calendar event was interrupted before completion; retry failed leagues as drafts after review.'
        : 'Interrupted when the app last stopped.';
      changed = true;
    }
    for (const job of this.state.generationJobs ?? []) {
      if (job.status !== 'running' && job.status !== 'queued') continue;
      job.status = 'interrupted';
      job.finishedAt = finishedAt;
      job.error = 'Generation was interrupted. Review saved reports before starting a new request.';
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

  private persist(state: AppState, previous?: AppState): void {
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
      replaceRows(this.database!, 'generation_jobs', next.generationJobs ?? []);
      replaceMemoryRows(this.database!, next.memories, previous?.memories);
      replacePlayerProjectionRows(this.database!, next.playerProjections);
      replaceScheduledRuns(this.database!, next.scheduledRuns);
    });
    write(state, new Date().toISOString());
  }
}
