import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  buildMarketSignals,
  buildPropGameLog,
  freezeMarketResearch,
  footballStatKeys,
  isUpcomingFootballGame,
  nflTeamKey,
  type FootballDataSnapshot,
  type FootballGame,
  type ExternalTotalTape,
  type FootballStatKey,
  type MarketSignalsSnapshot,
  type SportsbookSnapshot,
  type FinalFootballResult,
  type RosterPlayer,
} from '@sidekick/core';
import type { FootballNewsSnapshot } from '@sidekick/integrations';
import type { MarketResearchStore } from './market-research-store.js';
import { playerPool } from './advice-player-pool.js';
export interface MarketResearchDependencies {
  data: { get(season: number): Promise<FootballDataSnapshot> };
  markets: {
    getTotal(
      game: FootballGame,
      provider: 'kalshi' | 'polymarket',
      cutoff: string,
      signal?: AbortSignal,
    ): Promise<ExternalTotalTape | undefined>;
  };
  odds: {
    get(game: FootballGame): Promise<SportsbookSnapshot>;
    result(game: FootballGame): Promise<FinalFootballResult | undefined>;
  };
  news: { get(): Promise<FootballNewsSnapshot>; getForAdvice?(): Promise<FootballNewsSnapshot> };
  catalog: () => Promise<Map<string, RosterPlayer>>;
  research: Pick<MarketResearchStore, 'list' | 'freeze' | 'settle'>;
  now?: () => number;
}
export function createMarketResearchRouter(deps: MarketResearchDependencies) {
  const router = Router(),
    now = deps.now ?? Date.now;
  const cache = new Map<string, MarketSignalsSnapshot>();
  let busy = false,
    checking = false,
    lastCheck = 0;
  const seasonNow = () =>
    new Date(now()).getUTCFullYear() - (new Date(now()).getUTCMonth() < 2 ? 1 : 0);
  router.get('/api/market-signals/games', async (_req, res) => {
    try {
      const season = seasonNow(),
        data = await deps.data.get(season);
      res.json({
        season,
        games: data.games
          .filter(
            (g) => g.season === season && isUpcomingFootballGame(g, new Date(now()).toISOString()),
          )
          .slice(0, 40),
      });
    } catch {
      res.status(502).json({ error: 'Upcoming NFL games could not be loaded.' });
    }
  });
  router.get('/api/market-signals/records', (_req, res) =>
    res.json({ records: deps.research.list() }),
  );
  router.get('/api/market-signals/export', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="sidekick-market-research.json"');
    res.json({
      version: 1,
      exportedAt: new Date(now()).toISOString(),
      records: deps.research.list(),
    });
  });
  router.post('/api/market-signals/capture', async (req, res) => {
    const b = req.body;
    if (
      !b ||
      typeof b !== 'object' ||
      Array.isArray(b) ||
      Object.keys(b).some((k) => !['gameId', 'provider', 'line'].includes(k)) ||
      typeof b.gameId !== 'string' ||
      b.gameId.length > 80 ||
      !['kalshi', 'polymarket'].includes(b.provider) ||
      typeof b.line !== 'number' ||
      !Number.isFinite(b.line) ||
      b.line < 1 ||
      b.line > 150 ||
      b.line % 1 !== 0.5
    )
      return res
        .status(400)
        .json({ error: 'Choose a game, provider and exact half-point game total.' });
    if (busy) return res.status(409).json({ error: 'A market capture is already running.' });
    busy = true;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 90000);
    const close = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', close);
    try {
      const data = await deps.data.get(seasonNow()),
        matches = data.games.filter((g) => g.id === b.gameId && g.season === seasonNow());
      if (
        matches.length !== 1 ||
        !isUpcomingFootballGame(matches[0]!, new Date(now()).toISOString())
      )
        return res
          .status(400)
          .json({ error: 'Choose a verified upcoming regular-season NFL game.' });
      const game = { ...matches[0]!, totalLine: b.line },
        cutoffAt = new Date(now()).toISOString();
      const [tape, odds, news] = await Promise.allSettled([
        deps.markets.getTotal(game, b.provider, cutoffAt, controller.signal),
        deps.odds.get(game),
        deps.news.getForAdvice ? deps.news.getForAdvice() : deps.news.get(),
      ]);
      controller.signal.throwIfAborted();
      const baseline =
        odds.status === 'fulfilled'
          ? odds.value.quotes.find(
              (q) => q.kind === 'total' && q.line === b.line && q.side === 'over',
            )
          : undefined;
      const snapshot = buildMarketSignals({
        id: randomUUID(),
        game,
        line: b.line,
        provider: b.provider,
        cutoffAt,
        capturedAt: new Date(now()).toISOString(),
        ...(tape.status === 'fulfilled' && tape.value ? { tape: tape.value } : {}),
        ...(baseline ? { baseline } : {}),
        ...(news.status === 'fulfilled' ? { news: news.value } : {}),
      });
      for (const [key, value] of cache)
        if (now() - Date.parse(value.capturedAt) > 300000) cache.delete(key);
      cache.set(snapshot.id, snapshot);
      while (cache.size > 20) cache.delete(cache.keys().next().value!);
      res.json(snapshot);
    } catch {
      res
        .status(502)
        .json({ error: 'Market data could not be verified. No research record was saved.' });
    } finally {
      clearTimeout(timer);
      res.off('close', close);
      busy = false;
    }
  });
  router.post('/api/market-signals/freeze', (req, res) => {
    if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.snapshotId !== 'string')
      return res.status(400).json({ error: 'Choose a current server-captured snapshot.' });
    const snapshot = cache.get(req.body.snapshotId);
    if (!snapshot)
      return res
        .status(409)
        .json({ error: 'Refresh signals before freezing a prospective record.' });
    try {
      return res
        .status(201)
        .json(deps.research.freeze(freezeMarketResearch(snapshot, new Date(now()).toISOString())));
    } catch (e) {
      return res
        .status(409)
        .json({ error: e instanceof Error ? e.message : 'This snapshot cannot be frozen.' });
    }
  });
  router.post('/api/market-signals/resolve', async (req, res) => {
    if (req.body && Object.keys(req.body).length)
      return res.status(400).json({ error: 'Result checks do not accept outcomes.' });
    if (checking) return res.status(409).json({ error: 'A result check is running.' });
    if (lastCheck && now() - lastCheck < 60000) return res.json({ records: deps.research.list() });
    checking = true;
    try {
      const due = deps.research
        .list()
        .filter((r) => !r.result && Date.parse(r.snapshot.game.kickoffAt!) < now() - 3 * 3600000)
        .slice(0, 24);
      const games = [...new Map(due.map((r) => [r.snapshot.game.id, r.snapshot.game])).values()];
      for (const game of games) {
        const final = await deps.odds.result(game).catch(() => undefined);
        if (
          !final ||
          final.gameId !== game.id ||
          final.espnId !== game.espnId ||
          final.home !== game.home ||
          final.away !== game.away ||
          final.kickoffAt !== game.kickoffAt
        )
          continue;
        for (const record of due.filter((r) => r.snapshot.game.id === game.id))
          deps.research.settle(record.id, {
            observedAt: final.observedAt,
            total: final.homeScore + final.awayScore,
            sourceUrl: final.sourceUrl,
          });
      }
      lastCheck = now();
      res.json({ records: deps.research.list() });
    } catch {
      res.status(502).json({ error: 'Results could not be checked. Frozen records are retained.' });
    } finally {
      checking = false;
    }
  });
  router.get('/api/player-props/log', async (req, res) => {
    if (
      Object.keys(req.query).some((k) => !['game', 'player', 'stat'].includes(k)) ||
      typeof req.query.game !== 'string' ||
      req.query.game.length > 80 ||
      typeof req.query.player !== 'string' ||
      req.query.player.length > 256 ||
      typeof req.query.stat !== 'string' ||
      !footballStatKeys.includes(req.query.stat as FootballStatKey)
    )
      return res.status(400).json({ error: 'Choose a game, player and statistic.' });
    try {
      const [data, catalog] = await Promise.all([deps.data.get(seasonNow()), deps.catalog()]);
      const games = data.games.filter((g) => g.id === req.query.game);
      const game = games.length === 1 ? games[0] : undefined;
      const player = playerPool(undefined, data, catalog, true).find(
        (p) => p.id === req.query.player,
      );
      if (
        !game ||
        !isUpcomingFootballGame(game, new Date(now()).toISOString()) ||
        !player?.gsisId ||
        ![game.home, game.away].map(nflTeamKey).includes(nflTeamKey(player.nflTeam ?? ''))
      )
        return res
          .status(404)
          .json({ error: 'The player could not be matched to this upcoming game.' });
      res.json(
        buildPropGameLog(
          player.gsisId,
          player.name,
          req.query.stat as FootballStatKey,
          data.players,
          data.games,
          new Date(now()).toISOString(),
        ),
      );
    } catch {
      res
        .status(502)
        .json({ error: 'Player game logs are unavailable. Missing stats are not zero.' });
    }
  });
  return router;
}
