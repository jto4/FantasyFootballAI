import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore } from './store.js';
import { RoutineBackups } from './routine-backups.js';
import {
  createPortableBackup,
  decryptPortableBackup,
  parsePortableBackup,
} from './backup-archive.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-routine-'));
  const store = new LocalStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
  await store.load();
  let key: string | null = null,
    broken = false;
  let now = new Date('2026-10-05T00:00:00Z');
  const backups = new RoutineBackups({
    store,
    now: () => now,
    readPassphrase: async () => key,
    savePassphrase: async (value) => {
      key = value;
    },
    removePassphrase: async () => {
      key = null;
    },
    currentBackup: async () => {
      if (broken) throw new Error('private/path/token');
      const path = join(directory, 'capture.sqlite');
      await store.backupTo(path);
      return createPortableBackup(await readFile(path), store.path);
    },
  });
  cleanup.push(async () => {
    backups.stop();
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    directory,
    store,
    backups,
    advance: () => {
      now = new Date(now.getTime() + 86400000);
    },
    break: () => {
      broken = true;
    },
    clearKey: () => {
      key = null;
    },
  };
}
const schedule = {
  enabled: true,
  intervalHours: 24 as const,
  retainCount: 3 as const,
  revision: 0,
};
it('encrypts validated routine copies, rotates after success, and preserves copies after failure', async () => {
  const f = await fixture();
  await f.backups.configure(schedule, ' backup-test-passphrase ');
  for (let index = 0; index < 4; index++) {
    await f.backups.run();
    f.advance();
  }
  let status = await f.backups.status();
  expect(status.files).toHaveLength(3);
  expect(status.lastErrorCode).toBeUndefined();
  const bytes = await f.backups.read(status.files[0]!.name);
  expect(bytes!.subarray(0, 8).toString()).toBe('SSBKENC1');
  const contents = parsePortableBackup(
    await decryptPortableBackup(bytes!, ' backup-test-passphrase '),
  );
  expect(await f.store.validateBackupBuffer(contents.database)).toEqual({
    reports: 0,
    leagues: 0,
    profiles: 0,
  });
  const path = join(f.directory, 'routine-backups', status.files[0]!.name);
  if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect(
    await readFile(join(f.directory, 'routine-backups', 'schedule.json'), 'utf8'),
  ).not.toContain('backup-test-passphrase');
  const saved = status.files.map((file) => file.name);
  f.break();
  await f.backups.run();
  status = await f.backups.status();
  expect(status.lastErrorCode).toBe('backup_failed');
  expect(status.files.map((file) => file.name)).toEqual(saved);
  expect(JSON.stringify(status)).not.toContain('private/path/token');
  f.clearKey();
  await f.backups.run(true);
  expect((await f.backups.status()).lastErrorCode).toBe('credential_store');
});
it('rejects stale schedule saves and disables the machine-local schedule after restore', async () => {
  const f = await fixture();
  await expect(f.backups.configure(schedule)).rejects.toThrow('passphrase');
  await f.backups.configure(schedule, 'backup-test-passphrase');
  await expect(f.backups.configure(schedule)).rejects.toThrow();
  await f.backups.disableAfterRestore();
  const before = await f.backups.status();
  expect(before.schedule.enabled).toBe(false);
  await f.backups.run(true);
  expect((await f.backups.status()).files).toEqual([]);
});
it('validates a disposable backup without changing current data or safety copies', async () => {
  const f = await fixture();
  const path = join(f.directory, 'capture.sqlite');
  await f.store.backupTo(path);
  const before = f.store.snapshot(),
    files = await readdir(f.directory);
  expect(await f.store.validateBackupBuffer(await readFile(path))).toEqual({
    reports: 0,
    leagues: 0,
    profiles: 0,
  });
  await expect(f.store.validateBackupBuffer(Buffer.from('not sqlite'))).rejects.toThrow();
  expect(f.store.snapshot()).toEqual(before);
  expect(await readdir(f.directory)).toEqual(files);
  await f.backups.configure(schedule, 'backup-test-passphrase');
  await f.backups.run();
  const file = (await f.backups.status()).files[0]!;
  await writeFile(join(f.directory, 'unrelated.ssb'), 'do not rotate');
  if (process.platform !== 'win32') {
    await symlink(
      path,
      join(
        f.directory,
        'routine-backups',
        file.name.replace(/-[a-f0-9-]{36}\.ssb$/, '-00000000-0000-0000-0000-000000000000.ssb'),
      ),
    );
    expect((await f.backups.files()).length).toBe(1);
  }
});
