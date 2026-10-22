import {
  predictionPerformance,
  recordClosingPrice,
  settlePredictionRecord,
  type FootballDataSnapshot,
  type FinalFootballResult,
  type FootballGame,
} from '@sidekick/core';
import type { AdviceDependencies } from './advice-service.js';
export function createPredictionPerformanceService(
  deps: Pick<AdviceDependencies, 'store' | 'data' | 'odds' | 'now'>,
) {
  let lastChecked = 0;
  const snapshot = () => predictionPerformance(deps.store.snapshot().predictionRecords ?? []);
  async function refresh(signal?: AbortSignal) {
    const now = deps.now ?? Date.now;
    if (lastChecked && now() - lastChecked < 300000)
      return {
        ...snapshot(),
        checkedAt: new Date(lastChecked).toISOString(),
        warnings: [
          ...snapshot().warnings,
          'Results were checked recently. Try again in a few minutes if outcome feeds are still updating.',
        ],
      };
    const records = deps.store.snapshot().predictionRecords ?? [];
    const due = records.filter(
      (r) => r.status !== 'settled' && r.games.every((g) => Date.parse(g.kickoffAt!) < now()),
    );
    const games = new Map<string, FootballGame>(),
      selected = new Set<string>();
    for (const r of due) {
      if (selected.size >= 200) break;
      const add = r.games.filter((g) => !games.has(g.id));
      if (games.size + add.length > 24) continue;
      selected.add(r.id);
      for (const g of add) games.set(g.id, { ...g });
    }
    const pending = [...games.values()],
      finals: FinalFootballResult[] = [];
    if (deps.odds)
      for (let i = 0; i < pending.length; i += 3) {
        signal?.throwIfAborted();
        const found = await Promise.all(
          pending.slice(i, i + 3).map((g) => deps.odds!.result(g).catch(() => undefined)),
        );
        for (const f of found) if (f) finals.push(f);
      }
    signal?.throwIfAborted();
    const fantasySeasons = [
      ...new Set(
        due
          .filter(
            (r) => selected.has(r.id) && (r.kind === 'fantasy' || r.terms?.kind === 'player-prop'),
          )
          .map((r) => r.season),
      ),
    ].slice(0, 3);
    const sources = new Map<number, FootballDataSnapshot>();
    const loaded = await Promise.allSettled(
      fantasySeasons.map((s) =>
        deps.data.outcomes
          ? deps.data.outcomes(
              s,
              finals
                .filter((f) =>
                  due.some((r) => r.season === s && r.games.some((g) => g.id === f.gameId)),
                )
                .map((f) => ({
                  ...games.get(f.gameId)!,
                  homeScore: f.homeScore,
                  awayScore: f.awayScore,
                })),
            )
          : deps.data.get(s),
      ),
    );
    loaded.forEach((r, i) => {
      if (r.status === 'fulfilled') sources.set(fantasySeasons[i]!, r.value);
    });
    const observedAt = new Date(now()).toISOString();
    signal?.throwIfAborted();
    await deps.store.update((state) => {
      signal?.throwIfAborted();
      state.predictionRecords = (state.predictionRecords ?? []).map((r) =>
        selected.has(r.id)
          ? settlePredictionRecord(
              r,
              sources.get(r.season) ?? {
                season: r.season,
                games: [],
                players: [],
                market: [],
                sources: [],
                warnings: [],
              },
              finals,
              observedAt,
            )
          : r,
      );
    });
    lastChecked = now();
    const report = snapshot();
    if (due.length > selected.size)
      report.warnings.push(
        'This bounded check covered part of the pending ledger. Check again later for remaining games.',
      );
    if (loaded.some((r) => r.status === 'rejected'))
      report.warnings.push(
        'Some player outcome feeds are unavailable. Their forecasts remain unresolved.',
      );
    return { ...report, checkedAt: observedAt };
  }
  /**
   * Updates the latest pregame price for pending bet records whose game starts within the hour.
   * Run every few minutes; the final run before kickoff leaves the closing price in place.
   */
  async function captureClosingLines(signal?: AbortSignal) {
    const now = (deps.now ?? Date.now)();
    if (!deps.odds) return 0;
    const records = deps.store.snapshot().predictionRecords ?? [];
    const games = new Map<string, FootballGame>();
    for (const r of records) {
      const game = r.games[0];
      if (r.kind !== 'bet' || !r.quote || r.status !== 'pending' || !game?.kickoffAt) continue;
      const untilKickoff = Date.parse(game.kickoffAt) - now;
      if (untilKickoff > 0 && untilKickoff <= 60 * 60_000 && games.size < 24)
        games.set(game.id, { ...game });
    }
    if (!games.size) return 0;
    const quotes = new Map<string, Awaited<ReturnType<NonNullable<typeof deps.odds>['get']>>>();
    for (const game of games.values()) {
      signal?.throwIfAborted();
      const snapshot = await deps.odds.get(game).catch(() => undefined);
      if (snapshot?.quotes.length) quotes.set(game.id, snapshot);
    }
    if (!quotes.size) return 0;
    const observedAt = new Date(now).toISOString();
    let updated = 0;
    await deps.store.update((state) => {
      state.predictionRecords = (state.predictionRecords ?? []).map((r) => {
        const snapshot = r.games[0] ? quotes.get(r.games[0].id) : undefined;
        if (!snapshot) return r;
        const next = recordClosingPrice(r, snapshot.quotes, observedAt);
        if (next !== r) updated++;
        return next;
      });
    });
    return updated;
  }
  return { snapshot, refresh, captureClosingLines };
}

/**
 * Background tracking: closing prices every 10 minutes and settlement every 30, so accuracy and
 * paper results stay current without a manual Refresh. Failures are logged by the caller only as
 * a fixed event name; feeds are retried on the next tick.
 */
export function startPredictionTracking(
  service: ReturnType<typeof createPredictionPerformanceService>,
  onError: (error: unknown) => void = () => undefined,
) {
  let ticks = 0,
    running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await service.captureClosingLines();
      if (ticks++ % 3 === 0) await service.refresh();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 10 * 60_000);
  timer.unref();
  return { tick, stop: () => clearInterval(timer) };
}
