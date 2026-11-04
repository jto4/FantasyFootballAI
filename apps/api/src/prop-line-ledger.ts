import type Database from 'better-sqlite3';
import { openLocalDatabase } from './local-database.js';
import {
  isUpcomingFootballGame,
  nflSeasonFor,
  playerNameKey,
  propLineKey,
  type FootballGame,
  type FootballStatKey,
  type PlayerPropLines,
  type PropLine,
} from '@sidekick/core';
import type { PublicFootballData, PublicPropLines } from '@sidekick/integrations';

const isObservation = (value: unknown) =>
  Boolean(value) &&
  typeof value === 'object' &&
  Number.isFinite((value as PropLineObservation).line) &&
  typeof (value as PropLineObservation).at === 'string';

/** A saved line read back from a backup file, which is outside this app's control. */
export function isPropLineHistory(value: unknown): value is PropLineHistory {
  if (!value || typeof value !== 'object') return false;
  const line = value as Record<string, unknown>;
  return (
    ['key', 'gameId', 'playerName', 'stat', 'sportsbook', 'source'].every(
      (field) => typeof line[field] === 'string' && (line[field] as string).length <= 300,
    ) &&
    isObservation(line.first) &&
    isObservation(line.closing) &&
    Boolean(line.daily) &&
    typeof line.daily === 'object' &&
    Object.values(line.daily as object).every(isObservation)
  );
}

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
  /**
   * The last price before kickoff (with the time it was first seen at that price); never updated
   * once the game has started.
   */
  closing: PropLineObservation;
  /** Recorded changes and daily observations (an unchanged price is not counted again). */
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
    // The index: projections read a week's games on every build, and the table grows all season.
    this.db = openLocalDatabase(
      path,
      'CREATE TABLE IF NOT EXISTS lines (key TEXT PRIMARY KEY, game_id TEXT NOT NULL, payload TEXT NOT NULL) STRICT; CREATE INDEX IF NOT EXISTS lines_by_game ON lines (game_id)',
    );
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
        // An unchanged price already recorded today adds nothing; skipping it saves a write per
        // line on every capture. The closing entry keeps the time that price was first seen.
        const same = (o?: PropLineObservation) =>
          o !== undefined &&
          o.line === seen.line &&
          o.overOdds === seen.overOdds &&
          o.underOdds === seen.underOdds;
        if (previous && same(previous.closing) && same(previous.daily[at.slice(0, 10)])) continue;
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
  /**
   * The latest pre-kickoff line for each player and stat in these games, averaged across books,
   * keyed by `propLineKey`. Reads only the games asked for, as the ledger grows all season.
   */
  latestLines(gameIds: string[]) {
    const totals = new Map<string, Map<FootballStatKey, { sum: number; books: number }>>();
    for (const gameId of gameIds)
      for (const row of this.list(gameId)) {
        const key = propLineKey(row.gameId, row.playerName);
        const stats = totals.get(key) ?? new Map<FootballStatKey, { sum: number; books: number }>();
        const seen = stats.get(row.stat) ?? { sum: 0, books: 0 };
        stats.set(row.stat, { sum: seen.sum + row.closing.line, books: seen.books + 1 });
        totals.set(key, stats);
      }
    return new Map<string, PlayerPropLines>(
      [...totals].map(([key, stats]) => [
        key,
        Object.fromEntries([...stats].map(([stat, seen]) => [stat, seen.sum / seen.books])),
      ]),
    );
  }
  /**
   * Drops the day-by-day prices from seasons before this one. The first and closing lines stay:
   * they are what model reviews use, and the daily entries are most of a line's size.
   */
  condenseBefore(season: number) {
    const rows = this.db
      .prepare('SELECT key, payload FROM lines WHERE game_id < ?')
      .all(`${season}_`) as { key: string; payload: string }[];
    const write = this.db.prepare('UPDATE lines SET payload = ? WHERE key = ?');
    let condensed = 0;
    this.db.transaction(() => {
      for (const row of rows) {
        const line = JSON.parse(row.payload) as PropLineHistory;
        if (!Object.keys(line.daily).length) continue;
        write.run(JSON.stringify({ ...line, daily: {} }), row.key);
        condensed++;
      }
    })();
    return condensed;
  }
  /** Adds lines from a backup; a line already here is newer or the same, so it stays. */
  merge(lines: PropLineHistory[]) {
    const write = this.db.prepare(
      'INSERT INTO lines (key, game_id, payload) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING',
    );
    this.db.transaction(() => {
      for (const line of lines) write.run(line.key, line.gameId, JSON.stringify(line));
    })();
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
    /** The owner can switch background saving off in Personalize; checked on every tick. */
    enabled?: () => boolean;
    /** Runs after each capture of games, so leans are saved without opening the Props page. */
    afterCapture?: () => Promise<unknown>;
  },
  onError: (error: unknown) => void = () => undefined,
  intervalMs = 20 * 60_000,
) {
  const now = deps.now ?? Date.now;
  let running = false;
  let lastDailyCapture = '';
  const tick = async () => {
    if (running || deps.enabled?.() === false) return;
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
      if (daily) {
        lastDailyCapture = at.slice(0, 10);
        deps.ledger.condenseBefore(data.season);
      }
      if (games.length) await deps.afterCapture?.();
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
