import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inspectDataDirectory,
  isValidAppDatabase,
  moveDamagedDatabaseAside,
  restoreFromBackup,
} from './recover-database.mjs';

async function createFixture(
  path,
  state = { settings: { actions: [] }, leagues: [], reports: [] },
) {
  const database = new Database(path);
  database.exec(`CREATE TABLE app_settings (id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE leagues (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE reports (id TEXT PRIMARY KEY, payload TEXT NOT NULL);`);
  database
    .prepare('INSERT INTO app_settings (id, payload) VALUES (1, ?)')
    .run(JSON.stringify(state.settings));
  for (const item of state.leagues)
    database
      .prepare('INSERT INTO leagues (id, payload) VALUES (?, ?)')
      .run(item.id, JSON.stringify(item));
  for (const item of state.reports)
    database
      .prepare('INSERT INTO reports (id, payload) VALUES (?, ?)')
      .run(item.id, JSON.stringify(item));
  database.close();
}

await test('inspection identifies valid and invalid current databases and safety backups', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-db-check-'));
  try {
    const backups = join(root, 'backups');
    await mkdir(backups);
    await createFixture(join(root, 'state.sqlite'));
    await createFixture(join(backups, 'before-restore-2026-09-27T00-00-00-000Z-deadbeef.sqlite'));
    await writeFile(
      join(backups, 'before-upgrade-2026-09-27T00-00-00-000Z-bad0bad0.sqlite'),
      'not sqlite',
    );
    const result = await inspectDataDirectory(root);
    assert.equal(result.current.valid, true);
    assert.equal(result.backups.length, 2);
    expectBackupValidity(
      result.backups,
      'before-restore-2026-09-27T00-00-00-000Z-deadbeef.sqlite',
      true,
    );
    expectBackupValidity(
      result.backups,
      'before-upgrade-2026-09-27T00-00-00-000Z-bad0bad0.sqlite',
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function expectBackupValidity(backups, name, valid) {
  assert.equal(backups.find((backup) => backup.name === name)?.valid, valid);
}

test('restore validates backup and preserves existing database plus journals before replacement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-db-restore-'));
  try {
    const backups = join(root, 'backups');
    await mkdir(backups);
    const backupName = 'before-restore-2026-09-27T00-00-00-000Z-deadbeef.sqlite';
    await createFixture(join(backups, backupName), {
      settings: {
        writingStyle: 'Recovered state',
        aiRuntime: { mode: 'cli', command: 'untrusted-command', baseUrl: 'https://example.test' },
        imessageAutoSyncEnabled: true,
        twilioConversationAutoSyncEnabled: true,
        mcpDeliveryEnabled: true,
        actions: [
          { kind: 'weekly-power-rankings', mode: 'automatic', schedule: { enabled: true } },
        ],
      },
      leagues: [],
      reports: [],
    });
    await writeFile(join(root, 'state.sqlite'), 'damaged database');
    await writeFile(join(root, 'state.sqlite-wal'), 'recoverable journal bytes');
    await writeFile(join(root, 'state.sqlite-shm'), 'shared memory bytes');

    const result = await restoreFromBackup(root, backupName);
    assert.equal(isValidAppDatabase(join(root, 'state.sqlite')), true);
    const preserved = await readdir(result.recoveryPath);
    assert.ok(preserved.includes('state.sqlite'));
    assert.ok(preserved.includes('state.sqlite-wal'));
    assert.ok(preserved.includes('state.sqlite-shm'));
    assert.equal(
      await readFile(join(result.recoveryPath, 'state.sqlite'), 'utf8'),
      'damaged database',
    );
    assert.equal(
      await readFile(join(result.recoveryPath, 'state.sqlite-wal'), 'utf8'),
      'recoverable journal bytes',
    );
    const restored = new Database(join(root, 'state.sqlite'), { readonly: true });
    const settings = JSON.parse(
      restored.prepare('SELECT payload FROM app_settings WHERE id = 1').get().payload,
    );
    restored.close();
    assert.equal(settings.aiRuntime.command, '');
    assert.equal(settings.imessageAutoSyncEnabled, false);
    assert.equal(settings.twilioConversationAutoSyncEnabled, false);
    assert.equal(settings.mcpDeliveryEnabled, false);
    assert.equal(settings.actions[0].mode, 'draft');
    assert.equal(settings.actions[0].schedule.enabled, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restore refuses invalid backups and an active desktop data folder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-db-guard-'));
  try {
    const backups = join(root, 'backups');
    await mkdir(backups);
    const backupName = 'before-upgrade-2026-09-27T00-00-00-000Z-deadbeef.sqlite';
    await writeFile(join(backups, backupName), 'not sqlite');
    await assert.rejects(
      restoreFromBackup(root, backupName),
      /not a valid Sunday Sidekick database/,
    );
    await rm(join(backups, backupName));
    await createFixture(join(backups, backupName));
    await writeFile(join(root, 'service-port'), '4173');
    await assert.rejects(restoreFromBackup(root, backupName), /Stop Sunday Sidekick/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('starting fresh preserves an unreadable database and journals in a private recovery folder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-db-fresh-'));
  try {
    const databasePath = join(root, 'state.sqlite');
    await writeFile(databasePath, 'damaged database');
    await writeFile(`${databasePath}-wal`, 'journal bytes');
    const result = await moveDamagedDatabaseAside(root);
    assert.equal(result.databasePath, databasePath);
    assert.equal(
      await readdir(result.recoveryPath).then((names) => names.includes('state.sqlite')),
      true,
    );
    assert.equal(
      await readFile(join(result.recoveryPath, 'state.sqlite'), 'utf8'),
      'damaged database',
    );
    assert.equal(
      await readFile(join(result.recoveryPath, 'state.sqlite-wal'), 'utf8'),
      'journal bytes',
    );
    assert.match(await readFile(join(result.recoveryPath, 'RECOVERY-NOTE.txt'), 'utf8'), /empty/);
    await assert.rejects(readFile(databasePath), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('starting fresh refuses to move files while the local service is marked active', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-db-fresh-active-'));
  try {
    await writeFile(join(root, 'state.sqlite'), 'damaged database');
    await writeFile(join(root, 'service-port'), '4173');
    await assert.rejects(moveDamagedDatabaseAside(root), /Stop Sunday Sidekick/);
    assert.equal(await readFile(join(root, 'state.sqlite'), 'utf8'), 'damaged database');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
