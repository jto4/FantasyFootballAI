import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inspectDataDirectory,
  isValidAppDatabase,
  recoveryStoreModulePaths,
  salvageDamagedDatabase,
} from './recover-database.mjs';

function addRow(database, table, id, value) {
  database.prepare(`INSERT INTO ${table} (id, payload) VALUES (?, ?)`).run(id, value);
}

await test('partial-row salvage preserves valid records and omits malformed rows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-db-salvage-'));
  const backups = join(root, 'backups');
  await mkdir(backups);
  const databasePath = join(root, 'state.sqlite');
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE app_settings (id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE leagues (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE reports (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE memories (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE scheduled_runs (id TEXT PRIMARY KEY, position INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE player_projections (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, payload TEXT NOT NULL);
  `);
  addRow(
    database,
    'app_settings',
    1,
    JSON.stringify({
      writingStyle: 'Recovered voice',
      aiRuntime: {
        mode: 'cli',
        model: 'custom-model',
        command: 'untrusted-cli',
        args: '',
        baseUrl: 'https://api.openai.com/v1',
      },
      actions: [
        {
          kind: 'power-rankings',
          enabled: true,
          mode: 'automatic',
          channel: 'dashboard',
          schedule: {
            enabled: true,
            frequency: 'weekly',
            weekday: 0,
            time: '09:00',
            timezone: 'UTC',
          },
        },
      ],
    }),
  );
  const league = {
    id: 'league-1',
    platform: 'sleeper',
    name: 'Recovered League',
    displayName: 'Recovered League',
    teamCount: 1,
    scoring: {},
    settings: {},
    teams: [],
    connectedAt: '2026-09-01T00:00:00.000Z',
  };
  addRow(database, 'leagues', league.id, JSON.stringify(league));
  addRow(database, 'leagues', 'league-broken', '{invalid json');
  const report = {
    id: 'report-1',
    leagueId: league.id,
    kind: 'power-rankings',
    createdAt: '2026-09-01T01:00:00.000Z',
    title: 'Recovered report',
    body: 'Valid report body',
    citations: [],
    status: 'draft',
  };
  addRow(database, 'reports', report.id, JSON.stringify(report));
  addRow(
    database,
    'reports',
    'report-broken',
    JSON.stringify({ ...report, id: 'report-broken', deliveryState: 'sent' }),
  );
  addRow(
    database,
    'memories',
    'memory-1',
    JSON.stringify({
      id: 'memory-1',
      name: 'League member',
      sourceName: 'email export',
      importedAt: '2026-09-01T02:00:00.000Z',
      sourceText: 'Hello league',
      styleNotes: 'Short sentences',
      contextNotes: 'Manages the Sunday Crew',
    }),
  );
  const projection = {
    id: 'projection-1',
    leagueId: league.id,
    playerName: 'Example Player',
    projectedPoints: 12.5,
    sourceName: 'Owner CSV',
    importedAt: '2026-09-01T03:00:00.000Z',
  };
  database
    .prepare('INSERT INTO player_projections (id, league_id, payload) VALUES (?, ?, ?)')
    .run(projection.id, league.id, JSON.stringify(projection));
  const badProjection = { ...projection, id: 'projection-bad', projectedPoints: 'unknown' };
  database
    .prepare('INSERT INTO player_projections (id, league_id, payload) VALUES (?, ?, ?)')
    .run(badProjection.id, league.id, JSON.stringify(badProjection));
  const run = {
    id: 'run-1',
    kind: 'power-rankings',
    startedAt: '2026-09-01T04:00:00.000Z',
    status: 'succeeded',
  };
  database
    .prepare('INSERT INTO scheduled_runs (id, position, payload) VALUES (?, ?, ?)')
    .run(run.id, 0, JSON.stringify(run));
  database
    .prepare('INSERT INTO scheduled_runs (id, position, payload) VALUES (?, ?, ?)')
    .run('run-bad', 1, JSON.stringify({ ...run, id: 'run-bad', status: 'unknown' }));
  database.close();

  try {
    assert.equal(isValidAppDatabase(databasePath), false);
    const result = await salvageDamagedDatabase(root);
    assert.equal(result.counts.leagues, 1);
    assert.equal(result.counts.reports, 1);
    assert.equal(result.counts.memories, 1);
    assert.equal(result.counts.projections, 1);
    assert.equal(result.counts.runs, 1);
    assert.equal(result.counts.skipped, 4);
    const backupPath = join(backups, result.backupName);
    assert.match(result.backupName, /-salvage-[a-f\d]{8}\.sqlite$/);
    assert.equal(isValidAppDatabase(backupPath), true);
    const inspection = await inspectDataDirectory(root);
    assert.equal(
      inspection.backups.find((backup) => backup.name === result.backupName)?.valid,
      true,
    );
    const recovered = new Database(backupPath, { readonly: true });
    const settings = JSON.parse(
      recovered.prepare('SELECT payload FROM app_settings WHERE id = 1').get().payload,
    );
    assert.equal(settings.writingStyle, 'Recovered voice');
    assert.equal(settings.aiRuntime.mode, 'api');
    assert.equal(settings.actions[0].mode, 'draft');
    assert.equal(settings.actions[0].schedule.enabled, false);
    assert.equal(recovered.prepare('SELECT COUNT(*) AS count FROM leagues').get().count, 1);
    assert.equal(recovered.prepare('SELECT COUNT(*) AS count FROM reports').get().count, 1);
    recovered.close();
    assert.equal(isValidAppDatabase(databasePath), false, 'salvage must not change the source DB');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await test('recovery resolves its validator from checkout and packaged app layouts', () => {
  const root = process.cwd();
  assert.deepEqual(recoveryStoreModulePaths(join(root, 'scripts', 'recover-database.mjs')), [
    join(root, 'scripts', 'apps', 'api', 'dist', 'store.js'),
    join(root, 'apps', 'api', 'dist', 'store.js'),
  ]);
  const packagedRoot = join(tmpdir(), 'Sunday Sidekick.app', 'Contents', 'Resources', 'app');
  assert.deepEqual(recoveryStoreModulePaths(join(packagedRoot, 'database-recovery.mjs')), [
    join(packagedRoot, 'apps', 'api', 'dist', 'store.js'),
    join(
      tmpdir(),
      'Sunday Sidekick.app',
      'Contents',
      'Resources',
      'apps',
      'api',
      'dist',
      'store.js',
    ),
  ]);
});
