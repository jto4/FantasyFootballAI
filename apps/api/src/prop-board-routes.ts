import Database from 'better-sqlite3';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Router } from 'express';
import {
  buildPropBoard,
  gradePropLean,
  isUpcomingFootballGame,
  summarizePropLeans,
  type FootballGame,
  type PropLeanRecord,
  type PropLine,
} from '@sidekick/core';
import type { PublicFootballData, PublicPropLines } from '@sidekick/integrations';
import type { LocalStore } from './store.js';

/**
 * Pre-kickoff prop leans and their graded results, kept apart from app state like market
 * research. A lean can change until kickoff; after that it is frozen and only graded.
 */
export class PropLeanStore {
  private db: Database.Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS leans (key TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT',
    );
    if (path !== ':memory:') chmodSync(path, 0o600);
  }
  list(): PropLeanRecord[] {
    return (
      this.db.prepare('SELECT payload FROM leans ORDER BY rowid DESC LIMIT 5000').all() as {
        payload: string;
      }[]
    ).map((row) => JSON.parse(row.payload) as PropLeanRecord);
  }
  save(record: PropLeanRecord) {
    this.db
      .prepare(
        'INSERT INTO leans (key, payload) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET payload = excluded.payload',
      )
      .run(record.key, JSON.stringify(record));
  }
  close() {
    this.db.close();
  }
}

export function createPropBoardRouter(deps: {
  data: Pick<PublicFootballData, 'get'>;
  props: Pick<PublicPropLines, 'props'>;
  store: Pick<LocalStore, 'snapshot'>;
  leans: PropLeanStore;
  now?: () => number;
}) {
  const router = Router();
  const now = deps.now ?? Date.now;
  const seasonNow = () => {
    const date = new Date(now());
    return date.getUTCFullYear() - (date.getUTCMonth() < 2 ? 1 : 0);
  };
  function grade(stats: Parameters<typeof gradePropLean>[1]) {
    const at = new Date(now()).toISOString();
    for (const record of deps.leans.list()) {
      if (record.result || !record.kickoffAt || Date.parse(record.kickoffAt) > now()) continue;
      const result = gradePropLean(record, stats, at);
      if (result) deps.leans.save({ ...record, result });
    }
  }
  router.get('/api/props/board', async (req, res) => {
    if (
      Object.keys(req.query).some((k) => k !== 'league') ||
      (req.query.league !== undefined &&
        (typeof req.query.league !== 'string' || req.query.league.length > 256))
    )
      return res.status(400).json({ error: 'Choose a valid league.' });
    let data;
    try {
      data = await deps.data.get(seasonNow());
    } catch {
      return res.status(502).json({ error: 'NFL schedule and stats could not be loaded.' });
    }
    const at = new Date(now()).toISOString();
    const upcoming = data.games.filter(
      (g) => g.season === data.season && g.seasonType === 'REG' && isUpcomingFootballGame(g, at),
    );
    const week = Math.min(...upcoming.map((g) => g.week));
    const games = upcoming.filter((g) => g.week === week).slice(0, 16);
    const warnings: string[] = [];
    const lines: PropLine[] = [];
    let priced = false;
    // A few games at a time keeps ESPN requests polite; each game's lines are cached upstream.
    for (let i = 0; i < games.length; i += 4)
      await Promise.all(
        games.slice(i, i + 4).map(async (game: FootballGame) => {
          try {
            const snapshot = await deps.props.props(game);
            lines.push(...snapshot.lines);
            priced ||= snapshot.priced;
          } catch {
            warnings.push(`${game.away} at ${game.home}: props could not be loaded.`);
          }
        }),
      );
    const league = deps.store.snapshot().leagues.find((l) => l.id === req.query.league);
    const rows = buildPropBoard({
      lines,
      games,
      forecasts: data.playerForecasts ?? [],
      stats: data.players,
      week,
      ...(league
        ? {
            rosters: league.teams.map((team) => ({
              teamName: team.name,
              players: (team.roster ?? []).map((p) => ({
                name: p.name,
                ...(p.nflTeam ? { nflTeam: p.nflTeam } : {}),
                ...(league.platform === 'espn'
                  ? { espnId: p.id }
                  : p.espnId
                    ? { espnId: p.espnId }
                    : {}),
              })),
            })),
          }
        : {}),
    });
    for (const row of rows) {
      if (!row.lean || row.projection === undefined || !row.kickoffAt) continue;
      if (Date.parse(row.kickoffAt) <= now()) continue;
      deps.leans.save({
        key: `${row.gameId}:${row.espnId ?? row.playerName}:${row.stat}`,
        gameId: row.gameId,
        kickoffAt: row.kickoffAt,
        playerName: row.playerName,
        ...(row.team ? { team: row.team } : {}),
        stat: row.stat,
        line: row.line,
        side: row.lean.side,
        strength: row.lean.strength,
        projection: row.projection,
        observedAt: at,
      });
    }
    grade(data.players);
    if (!games.length) warnings.push('No upcoming regular-season games were found.');
    else if (!data.playerForecasts?.length)
      warnings.push('ESPN weekly projections are unavailable, so leans can’t be shown.');
    res.json({
      season: data.season,
      ...(games.length ? { week } : {}),
      generatedAt: at,
      priced,
      games: games.map((g) => ({
        id: g.id,
        label: `${g.away} at ${g.home}`,
        kickoffAt: g.kickoffAt,
      })),
      rows,
      warnings,
      record: summarizePropLeans(deps.leans.list()),
    });
  });
  router.get('/api/props/record', async (_req, res) => {
    try {
      grade((await deps.data.get(seasonNow())).players);
    } catch {
      // Grading waits for the next successful stats load; saved results still show.
    }
    const records = deps.leans.list();
    res.json({
      record: summarizePropLeans(records),
      recent: records.filter((r) => r.result).slice(0, 40),
    });
  });
  return router;
}
