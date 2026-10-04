import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:os';
import {
  inspectDataDirectory,
  findSqliteRecoverExecutable,
  isValidAppDatabase,
  recoverSqlitePages,
  recoveryStoreModulePaths,
  salvageDamagedDatabase,
  supportsSqlitePageRecovery,
} from './recover-database.mjs';

function addRow(database, table, id, value) {
  database.prepare(`INSERT INTO ${table} (id, payload) VALUES (?, ?)`).run(id, value);
}

await test('SQLite recovery detection requires a successful functional probe', () => {
  const help = { status: 0, stdout: '.recover Recover as much data as possible from corrupt db.' };
  assert.equal(
    supportsSqlitePageRecovery(help, { status: 1, stdout: '' }),
    false,
    'help text alone must not claim the recovery module works',
  );
  assert.equal(
    supportsSqlitePageRecovery(help, { status: 0, stdout: 'BEGIN TRANSACTION; COMMIT;' }),
    true,
  );
  assert.equal(
    supportsSqlitePageRecovery(
      { status: 0, stdout: "Nothing matches 'recover'" },
      { status: 0, stdout: '' },
    ),
    false,
  );
});

await test('page recovery uses a supported local SQLite CLI without changing its source', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-db-page-recovery-'));
  const source = join(root, 'source.sqlite');
  const recoveredPath = join(root, 'recovered.sqlite');
  const database = new Database(source);
  database.exec('CREATE TABLE fixture (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)');
  database.prepare('INSERT INTO fixture (payload) VALUES (?)').run('recoverable fixture row');
  database.close();

  try {
    if (!findSqliteRecoverExecutable()) {
      t.skip('No local SQLite CLI with .recover support.');
      return;
    }
    await recoverSqlitePages(source, recoveredPath);
    if (platform() !== 'win32') assert.equal((await stat(recoveredPath)).mode & 0o777, 0o600);
    const recovered = new Database(recoveredPath, { readonly: true });
    assert.equal(
      recovered.prepare('SELECT payload FROM fixture WHERE id = 1').get().payload,
      'recoverable fixture row',
    );
    recovered.close();
    const original = new Database(source, { readonly: true });
    assert.equal(original.prepare('SELECT COUNT(*) AS count FROM fixture').get().count, 1);
    original.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await test(
  'raw-page recovery salvages validated app rows without modifying the damaged database',
  { skip: findSqliteRecoverExecutable() ? false : 'SQLite CLI with .recover is unavailable' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'sidekick-db-raw-page-salvage-'));
    const backups = join(root, 'backups');
    const databasePath = join(root, 'state.sqlite');
    await mkdir(backups);
    const database = new Database(databasePath);
    database.pragma('page_size = 512');
    database.exec(`
      CREATE TABLE app_settings (id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE leagues (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE reports (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    `);
    addRow(database, 'app_settings', 1, JSON.stringify({ actions: [] }));
    const league = {
      id: 'raw-league',
      platform: 'sleeper',
      name: 'raw league',
      displayName: 'Raw Page Recovery League',
      teamCount: 1,
      scoring: {},
      settings: {},
      teams: [],
      connectedAt: '2026-09-01T00:00:00.000Z',
    };
    addRow(database, 'leagues', league.id, JSON.stringify(league));
    const insertReport = database.prepare('INSERT INTO reports (id, payload) VALUES (?, ?)');
    for (let index = 0; index < 180; index += 1) {
      const report = {
        id: `report-${index}`,
        leagueId: league.id,
        kind: 'power-rankings',
        createdAt: '2026-09-01T01:00:00.000Z',
        title: `Report ${index}`,
        body: `A recoverable body ${index}. `.repeat(40),
        citations: [],
        status: 'draft',
      };
      insertReport.run(report.id, JSON.stringify(report));
    }
    const pageSize = database.pragma('page_size', { simple: true });
    const pageCount = database.pragma('page_count', { simple: true });
    database.close();

    const originalSize = (await stat(databasePath)).size;
    // Damage an interior report page so row reads exercise the corruption path.
    const damagedPage = Math.floor(pageCount / 2);
    const file = await open(databasePath, 'r+');
    try {
      await file.write(Buffer.alloc(pageSize), 0, pageSize, damagedPage * pageSize);
      await file.sync();
    } finally {
      await file.close();
    }

    try {
      assert.equal(isValidAppDatabase(databasePath), false);
      const result = await salvageDamagedDatabase(root);
      assert.equal(result.rawPageRecovery, true);
      assert.match(result.backupName, /-page-salvage-[a-f\d]{8}\.sqlite$/);
      assert.ok(result.counts.leagues >= 1);
      assert.ok(result.counts.reports > 0);
      assert.equal((await stat(databasePath)).size, originalSize);
      assert.equal(isValidAppDatabase(databasePath), false);
      assert.equal(isValidAppDatabase(join(backups, result.backupName)), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

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
    CREATE TABLE generation_jobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
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
  const job = {
    id: 'recovered-job',
    requestId: 'recovered-request',
    leagueId: league.id,
    kind: 'power-rankings',
    createdAt: new Date().toISOString(),
    status: 'completed',
    reportId: report.id,
  };
  addRow(database, 'generation_jobs', job.id, JSON.stringify(job));
  addRow(
    database,
    'generation_jobs',
    'job-bad',
    JSON.stringify({ ...job, id: 'job-bad', requestId: 'bad-request', status: 'unknown' }),
  );
  addRow(database, 'generation_jobs', 'job-invalid-json', '{bad-json');
  database.close();

  try {
    assert.equal(isValidAppDatabase(databasePath), false);
    const result = await salvageDamagedDatabase(root);
    assert.equal(result.counts.leagues, 1);
    assert.equal(result.counts.reports, 1);
    assert.equal(result.counts.memories, 1);
    assert.equal(result.counts.projections, 1);
    assert.equal(result.counts.runs, 1);
    assert.equal(result.counts.jobs, 1);
    assert.equal(result.counts.skipped, 6);
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
