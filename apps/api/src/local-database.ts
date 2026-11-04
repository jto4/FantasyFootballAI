import Database from 'better-sqlite3';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Opens one of the app's side databases, owner-only, creating its folder and tables as needed. */
export function openLocalDatabase(path: string, schema: string): Database.Database {
  // These open at API startup, before the main store creates the data directory.
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  // Keep the write-ahead log from staying at its high-water mark (~4 MB) after checkpoints.
  db.pragma('journal_size_limit = 1048576');
  // Start each run with a trimmed log rather than the last run's high-water mark.
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec(schema);
  if (path !== ':memory:') chmodSync(path, 0o600);
  return db;
}
