import { nflSeasonFor } from '@sidekick/core';
import Database from 'better-sqlite3';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Router } from 'express';
import {
  buildPropBoard,
  defaultMarketWeight,
  fitMarketWeight,
  propModelSettings,
  propModelStats,
  type PropModelStat,
  gradePropLean,
  isUpcomingFootballGame,
  summarizePropLeans,
  type FootballGame,
  type PropLeanRecord,
  type PropLine,
} from '@sidekick/core';
import type { PublicFootballData, PublicPropLines, PublicUsageData } from '@sidekick/integrations';
import { propModelFor } from './prop-model-runtime.js';
import type { LocalStore } from './store.js';
import type { PropLineLedger } from './prop-line-ledger.js';

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
  delete(key: string) {
    this.db.prepare('DELETE FROM leans WHERE key = ?').run(key);
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

function gradedForFit(records: PropLeanRecord[]) {
  return records.flatMap((r) =>
    r.result &&
    r.result.outcome !== 'push' &&
    r.modelMean !== undefined &&
    (propModelStats as readonly string[]).includes(r.stat)
      ? [
          {
            line: r.line,
            mean: r.modelMean,
            stat: r.stat as PropModelStat,
            over: r.result.actual > r.line,
          },
        ]
      : [],
  );
}
/** The model's weight against the line, refit from graded props once there are enough. */
function marketWeightFromResults(records: PropLeanRecord[]) {
  return fitMarketWeight(gradedForFit(records), propModelSettings);
}

export function createPropBoardRouter(deps: {
  data: Pick<PublicFootballData, 'get'>;
  props: Pick<PublicPropLines, 'props'>;
  store: Pick<LocalStore, 'snapshot'>;
  leans: PropLeanStore;
  /** Snap counts and depth charts for the prop model; without them those features stay off. */
  usage?: Pick<PublicUsageData, 'get'>;
  /** Optional: every line the board fetches is also kept in the line ledger. */
  ledger?: PropLineLedger;
  now?: () => number;
}) {
  const router = Router();
  const now = deps.now ?? Date.now;
  const seasonNow = () => nflSeasonFor(now());
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
    deps.ledger?.record(lines, games, at);
    const league = deps.store.snapshot().leagues.find((l) => l.id === req.query.league);
    const model = propModelFor(data, await deps.usage?.get(data.season).catch(() => undefined));
    const fitted = marketWeightFromResults(deps.leans.list());
    const rows = buildPropBoard({
      lines,
      games,
      forecasts: data.playerForecasts ?? [],
      stats: data.players,
      week,
      predict: (line, game, team, espnProjection) =>
        model.predict({
          stat: line.stat,
          playerName: line.playerName,
          team,
          game,
          line: line.line,
          marketWeight: fitted?.weight ?? defaultMarketWeight,
          ...(espnProjection !== undefined ? { espnProjection } : {}),
        }),
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
      if (!row.kickoffAt || Date.parse(row.kickoffAt) <= now()) continue;
      const key = `${row.gameId}:${row.espnId ?? row.playerName}:${row.stat}`;
      // Before kickoff a prop that no longer leans must not keep an earlier saved lean.
      if (!row.lean || !row.model) {
        deps.leans.delete(key);
        continue;
      }
      deps.leans.save({
        key,
        gameId: row.gameId,
        kickoffAt: row.kickoffAt,
        playerName: row.playerName,
        ...(row.team ? { team: row.team } : {}),
        stat: row.stat,
        line: row.line,
        side: row.lean.side,
        strength: row.lean.strength,
        projection: row.projection ?? row.model.mean,
        ...(row.model ? { overChance: row.model.overChance, modelMean: row.model.mean } : {}),
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
      ...(deps.ledger ? { ledger: deps.ledger.summary() } : {}),
      model: {
        marketWeight: fitted?.weight ?? defaultMarketWeight,
        fitted: Boolean(fitted),
        gradedForFit: gradedForFit(deps.leans.list()).length,
      },
    });
  });
  // Saved line and price history for research, optionally for one game.
  router.get('/api/props/lines', (req, res) => {
    const game = req.query.game;
    if (
      Object.keys(req.query).some((k) => k !== 'game') ||
      (game !== undefined && (typeof game !== 'string' || !/^[\w-]{1,80}$/.test(game)))
    )
      return res.status(400).json({ error: 'Choose a valid NFL game.' });
    if (!deps.ledger) return res.json({ items: [] });
    res.json({ items: deps.ledger.list(game as string | undefined) });
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
