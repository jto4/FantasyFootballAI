import { chmod, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  decryptPortableBackup,
  encryptPortableBackup,
  parsePortableBackup,
  validateBackupPassphrase,
} from './backup-archive.js';
import { logEvent } from './logger.js';
import type { LocalStore } from './store.js';

export type BackupSchedule = {
  enabled: boolean;
  intervalHours: 24 | 168;
  retainCount: 3 | 7 | 14;
  revision: number;
};
type BackupRecord = { name: string; createdAt: string; size: number };
type BackupState = {
  schedule: BackupSchedule;
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  lastErrorCode?: 'credential_store' | 'backup_failed';
};
const defaults: BackupSchedule = { enabled: false, intervalHours: 24, retainCount: 7, revision: 0 };
const backupName = /^routine-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d{3}Z-[0-9a-f-]{36}\.ssb$/;
export function isBackupSchedule(value: unknown): value is BackupSchedule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    Object.keys(item).every((key) =>
      ['enabled', 'intervalHours', 'retainCount', 'revision'].includes(key),
    ) &&
    typeof item.enabled === 'boolean' &&
    [24, 168].includes(Number(item.intervalHours)) &&
    typeof item.intervalHours === 'number' &&
    [3, 7, 14].includes(Number(item.retainCount)) &&
    typeof item.retainCount === 'number' &&
    Number.isSafeInteger(item.revision) &&
    Number(item.revision) >= 0
  );
}
export class BackupRevisionConflict extends Error {}

/** Routine copies are machine-local. Their key is stored only in the OS credential store. */
export class RoutineBackups {
  private readonly directory: string;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  private serial: Promise<unknown> = Promise.resolve();
  private busy = false;
  constructor(
    private readonly dependencies: {
      store: LocalStore;
      currentBackup: () => Promise<Buffer>;
      readPassphrase: () => Promise<string | null>;
      savePassphrase: (value: string) => Promise<void>;
      removePassphrase: () => Promise<void>;
      now?: () => Date;
    },
  ) {
    this.directory = join(dirname(dependencies.store.path), 'routine-backups');
  }
  private now() {
    return this.dependencies.now?.() ?? new Date();
  }
  private async readState(): Promise<BackupState> {
    try {
      const path = join(this.directory, 'schedule.json');
      const details = await lstat(path);
      if (!details.isFile() || details.size > 4096) throw new Error('Invalid backup schedule.');
      const state: BackupState = JSON.parse(await readFile(path, 'utf8'));
      if (
        !state ||
        typeof state !== 'object' ||
        Object.keys(state).some(
          (key) => !['schedule', 'lastAttemptAt', 'lastSuccessAt', 'lastErrorCode'].includes(key),
        ) ||
        !isBackupSchedule(state.schedule) ||
        [state.lastAttemptAt, state.lastSuccessAt].some(
          (date) =>
            date !== undefined && (typeof date !== 'string' || !Number.isFinite(Date.parse(date))),
        ) ||
        (state.lastErrorCode !== undefined &&
          !['credential_store', 'backup_failed'].includes(state.lastErrorCode))
      )
        throw new Error('Invalid backup schedule.');
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schedule: { ...defaults } };
      throw error;
    }
  }
  private async writeState(state: BackupState) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const temporary = join(this.directory, `.schedule-${randomUUID()}`);
    try {
      await writeFile(temporary, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
      await rename(temporary, join(this.directory, 'schedule.json'));
    } finally {
      await rm(temporary, { force: true });
    }
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.serial.then(operation);
    this.serial = next.catch(() => undefined);
    return next;
  }
  async files(): Promise<BackupRecord[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const files = await Promise.all(
      names
        .filter((name) => backupName.test(name))
        .map(async (name) => {
          const details = await lstat(join(this.directory, name));
          return details.isFile() && details.size <= 201 * 1024 * 1024
            ? { name, createdAt: details.mtime.toISOString(), size: details.size }
            : undefined;
        }),
    );
    // Filenames hold the capture time; mtime can change when the data folder is moved.
    return files
      .filter((file): file is BackupRecord => Boolean(file))
      .sort((a, b) => b.name.localeCompare(a.name));
  }
  async storageSizes() {
    const size = async (path: string) => {
      try {
        const value = await lstat(path);
        return value.isFile() ? value.size : 0;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        throw error;
      }
    };
    const databaseBytes =
      (await size(this.dependencies.store.path)) +
      (await size(`${this.dependencies.store.path}-wal`));
    let imageBytes = 0;
    try {
      const folder = join(dirname(this.dependencies.store.path), 'images');
      for (const name of await readdir(folder)) imageBytes += await size(join(folder, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return {
      databaseBytes,
      imageBytes,
      warnings: [
        ...(databaseBytes >= 40 * 1024 * 1024 ? ['database_near_backup_limit'] : []),
        ...(databaseBytes + imageBytes >= 180 * 1024 * 1024 ? ['archive_near_backup_limit'] : []),
      ],
    };
  }
  async status() {
    return {
      ...(await this.readState()),
      busy: this.busy,
      files: await this.files(),
      storage: await this.storageSizes(),
    };
  }
  async configure(schedule: BackupSchedule, passphrase?: string) {
    return this.serialize(async () => {
      if (!isBackupSchedule(schedule)) throw new Error('Invalid backup schedule.');
      const state = await this.readState();
      if (schedule.revision !== state.schedule.revision) throw new BackupRevisionConflict();
      let previous: string | null = null;
      if (schedule.enabled || passphrase !== undefined) {
        previous = await this.dependencies.readPassphrase();
        validateBackupPassphrase(passphrase ?? previous ?? '');
        const latest = (await this.files())[0];
        if (latest)
          await decryptPortableBackup((await this.read(latest.name))!, passphrase ?? previous!);
        if (passphrase && previous && passphrase !== previous && (await this.files()).length)
          throw new Error(
            'Existing routine copies use the saved passphrase. Keep that passphrase to enable their schedule.',
          );
      }
      if (passphrase !== undefined) await this.dependencies.savePassphrase(passphrase);
      try {
        await this.writeState({
          ...state,
          schedule: { ...schedule, revision: schedule.revision + 1 },
        });
      } catch (error) {
        if (passphrase !== undefined) {
          if (previous) await this.dependencies.savePassphrase(previous);
          else await this.dependencies.removePassphrase();
        }
        throw error;
      }
      return this.status();
    });
  }
  async disableAfterRestore() {
    return this.serialize(async () => {
      const state = await this.readState();
      await this.writeState({
        ...state,
        schedule: { ...state.schedule, enabled: false, revision: state.schedule.revision + 1 },
      });
    });
  }
  async run(force = false) {
    return this.serialize(async () => {
      let state = await this.readState();
      if (this.stopped || !state.schedule.enabled) return;
      const now = this.now();
      if (
        !force &&
        ((state.lastSuccessAt &&
          now.getTime() - Date.parse(state.lastSuccessAt) <
            state.schedule.intervalHours * 3600000) ||
          (state.lastErrorCode &&
            state.lastAttemptAt &&
            now.getTime() - Date.parse(state.lastAttemptAt) < 3600000))
      )
        return;
      this.busy = true;
      let credentialPhase = true;
      let temporary: string | undefined;
      try {
        const passphrase = await this.dependencies.readPassphrase();
        validateBackupPassphrase(passphrase ?? '');
        credentialPhase = false;
        const encrypted = await encryptPortableBackup(
          await this.dependencies.currentBackup(),
          passphrase!,
        );
        const contents = parsePortableBackup(await decryptPortableBackup(encrypted, passphrase!));
        await this.dependencies.store.validateBackupBuffer(contents.database);
        if (this.stopped) return;
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        await chmod(this.directory, 0o700);
        const name = `routine-${now.toISOString().replaceAll(':', '-')}-${randomUUID()}.ssb`;
        temporary = join(this.directory, `.pending-${randomUUID()}`);
        await writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600 });
        await rename(temporary, join(this.directory, name));
        temporary = undefined;
        state = {
          schedule: state.schedule,
          lastSuccessAt: now.toISOString(),
          lastAttemptAt: now.toISOString(),
        };
        await this.writeState(state);
        // Rotate only after a new encrypted, validated copy and its success record exist.
        for (const file of (await this.files())
          .filter((file) => file.name !== name)
          .slice(state.schedule.retainCount - 1))
          await rm(join(this.directory, file.name));
        logEvent('info', 'backup.completed', { component: 'backup', count: encrypted.length });
      } catch {
        await this.writeState({
          ...state,
          lastAttemptAt: now.toISOString(),
          lastErrorCode: credentialPhase ? 'credential_store' : 'backup_failed',
        });
        logEvent('warn', 'backup.failed', {
          component: 'backup',
          reason: credentialPhase ? 'credential_store' : 'backup_failed',
        });
      } finally {
        if (temporary) await rm(temporary, { force: true });
        this.busy = false;
      }
    });
  }
  async read(name: string): Promise<Buffer | undefined> {
    if (!backupName.test(name) || !(await this.files()).some((file) => file.name === name))
      return undefined;
    return readFile(join(this.directory, name));
  }
  start() {
    this.stopped = false;
    if (this.timer) return;
    const tick = () => {
      void this.run().catch(() =>
        logEvent('warn', 'backup.schedule_unavailable', { component: 'backup' }),
      );
    };
    tick();
    this.timer = setInterval(tick, 60000);
    this.timer.unref();
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
