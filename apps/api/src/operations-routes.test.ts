import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore } from './store.js';
import { RoutineBackups } from './routine-backups.js';
import { createOperationsRouter } from './operations-routes.js';
import { createBackupRouter } from './backup-routes.js';
import { createLocalHttpApp } from './http-app.js';
import { createPortableBackup } from './backup-archive.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
it('serves safe diagnostics, independent UUID correlation, and nondestructive validation through production routers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-operations-'));
  const store = new LocalStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
  await store.load();
  const privateText = 'private-report-body-fixture';
  await store.update((state) => {
    state.reports.push({
      id: 'report',
      leagueId: 'private-league-name',
      kind: 'power-rankings',
      title: 'Private title',
      body: privateText,
      citations: [],
      createdAt: new Date().toISOString(),
      status: 'draft',
    });
  });
  const databaseBackup = async () => {
    const path = join(directory, 'capture.sqlite');
    await store.backupTo(path);
    return readFile(path);
  };
  const currentBackup = async () => createPortableBackup(await databaseBackup(), store.path);
  let key: string | null = null;
  const backups = new RoutineBackups({
    store,
    currentBackup,
    readPassphrase: async () => key,
    savePassphrase: async (value) => {
      key = value;
    },
    removePassphrase: async () => {
      key = null;
    },
  });
  let port = 0;
  const app = createLocalHttpApp(() => port);
  app.use(
    createOperationsRouter({
      store,
      backups,
      logs: async () => ({
        available: true,
        entries: [
          {
            timestamp: new Date().toISOString(),
            level: 'warn',
            event: 'generation.failed',
            fields: {
              reason: 'private-token-fixture',
              component: '/private/path',
              jobId: '00000000-0000-4000-8000-000000000000',
              count: 1,
            },
          },
        ],
      }),
    }),
  );
  let restored = 0;
  app.use(
    createBackupRouter({
      currentBackup,
      databaseBackup,
      validateBackup: (buffer) => store.validateBackupBuffer(buffer),
      listSafetyBackups: async () => [],
      readSafetyBackup: async () => undefined,
      deleteSafetyBackup: async () => false,
      restoreBackup: async () => {
        restored++;
        return 'unused';
      },
      afterRestore: async () => store.settingsSnapshot(),
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing listener.');
  port = address.port;
  cleanup.push(async () => {
    backups.stop();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  const response = await fetch(`${base}/api/diagnostics/export`);
  const exported = await response.text();
  expect(response.headers.get('content-disposition')).toContain('sidekick-diagnostics.json');
  for (const value of [
    privateText,
    'private-league-name',
    'Private title',
    '/private/path',
    'private-token-fixture',
    directory,
  ])
    expect(exported).not.toContain(value);
  expect(exported).toContain('00000000-0000-4000-8000-000000000000');
  const rejected = await fetch(`${base}/api/backups/routine/schedule`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-sidekick-request-id': 'private-supplied-token',
    },
    body: '{}',
  });
  expect(rejected.status).toBe(400);
  expect(rejected.headers.get('x-sidekick-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  expect(rejected.headers.get('x-sidekick-request-id')).not.toBe('private-supplied-token');
  const before = store.snapshot();
  const databaseCopy = await fetch(`${base}/api/backup/database`);
  expect(databaseCopy.status).toBe(200);
  expect(databaseCopy.headers.get('content-type')).toContain('application/vnd.sqlite3');
  expect(
    Buffer.from(await databaseCopy.arrayBuffer())
      .subarray(0, 16)
      .toString(),
  ).toBe('SQLite format 3\0');
  const checked = await fetch(`${base}/api/backup/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: new Uint8Array(await currentBackup()),
  });
  expect(await checked.json()).toEqual({
    valid: true,
    leagues: 0,
    reports: 1,
    profiles: 0,
    images: 0,
  });
  expect(restored).toBe(0);
  expect(store.snapshot()).toEqual(before);
});
