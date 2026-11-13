import {
  buildBetForecast,
  capturePredictionRecords,
  isUpcomingFootballGame,
  nflSeasonFor,
  type AdviceResult,
  type BetTerms,
  type PredictionRecord,
  type FootballGame,
  type SportsbookQuote,
} from '@sidekick/core';
import type { PublicFootballData, PublicSportsbookLines } from '@sidekick/integrations';
import { freezeForecastProtocol } from './forecast-protocol.js';
import { appendPredictionRecords } from './prediction-ledger.js';
import type { LocalStore } from './store.js';

/** One market per game and kind: the home moneyline and spread and the over of the total. */
const markets: { kind: SportsbookQuote['kind']; side: SportsbookQuote['side'] }[] = [
  { kind: 'moneyline', side: 'home' },
  { kind: 'spread', side: 'home' },
  { kind: 'total', side: 'over' },
];

/**
 * Records the game model's forecast for every game of the coming week, once a day, so the bet
 * model builds a track record without anyone asking for advice. Never selected as a bet: these
 * are forecasts to grade, not picks. Only the earliest saved forecast per game and market counts.
 */
export async function captureWeeklyBetForecasts(deps: {
  store: Pick<LocalStore, 'snapshot' | 'update'>;
  data: Pick<PublicFootballData, 'get'>;
  odds: Pick<PublicSportsbookLines, 'get'>;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  const asOf = new Date(now()).toISOString();
  const data = await deps.data.get(nflSeasonFor(now()));
  const upcoming = data.games.filter(
    (g) => g.season === data.season && g.seasonType === 'REG' && isUpcomingFootballGame(g, asOf),
  );
  if (!upcoming.length) return 0;
  const week = Math.min(...upcoming.map((g) => g.week));
  const existing = new Set((deps.store.snapshot().predictionRecords ?? []).map((r) => r.id));
  const fresh: PredictionRecord[] = [];
  for (const game of upcoming.filter((g: FootballGame) => g.week === week)) {
    const id = (kind: string) => `auto-bet-${game.id}-${kind}`;
    if (markets.every((m) => [...existing].some((r) => r.startsWith(`${id(m.kind)}:`)))) continue;
    const snapshot = await deps.odds.get(game).catch(() => undefined);
    if (!snapshot || snapshot.status !== 'available') continue;
    // Recorded after the price was read: a record can't predate the quote it was made from.
    const recordedAt = new Date(now()).toISOString();
    for (const market of markets) {
      if ([...existing].some((r) => r.startsWith(`${id(market.kind)}:`))) continue;
      const quote = snapshot.quotes.find((q) => q.kind === market.kind && q.side === market.side);
      if (!quote) continue;
      const terms: BetTerms = {
        quoteId: quote.id,
        kind: quote.kind,
        gameId: game.id,
        side: quote.side,
        ...(quote.line !== undefined ? { line: quote.line } : {}),
        americanOdds: quote.americanOdds,
        oppositeAmericanOdds: quote.oppositeAmericanOdds,
      };
      const { forecast } = buildBetForecast(terms, data, recordedAt);
      if (!forecast) continue;
      const result = {
        id: id(market.kind),
        request: { mode: 'betting', bet: terms },
        betHistory: { forecast },
        assessment: { verdict: 'hold' },
        model: 'none',
      } as unknown as AdviceResult;
      const protocol = await freezeForecastProtocol(forecast.method, recordedAt);
      for (const record of capturePredictionRecords(
        result,
        data,
        undefined,
        [],
        recordedAt,
        quote,
      )) {
        if (protocol) record.protocol = protocol;
        fresh.push(record);
      }
    }
  }
  if (fresh.length)
    await deps.store.update((state) => {
      appendPredictionRecords(state, fresh);
    });
  return fresh.length;
}
