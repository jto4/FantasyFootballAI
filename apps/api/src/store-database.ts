import type { Database as DatabaseHandle } from 'better-sqlite3';
import { type MemberMemory, type PlayerProjection } from '@sidekick/core';
import type { AppState, ScheduledRun } from './store-types.js';
export const migrations: Array<(database: DatabaseHandle) => void> = [
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
  (database) => {
    database.exec(
      'CREATE TABLE generation_jobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT;',
    );
  },
];

/** Skip serializing large, unchanged imported conversations during unrelated updates. */
export function replaceMemoryRows(
  database: DatabaseHandle,
  rows: MemberMemory[],
  previous?: MemberMemory[],
): void {
  const sameOrder =
    previous?.length === rows.length &&
    previous.every((profile, index) => profile.id === rows[index]?.id);
  if (!sameOrder) {
    replaceRows(database, 'memories', rows);
    return;
  }

  const upsert = database.prepare(`
    INSERT INTO memories (id, payload) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
    WHERE payload != excluded.payload
  `);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const prior = previous![index]!;
    if (row === prior) continue;
    if (row.sourceText === prior.sourceText && sameMemoryMetadata(row, prior)) continue;
    upsert.run(row.id, JSON.stringify(row));
  }
}

export function sameMemoryMetadata(left: MemberMemory, right: MemberMemory): boolean {
  const { sourceText: _leftSource, ...leftMetadata } = left;
  const { sourceText: _rightSource, ...rightMetadata } = right;
  void _leftSource;
  void _rightSource;
  return JSON.stringify(leftMetadata) === JSON.stringify(rightMetadata);
}

export function isSafetyBackupName(name: string): boolean {
  return /^before-(?:restore|upgrade)-[\dTZ.-]+(?:-salvage)?-[a-f\d]{8}\.sqlite$/.test(name);
}

export function migrateRows(
  database: DatabaseHandle,
  table: 'leagues' | 'reports' | 'memories' | 'generation_jobs',
  rows: unknown[],
): void {
  const insert = database.prepare(`INSERT INTO ${table} (id, payload) VALUES (?, ?)`);
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof (row as { id?: unknown }).id !== 'string')
      throw new Error(`Invalid ${table} item in the state database.`);
    insert.run((row as { id: string }).id, JSON.stringify(row));
  }
}

export function replaceRows(
  database: DatabaseHandle,
  table: 'leagues' | 'reports' | 'memories' | 'generation_jobs',
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

export function replaceScheduledRuns(database: DatabaseHandle, runs: ScheduledRun[]): void {
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

export function replacePlayerProjectionRows(
  database: DatabaseHandle,
  rows: PlayerProjection[],
): void {
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

export function deleteRemovedRows(
  database: DatabaseHandle,
  table:
    | 'leagues'
    | 'reports'
    | 'memories'
    | 'scheduled_runs'
    | 'player_projections'
    | 'generation_jobs',
  retainedIds: Set<string>,
): void {
  const existingIds = database.prepare(`SELECT id FROM ${table}`).all() as Array<{ id: string }>;
  const remove = database.prepare(`DELETE FROM ${table} WHERE id = ?`);
  for (const { id } of existingIds) if (!retainedIds.has(id)) remove.run(id);
}
