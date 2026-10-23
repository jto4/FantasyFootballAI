import Database from 'better-sqlite3';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  isUpcomingFootballGame,
  nflSeasonFor,
  playerNameKey,
  type FootballGame,
  type PropLine,
} from '@sidekick/core';
import type { PublicFootballData, PublicPropLines } from '@sidekick/integrations';

export interface PropLineObservation {
  line: number;
  overOdds?: number;
  underOdds?: number;
  at: string;
}
export interface PropLineHistory {
  key: string;
  gameId: string;
  kickoffAt?: string;
  playerName: string;
  espnId?: string;
  team?: string;
  stat: PropLine['stat'];
  sportsbook: string;
  source: PropLine['source'];
  first: PropLineObservation;
  /** The last observation of each local-UTC day it was seen. */
  daily: Record<string, PropLineObservation>;
  /** The last observation before kickoff; never updated once the game has started. */
  closing: PropLineObservation;
  observations: number;
}

const observation = (line: PropLine, at: string): PropLineObservation => ({
  line: line.line,
  ...(line.overOdds !== undefined ? { overOdds: line.overOdds } : {}),
  ...(line.underOdds !== undefined ? { underOdds: line.underOdds } : {}),
  at,
});

/**
 * Every prop line and price the app sees, kept so the prop model can later be tested against real
 * sportsbook numbers: the first sighting, the last line of each day and the last line before
 * kickoff. Separate from app state, like the other research stores.
 */
export class PropLineLedger {
  private db: Database.Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS lines (key TEXT PRIMARY KEY, game_id TEXT NOT NULL, payload TEXT NOT NULL) STRICT',
    );
    if (path !== ':memory:') chmodSync(path, 0o600);
  }
  /** Records lines seen at `at`; lines for games that have already kicked off are ignored. */
  record(lines: PropLine[], games: FootballGame[], at: string) {
    const kickoff = new Map(games.map((g) => [g.id, g.kickoffAt]));
    const read = this.db.prepare('SELECT payload FROM lines WHERE key = ?');
    const write = this.db.prepare(
      'INSERT INTO lines (key, game_id, payload) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload = excluded.payload',
    );
    let saved = 0;
    this.db.transaction(() => {
      for (const line of lines) {
        const kickoffAt = kickoff.get(line.gameId);
        if (kickoffAt && Date.parse(kickoffAt) <= Date.parse(at)) continue;
        const espnId = /^espn:[^:]+:(\d{1,12}):/.exec(line.id)?.[1];
        const key = `${line.gameId}:${espnId ?? playerNameKey(line.playerName)}:${line.stat}:${line.sportsbook}`;
        const row = read.get(key) as { payload: string } | undefined;
        const previous = row ? (JSON.parse(row.payload) as PropLineHistory) : undefined;
        const seen = observation(line, at);
        const next: PropLineHistory = {
          key,
          gameId: line.gameId,
          ...(kickoffAt ? { kickoffAt } : {}),
          playerName: line.playerName,
          ...(espnId ? { espnId } : {}),
          ...(line.team ? { team: line.team } : {}),
          stat: line.stat,
          sportsbook: line.sportsbook,
          source: line.source,
          first: previous?.first ?? seen,
          daily: { ...previous?.daily, [at.slice(0, 10)]: seen },
          closing: seen,
          observations: (previous?.observations ?? 0) + 1,
        };
        write.run(key, line.gameId, JSON.stringify(next));
        saved++;
      }
    })();
    return saved;
  }
  list(gameId?: string): PropLineHistory[] {
    const rows = (
      gameId
        ? this.db.prepare('SELECT payload FROM lines WHERE game_id = ?').all(gameId)
        : this.db.prepare('SELECT payload FROM lines').all()
    ) as { payload: string }[];
    return rows.map((row) => JSON.parse(row.payload) as PropLineHistory);
  }
  summary() {
    const row = this.db
      .prepare('SELECT COUNT(*) AS lines, COUNT(DISTINCT game_id) AS games FROM lines')
      .get() as { lines: number; games: number };
    return row;
  }
  close() {
    this.db.close();
  }
}

/**
 * Captures prop lines in the background: every game of the coming week once a day, and games
 * kicking off within two hours on every tick, so the last line before kickoff is close to the
 * closing line. Uses the same cached ESPN/Odds API reads as the props board.
 */
export function startPropLineCapture(
  deps: {
    data: Pick<PublicFootballData, 'get'>;
    props: Pick<PublicPropLines, 'props'>;
    ledger: PropLineLedger;
    now?: () => number;
  },
  onError: (error: unknown) => void = () => undefined,
  intervalMs = 20 * 60_000,
) {
  const now = deps.now ?? Date.now;
  let running = false;
  let lastDailyCapture = '';
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const at = new Date(now()).toISOString();
      const data = await deps.data.get(nflSeasonFor(now()));
      const upcoming = data.games.filter(
        (g) => g.season === data.season && g.seasonType === 'REG' && isUpcomingFootballGame(g, at),
      );
      if (!upcoming.length) return;
      const week = Math.min(...upcoming.map((g) => g.week));
      const daily = lastDailyCapture !== at.slice(0, 10);
      const games = upcoming.filter(
        (g) =>
          g.week === week &&
          (daily ||
            (g.kickoffAt !== undefined && Date.parse(g.kickoffAt) - now() <= 2 * 3_600_000)),
      );
      for (const game of games) {
        const snapshot = await deps.props.props(game).catch(() => undefined);
        if (snapshot) deps.ledger.record(snapshot.lines, [game], at);
      }
      if (daily) lastDailyCapture = at.slice(0, 10);
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void tick(), 60_000);
  const timer = setInterval(() => void tick(), intervalMs);
  first.unref();
  timer.unref();
  return {
    tick,
    stop: () => {
      clearTimeout(first);
      clearInterval(timer);
    },
  };
}
