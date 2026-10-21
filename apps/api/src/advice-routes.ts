import { freezeForecastProtocol } from './forecast-protocol.js';
import { Router } from 'express';
import { adviceJournal, isAdviceRequest, type AdviceRequest } from '@sidekick/core';
import type { LocalStore } from './store.js';
import { SignedInAIError, SignedInCodexError } from '@sidekick/integrations';
import { StartSitSelectionError } from '@sidekick/core';
import {
  createAdviceService,
  AdviceGameTimingError,
  AdviceQuoteError,
  type AdviceDependencies,
} from './advice-service.js';
import { createPredictionPerformanceService } from './prediction-performance.js';
import { runMarketBacktest } from './market-backtest.js';
import type { MarketBacktest } from '@sidekick/core';

/** Advice has no delivery or platform-write adapter. A paid analysis starts only on POST. */
export function createAdviceRouter(
  deps: AdviceDependencies & {
    store: Pick<LocalStore, 'snapshot' | 'settingsSnapshot' | 'update'>;
  },
) {
  const router = Router(),
    service = createAdviceService(deps);
  const running = new Map<string, { controller: AbortController; request: AdviceRequest }>();
  const performance = createPredictionPerformanceService(deps);
  let refreshingPerformance = false;
  let backtesting = false;
  let cachedBacktest: MarketBacktest | undefined;
  let testingConnection = false;
  router.get('/api/advice/odds', async (req, res) => {
    const date = new Date((deps.now ?? Date.now)());
    const season =
      req.query.season === undefined
        ? date.getUTCFullYear() - (date.getUTCMonth() < 2 ? 1 : 0)
        : Number(req.query.season);
    if (
      Object.keys(req.query).some((k) => !['game', 'season'].includes(k)) ||
      typeof req.query.game !== 'string' ||
      (req.query.season !== undefined && typeof req.query.season !== 'string') ||
      req.query.game.length > 80 ||
      !Number.isInteger(season) ||
      season < 2010 ||
      season > 2099
    )
      return res.status(400).json({ error: 'Choose a valid NFL game and season.' });
    try {
      const data = await deps.data.get(season);
      const games = data.games.filter((g) => g.id === req.query.game);
      if (games.length !== 1)
        return res.status(404).json({ error: 'The selected NFL game could not be verified.' });
      res.json(
        deps.odds
          ? await deps.odds.get(games[0]!)
          : {
              gameId: games[0]!.id,
              status: 'unavailable',
              quotes: [],
              warnings: ['Live prices are unavailable. Enter a verified price manually.'],
            },
      );
    } catch {
      res.status(502).json({
        error: 'Live NFL prices could not be loaded. Try again or enter a price manually.',
      });
    }
  });
  router.get('/api/advice/protocol', async (_req, res) => {
    const protocol = await freezeForecastProtocol(
      'market-context-v3',
      new Date((deps.now ?? Date.now)()).toISOString(),
    );
    if (!protocol)
      return res.status(503).json({
        error:
          'The installed numerical code could not be fingerprinted. These forecasts cannot enter the versioned prospective comparison.',
      });
    return res.json({ available: true, protocol });
  });
  // Deterministic and AI-free; safe to load whenever Home shows a selected team.
  router.get('/api/advice/briefing', async (req, res) => {
    if (
      Object.keys(req.query).some((k) => !['league', 'team'].includes(k)) ||
      typeof req.query.league !== 'string' ||
      typeof req.query.team !== 'string' ||
      req.query.league.length > 256 ||
      req.query.team.length > 256
    )
      return res.status(400).json({ error: 'Choose a connected league and team.' });
    try {
      res.json(await service.briefing(req.query.league, req.query.team));
    } catch (error) {
      const missing = error instanceof Error && /not in the connected league/.test(error.message);
      res.status(missing ? 404 : 502).json({
        error: missing
          ? 'That team is not in the connected league.'
          : 'Your weekly summary could not be prepared. Try again shortly.',
      });
    }
  });
  router.get('/api/advice/weekly', (req, res) => {
    if (
      Object.keys(req.query).some((k) => !['league', 'team'].includes(k)) ||
      typeof req.query.league !== 'string' ||
      typeof req.query.team !== 'string' ||
      req.query.league.length > 256 ||
      req.query.team.length > 256
    )
      return res.status(400).json({ error: 'Choose a connected league and team.' });
    const state = deps.store.snapshot();
    const league = state.leagues.find((l) => l.id === req.query.league);
    if (!league?.teams.some((t) => t.id === req.query.team))
      return res.status(404).json({ error: 'That team is not in the connected league.' });
    const now = (deps.now ?? Date.now)();
    const items = (state.adviceResults ?? [])
      .filter(
        (r) =>
          r.request.leagueId === league.id &&
          r.request.teamId === req.query.team &&
          ['lineup', 'trade', 'waivers'].includes(r.request.mode) &&
          r.week === league.settings.currentWeek &&
          r.season === league.season &&
          Date.parse(r.createdAt) <= now,
      )
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        mode: r.request.mode,
        headline: r.assessment.headline,
        createdAt: r.createdAt,
      }));
    return res.json({ items });
  });
  router.get('/api/advice/journal', (_req, res) =>
    res.json(adviceJournal(deps.store.snapshot().predictionRecords ?? [])),
  );
  router.get('/api/advice/performance', (_req, res) => res.json(performance.snapshot()));
  router.post('/api/advice/performance/backtest', async (req, res) => {
    if (backtesting)
      return res.status(409).json({ error: 'A historical price test is already running.' });
    if (
      req.body !== undefined &&
      (!req.body ||
        typeof req.body !== 'object' ||
        Array.isArray(req.body) ||
        Object.keys(req.body).length)
    )
      return res
        .status(400)
        .json({ error: 'The fixed historical test does not accept tuned thresholds or settings.' });
    if (
      cachedBacktest &&
      (deps.now ?? Date.now)() >= Date.parse(cachedBacktest.asOf) &&
      (deps.now ?? Date.now)() - Date.parse(cachedBacktest.asOf) < 21600000
    )
      return res.json(cachedBacktest);
    backtesting = true;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 145000);
    const close = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', close);
    try {
      const clock = new Date((deps.now ?? Date.now)());
      const season = clock.getUTCMonth() < 2 ? clock.getUTCFullYear() - 1 : clock.getUTCFullYear();
      let data = await deps.data.get(season);
      if (deps.pregame)
        data = await deps.pregame.history(
          data,
          new Date((deps.now ?? Date.now)()).toISOString(),
          controller.signal,
        );
      controller.signal.throwIfAborted();
      const report = await runMarketBacktest(
        data,
        [season - 2, season - 1],
        new Date((deps.now ?? Date.now)()).toISOString(),
        controller.signal,
      );
      controller.signal.throwIfAborted();
      cachedBacktest = report;
      res.json(report);
    } catch {
      if (!res.destroyed)
        res.status(502).json({
          error:
            'The historical price test could not finish. No forecast history or settings were changed. Try again later.',
        });
    } finally {
      clearTimeout(timer);
      res.off('close', close);
      backtesting = false;
    }
  });
  router.get('/api/advice/performance/export', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="sidekick-prediction-records.json"');
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      records: deps.store.snapshot().predictionRecords ?? [],
    });
  });
  router.delete('/api/advice/performance', async (_req, res) => {
    if (refreshingPerformance)
      return res
        .status(409)
        .json({ error: 'Wait for the result check before clearing the track record.' });
    await deps.store.update((state) => {
      state.predictionRecords = [];
    });
    res.status(204).end();
  });
  router.post('/api/advice/performance/refresh', async (req, res) => {
    if (refreshingPerformance)
      return res.status(409).json({ error: 'A result check is already running.' });
    if (
      req.body !== undefined &&
      (!req.body ||
        typeof req.body !== 'object' ||
        Array.isArray(req.body) ||
        Object.keys(req.body).length)
    )
      return res
        .status(400)
        .json({ error: 'Result checks do not accept settings or forecast inputs.' });
    refreshingPerformance = true;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 90000);
    const close = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', close);
    try {
      const report = await performance.refresh(controller.signal);
      if (!controller.signal.aborted) res.json(report);
    } catch {
      if (!res.destroyed)
        res.status(502).json({
          error: 'Results could not be checked. Saved forecasts are retained; try again later.',
        });
    } finally {
      clearTimeout(timer);
      res.off('close', close);
      refreshingPerformance = false;
    }
  });
  let warming = false;
  // Read-only and data-free: fetches only public stats and the player catalog, never AI.
  router.post('/api/advice/warm', (_req, res) => {
    if (!warming) {
      warming = true;
      void service.warm().finally(() => {
        warming = false;
      });
    }
    res.status(202).json({ warming: true });
  });
  router.post('/api/advice/readiness', async (req, res) => {
    if (!isAdviceRequest(req.body))
      return res
        .status(400)
        .json({ error: 'Choose valid advice inputs before checking readiness.' });
    try {
      res.json(await service.readiness(req.body));
    } catch {
      res.status(502).json({
        error:
          'Data readiness could not be checked. No AI analysis was started. Refresh the league or try again.',
      });
    }
  });
  router.get('/api/advice/options', async (req, res) => {
    if (
      Object.keys(req.query).some(
        (key) => !['mode', 'league', 'season', 'week', 'connection'].includes(key),
      ) ||
      Object.values(req.query).some((value) => typeof value !== 'string')
    )
      return res.status(400).json({ error: 'Choose valid advice options.' });
    const mode = typeof req.query.mode === 'string' ? req.query.mode : 'lineup';
    if (!['draft-plan', 'draft-review', 'lineup', 'trade', 'waivers', 'betting'].includes(mode))
      return res.status(400).json({ error: 'Choose an advice type.' });
    const season = req.query.season === undefined ? undefined : Number(req.query.season),
      week = req.query.week === undefined ? undefined : Number(req.query.week);
    if (
      (season !== undefined && (!Number.isInteger(season) || season < 2010 || season > 2099)) ||
      (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 18))
    )
      return res.status(400).json({ error: 'Choose a valid season and NFL week.' });
    if (
      req.query.connection !== undefined &&
      (typeof req.query.connection !== 'string' ||
        !['saved', 'claude-cli', 'codex-cli'].includes(req.query.connection))
    )
      return res.status(400).json({ error: 'Choose an available AI connection.' });
    try {
      res.json(
        await service.options({
          mode: mode as AdviceRequest['mode'],
          ...(req.query.connection
            ? { connection: req.query.connection as NonNullable<AdviceRequest['connection']> }
            : {}),
          ...(typeof req.query.league === 'string'
            ? { leagueId: req.query.league.slice(0, 256) }
            : {}),
          ...(season !== undefined ? { season } : {}),
          ...(week !== undefined ? { week } : {}),
        }),
      );
    } catch {
      res.status(502).json({
        error: 'Could not load advice choices. Refresh the league or try public data again.',
      });
    }
  });
  router.get('/api/advice', (_req, res) =>
    res.json({
      items: (deps.store.snapshot().adviceResults ?? []).map((result) => ({
        id: result.id,
        createdAt: result.createdAt,
        mode: result.request.mode,
        leagueId: result.request.leagueId,
        headline: result.assessment.headline,
        confidence: result.confidence.score,
        confidenceLabel: result.confidence.label,
        model: result.model,
      })),
    }),
  );
  router.get('/api/advice/:id', (req, res) => {
    const result = deps.store.snapshot().adviceResults?.find((item) => item.id === req.params.id);
    if (result) return res.json(result);
    if (running.has(req.params.id)) return res.status(202).json({ status: 'running' });
    res.status(404).json({ error: 'No completed advice was saved for this request.' });
  });
  router.delete('/api/advice/:id', async (req, res) => {
    running.get(req.params.id)?.controller.abort();
    await deps.store.update((state) => {
      state.adviceResults = (state.adviceResults ?? []).filter((item) => item.id !== req.params.id);
    });
    res.status(204).end();
  });
  router.post('/api/advice/connection-test', async (req, res) => {
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body) ||
      !['claude-cli', 'codex-cli'].includes(req.body.connection) ||
      Object.keys(req.body).length !== 1
    )
      return res.status(400).json({ error: 'Choose an installed signed-in AI connection.' });
    if (running.size || testingConnection)
      return res
        .status(409)
        .json({ error: 'Wait for the current AI request or cancel it before testing.' });
    testingConnection = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    const close = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', close);
    try {
      await service.testConnection(req.body.connection, controller.signal);
      if (!controller.signal.aborted) res.json({ ok: true });
    } catch (error) {
      if (!res.destroyed)
        res.status(controller.signal.aborted ? 408 : 502).json({
          error: `${error instanceof SignedInAIError || error instanceof SignedInCodexError ? error.message : `${req.body.connection === 'codex-cli' ? 'Codex' : 'Claude'} could not complete the test. Check access in the installed CLI, then reload connections.`} No league data was shared.`,
        });
    } finally {
      clearTimeout(timeout);
      res.off('close', close);
      testingConnection = false;
    }
  });
  router.post('/api/advice/:id', async (req, res) => {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id) ||
      !isAdviceRequest(req.body)
    )
      return res.status(400).json({
        error: 'Choose a league/team or NFL bet with valid players, week, line and odds.',
      });
    const request = req.body as AdviceRequest;
    const saved = deps.store.snapshot().adviceResults?.find((item) => item.id === req.params.id);
    if (saved)
      return JSON.stringify(saved.request) === JSON.stringify(request)
        ? res.json(saved)
        : res.status(409).json({
            error:
              'This advice request was already used for different choices. Start a new analysis.',
          });
    if (
      request.dropPlayerId &&
      !deps.store
        .snapshot()
        .leagues.find((league) => league.id === request.leagueId)
        ?.teams.find((team) => team.id === request.teamId)
        ?.roster?.some((player) => player.id === request.dropPlayerId)
    )
      return res
        .status(400)
        .json({ error: 'Choose an owned player to drop. Refresh rosters if ownership changed.' });
    if (running.size || testingConnection)
      return res.status(409).json({
        error:
          'An advice analysis is already running. Wait for it or cancel it before starting another.',
      });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);
    const close = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', close);
    running.set(req.params.id, { controller, request });
    try {
      const result = await service.analyze(request, controller.signal, req.params.id);
      if (!controller.signal.aborted) res.status(201).json(result);
    } catch (error) {
      if (!res.destroyed)
        res
          .status(
            controller.signal.aborted
              ? 408
              : error instanceof AdviceQuoteError
                ? 409
                : error instanceof StartSitSelectionError
                  ? 400
                  : 502,
          )
          .json({
            error: controller.signal.aborted
              ? 'Advice was canceled or timed out. Check saved advice before retrying.'
              : error instanceof AdviceQuoteError
                ? error.message
                : error instanceof AdviceGameTimingError
                  ? 'This game is not verified as upcoming. Choose another game and check its current odds. No advice was saved.'
                  : error instanceof SignedInAIError || error instanceof SignedInCodexError
                    ? `${error.message} No unverified result was saved.`
                    : error instanceof StartSitSelectionError
                      ? `${error.message} No analysis was generated or saved.`
                      : 'The advice could not be verified. Check your AI connection, player selections and available evidence, then try again. No unverified result was saved.',
          });
    } finally {
      clearTimeout(timeout);
      res.off('close', close);
      running.delete(req.params.id);
    }
  });
  return router;
}
