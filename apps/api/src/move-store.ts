import { isMoveProposal, type MoveProposal, type MoveStatus } from '@sidekick/core';
import type Database from 'better-sqlite3';
import { openLocalDatabase } from './local-database.js';

const maxMoves = 300;

/**
 * Proposed roster moves and what became of them. The status columns carry the guarantee that a
 * move is sent at most once: `claim` is the only way into `submitting`.
 */
export class MoveStore {
  private readonly db: Database.Database;
  constructor(path: string) {
    this.db = openLocalDatabase(
      path,
      `CREATE TABLE IF NOT EXISTS moves (
         id TEXT PRIMARY KEY,
         league_id TEXT NOT NULL,
         team_id TEXT NOT NULL,
         status TEXT NOT NULL,
         created_at TEXT NOT NULL,
         payload TEXT NOT NULL
       );
       CREATE INDEX IF NOT EXISTS moves_team ON moves (league_id, team_id, created_at);
       CREATE TABLE IF NOT EXISTS move_settings (
         league_id TEXT PRIMARY KEY,
         direct_submit INTEGER NOT NULL
       );`,
    );
    // A send interrupted by a crash may have reached the platform, so it can't be offered again.
    for (const move of this.rows("status = 'submitting'"))
      this.save({
        ...move,
        status: 'unconfirmed',
        message: 'The app stopped while sending this. Check the platform before trying again.',
      });
  }

  private rows(where: string, ...values: string[]) {
    return (
      this.db
        .prepare(`SELECT payload FROM moves WHERE ${where} ORDER BY created_at DESC`)
        .all(...values) as { payload: string }[]
    ).flatMap((row) => {
      const value: unknown = JSON.parse(row.payload);
      return isMoveProposal(value) ? [value] : [];
    });
  }

  get(id: string) {
    return this.rows('id = ?', id)[0];
  }
  list(leagueId: string, teamId: string) {
    return this.rows('league_id = ? AND team_id = ?', leagueId, teamId).slice(0, 50);
  }
  all() {
    return this.rows('1 = 1');
  }

  save(move: MoveProposal) {
    this.db
      .prepare(
        `INSERT INTO moves (id, league_id, team_id, status, created_at, payload)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, payload = excluded.payload`,
      )
      .run(move.id, move.leagueId, move.teamId, move.status, move.createdAt, JSON.stringify(move));
    this.trim();
    return move;
  }

  /** Atomically moves a proposal on; false means someone else already did, so stop. */
  claim(id: string, from: MoveStatus, next: MoveProposal) {
    return (
      this.db
        .prepare('UPDATE moves SET status = ?, payload = ? WHERE id = ? AND status = ?')
        .run(next.status, JSON.stringify(next), id, from).changes === 1
    );
  }

  /** Adds moves from a backup; a move already here may have progressed, so it stays. */
  merge(moves: MoveProposal[]) {
    const write = this.db.prepare(
      `INSERT INTO moves (id, league_id, team_id, status, created_at, payload)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    );
    this.db.transaction(() => {
      for (const m of moves) {
        // A restored proposal must not become approvable, and a restored send is not in progress.
        const settled: MoveProposal = ['proposed', 'submitting', 'waiting'].includes(m.status)
          ? { ...m, status: m.status === 'proposed' ? 'expired' : 'unconfirmed' }
          : m;
        write.run(m.id, m.leagueId, m.teamId, settled.status, m.createdAt, JSON.stringify(settled));
      }
    })();
    this.trim();
  }

  private trim() {
    this.db
      .prepare(
        'DELETE FROM moves WHERE id NOT IN (SELECT id FROM moves ORDER BY created_at DESC LIMIT ?)',
      )
      .run(maxMoves);
  }

  directSubmit(leagueId: string) {
    const row = this.db
      .prepare('SELECT direct_submit FROM move_settings WHERE league_id = ?')
      .get(leagueId) as { direct_submit: number } | undefined;
    return row?.direct_submit === 1;
  }
  setDirectSubmit(leagueId: string, enabled: boolean) {
    this.db
      .prepare(
        `INSERT INTO move_settings (league_id, direct_submit) VALUES (?, ?)
         ON CONFLICT(league_id) DO UPDATE SET direct_submit = excluded.direct_submit`,
      )
      .run(leagueId, enabled ? 1 : 0);
  }
}
