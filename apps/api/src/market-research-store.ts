import Database from 'better-sqlite3';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { isMarketResearchRecord, type MarketResearchRecord } from '@sidekick/core';

/** Deliberately separate from app state: never enters advice, reports or prediction ledgers. */
export class MarketResearchStore {
  private db: Database.Database;
  constructor(path: string) {
    // Constructed at API startup, before the main store creates the data directory.
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS research (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT',
    );
    if (path !== ':memory:') chmodSync(path, 0o600);
  }
  list(): MarketResearchRecord[] {
    return (
      this.db.prepare('SELECT payload FROM research ORDER BY rowid DESC').all() as {
        payload: string;
      }[]
    ).map((r) => {
      const value: unknown = JSON.parse(r.payload);
      if (!isMarketResearchRecord(value)) throw new Error('Invalid saved market research.');
      return value;
    });
  }
  freeze(record: MarketResearchRecord): MarketResearchRecord {
    if (!isMarketResearchRecord(record) || record.result)
      throw new Error('Invalid prospective record.');
    const existing = this.list().find(
      (r) =>
        r.snapshot.game.id === record.snapshot.game.id &&
        r.snapshot.provider === record.snapshot.provider,
    );
    if (existing) return existing;
    if (this.list().length >= 500)
      throw new Error(
        'Research ledger is full. Export the 500 saved records for archival; new collection is paused.',
      );
    this.db
      .prepare('INSERT INTO research (id,payload) VALUES (?,?)')
      .run(record.id, JSON.stringify(record));
    return structuredClone(record);
  }
  settle(id: string, result: NonNullable<MarketResearchRecord['result']>) {
    const record = this.list().find((r) => r.id === id);
    if (!record || record.result) return;
    const next = { ...record, result };
    if (!isMarketResearchRecord(next)) throw new Error('Invalid research outcome.');
    this.db.prepare('UPDATE research SET payload=? WHERE id=?').run(JSON.stringify(next), id);
  }
  close() {
    this.db.close();
  }
}
