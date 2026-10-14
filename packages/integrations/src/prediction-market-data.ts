import { createHash } from 'node:crypto';
import {
  nflTeamKey,
  validateExternalTotalTape,
  type FootballGame,
  type ExternalTotalTape,
  type ExternalTotalTrade,
} from '@sidekick/core';
import { readBoundedText } from './http.js';
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const rows = (v: unknown, max = 1000): unknown[] => {
  if (!Array.isArray(v) || v.length > max) throw new Error('Invalid prediction-market rows.');
  return v;
};
const stamp = (v: unknown) => {
  if (typeof v !== 'string' || v.length > 40 || !Number.isFinite(Date.parse(v)))
    throw new Error('Invalid market time.');
  return new Date(v).toISOString();
};
const numeric = (v: unknown, lo: number, hi: number) => {
  if (typeof v !== 'number' && (typeof v !== 'string' || !/^\d+(?:\.\d+)?$/.test(v)))
    throw new Error('Invalid market number.');
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error('Invalid market number.');
  return n;
};
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const code = (t: string) =>
  (({ LA: 'LAR' }) as Record<string, string>)[nflTeamKey(t)] ?? nflTeamKey(t);
export function predictionGameKeys(g: FootballGame) {
  if (
    g.seasonType !== 'REG' ||
    !g.kickoffAt ||
    !/^\d{4}-\d{2}-\d{2}$/.test(g.date) ||
    !/^[A-Z]{2,3}$/.test(code(g.home)) ||
    !/^[A-Z]{2,3}$/.test(code(g.away))
  )
    throw new Error('Invalid prediction-market game.');
  const [year, month, day] = g.date.split('-'),
    months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return {
    kalshi: `KXNFLTOTAL-${year!.slice(2)}${months[Number(month) - 1]}${day}${code(g.away)}${code(g.home)}`,
    polymarket: `nfl-${code(g.away).toLowerCase()}-${code(g.home).toLowerCase()}-${g.date}`,
  };
}
export interface PredictionContract {
  provider: 'kalshi' | 'polymarket';
  id: string;
  createdAt: string;
  line: number;
  tokens?: [string, string];
}
function eligible(g: FootballGame, cutoff: string) {
  predictionGameKeys(g);
  if (
    !g.kickoffAt ||
    !Number.isFinite(Date.parse(cutoff)) ||
    Date.parse(cutoff) >= Date.parse(g.kickoffAt) ||
    !Number.isFinite(g.totalLine) ||
    g.totalLine! % 1 !== 0.5
  )
    throw new Error('Unsupported totals contract cutoff.');
}
export function parseKalshiTotalContract(
  input: unknown,
  g: FootballGame,
  cutoff: string,
): PredictionContract | undefined {
  eligible(g, cutoff);
  const response = object(input),
    matches = rows(response.markets).flatMap((v) => {
      const r = object(v);
      if (
        r.event_ticker !== predictionGameKeys(g).kalshi ||
        r.market_type !== 'binary' ||
        r.strike_type !== 'greater' ||
        r.floor_strike !== g.totalLine
      )
        return [];
      const title = `Full Game: over ${g.totalLine} points scored?`;
      if (
        r.title !== title ||
        typeof r.rules_primary !== 'string' ||
        r.rules_primary.length > 8000 ||
        !r.rules_primary.includes(`collectively score more than ${g.totalLine} points`) ||
        !r.rules_primary.includes('Pro Football game')
      )
        return [];
      const createdAt = stamp(r.created_time);
      if (
        Date.parse(createdAt) > Date.parse(cutoff) ||
        Date.parse(stamp(r.open_time)) > Date.parse(cutoff)
      )
        return [];
      if (
        typeof r.ticker !== 'string' ||
        !r.ticker.startsWith(predictionGameKeys(g).kalshi + '-') ||
        !/^[A-Z0-9-]{1,100}$/.test(r.ticker)
      )
        throw new Error('Invalid Kalshi identity.');
      return [{ provider: 'kalshi' as const, id: r.ticker, createdAt, line: g.totalLine! }];
    });
  if (typeof response.cursor !== 'string' || response.cursor)
    throw new Error('Truncated Kalshi discovery.');
  if (matches.length > 1) throw new Error('Ambiguous Kalshi total.');
  return matches[0];
}
export function parsePolymarketTotalContract(
  input: unknown,
  g: FootballGame,
  cutoff: string,
): PredictionContract | undefined {
  eligible(g, cutoff);
  const slug = predictionGameKeys(g).polymarket,
    events = rows(input, 5).filter((v) => object(v).slug === slug);
  if (events.length > 1) throw new Error('Ambiguous Polymarket event.');
  if (!events.length) return;
  const matches = rows(object(events[0]).markets).flatMap((v) => {
    const r = object(v);
    if (
      r.sportsMarketType !== 'totals' ||
      r.line !== g.totalLine ||
      r.slug !== `${slug}-total-${String(g.totalLine).replace('.', 'pt')}`
    )
      return [];
    if (
      typeof r.question !== 'string' ||
      !r.question.endsWith(`: O/U ${g.totalLine}`) ||
      typeof r.description !== 'string' ||
      !r.description.includes('In the upcoming NFL game') ||
      !r.description.includes(`combine to score ${Math.ceil(g.totalLine!)} or more points`)
    )
      return [];
    if (stamp(r.gameStartTime) !== g.kickoffAt) return [];
    const createdAt = stamp(r.createdAt);
    if (Date.parse(createdAt) > Date.parse(cutoff)) return [];
    if (
      typeof r.conditionId !== 'string' ||
      !/^0x[a-fA-F0-9]{64}$/.test(r.conditionId) ||
      typeof r.clobTokenIds !== 'string' ||
      r.clobTokenIds.length > 300 ||
      typeof r.outcomes !== 'string' ||
      r.outcomes.length > 100
    )
      throw new Error('Invalid Polymarket identity.');
    const tokens = JSON.parse(r.clobTokenIds) as unknown,
      outcomes = JSON.parse(r.outcomes) as unknown;
    if (
      !Array.isArray(tokens) ||
      tokens.length !== 2 ||
      !tokens.every((t) => typeof t === 'string' && /^\d{1,100}$/.test(t)) ||
      !Array.isArray(outcomes) ||
      outcomes.length !== 2 ||
      !outcomes.includes('Over') ||
      !outcomes.includes('Under') ||
      tokens[0] === tokens[1]
    )
      throw new Error('Invalid Polymarket outcomes.');
    return [
      {
        provider: 'polymarket' as const,
        id: r.conditionId.toLowerCase(),
        createdAt,
        line: g.totalLine!,
        tokens: [tokens[outcomes.indexOf('Over')], tokens[outcomes.indexOf('Under')]] as [
          string,
          string,
        ],
      },
    ];
  });
  if (matches.length > 1) throw new Error('Ambiguous Polymarket total.');
  return matches[0];
}
export function parseKalshiPrices(
  input: unknown,
  from: string,
  cutoff: string,
): ExternalTotalTape['prices'] {
  return rows(object(input).candlesticks, 2000).flatMap((v) => {
    const r = object(v),
      end = numeric(r.end_period_ts, 0, 4102444800) * 1000;
    if (end < Date.parse(from) || end > Date.parse(cutoff)) return [];
    const bid = object(r.yes_bid).close_dollars,
      ask = object(r.yes_ask).close_dollars;
    if (bid === null || bid === undefined || ask === null || ask === undefined) return [];
    const b = numeric(bid, 0, 1),
      a = numeric(ask, 0, 1);
    if (b > a) throw new Error('Crossed prediction-market quote.');
    return b > 0 && a < 1 && a - b <= 0.2
      ? [{ at: new Date(end).toISOString(), probability: (a + b) / 2, spread: a - b }]
      : [];
  });
}
/** Reject every resolution/exact terminal point: settled payouts can be clamped to the requested end.
 * An aggregate is usable only after its entire observation window ends before the cutoff.
 */
export function parsePolymarketPrices(
  input: unknown,
  from: string,
  cutoff: string,
): ExternalTotalTape['prices'] {
  const r = object(input),
    p = object(r.pagination);
  if (p.has_more !== false) throw new Error('Truncated price history.');
  return rows(r.data, 2000).flatMap((v) => {
    const t = object(v),
      at = numeric(t.timestamp, 0, 4102444800),
      width = numeric(t.resolution_seconds, 0, 86400),
      price = numeric(t.price, 0, 1);
    const end = (at + width) * 1000;
    return width > 0 &&
      end >= Date.parse(from) &&
      end <= Date.parse(cutoff) &&
      price > 0 &&
      price < 1
      ? [{ at: new Date(end).toISOString(), probability: price }]
      : [];
  });
}
export function parsePredictionTrades(
  input: unknown,
  c: PredictionContract,
  from: string,
  cutoff: string,
): { trades: ExternalTotalTrade[]; cursor: string; older: boolean } {
  const r = object(input),
    p = object(r.pagination),
    raw = rows(c.provider === 'kalshi' ? r.trades : r.data),
    trades: ExternalTotalTrade[] = [];
  let older = false;
  const cursor = c.provider === 'kalshi' ? r.cursor : p.next_cursor;
  if (
    cursor !== null &&
    (typeof cursor !== 'string' || cursor.length > 8192 || /[\u0000-\u001f]/.test(cursor))
  )
    throw new Error('Invalid market cursor.');
  if (c.provider === 'polymarket' && typeof p.has_more !== 'boolean')
    throw new Error('Missing pagination state.');
  if (c.provider === 'polymarket' && p.has_more !== Boolean(cursor))
    throw new Error('Contradictory market cursor.');
  for (const value of raw) {
    const t = object(value),
      at =
        c.provider === 'kalshi'
          ? stamp(t.created_time)
          : new Date(numeric(t.timestamp, 0, 4102444800) * 1000).toISOString();
    if (Date.parse(at) < Date.parse(from)) {
      older = true;
      continue;
    }
    if (Date.parse(at) > Date.parse(cutoff)) continue;
    if (c.provider === 'kalshi') {
      if (
        t.ticker !== c.id ||
        typeof t.trade_id !== 'string' ||
        !/^[a-f0-9-]{1,80}$/.test(t.trade_id) ||
        !['yes', 'no'].includes(String(t.taker_outcome_side)) ||
        !['ask', 'bid'].includes(String(t.taker_book_side))
      )
        throw new Error('Invalid Kalshi trade identity/direction.');
      const overProbability = numeric(t.yes_price_dollars, 0, 1),
        no = numeric(t.no_price_dollars, 0, 1);
      if (Math.abs(overProbability + no - 1) > 0.00001)
        throw new Error('Inconsistent Kalshi prices.');
      const isYes = t.taker_outcome_side === 'yes',
        buy = t.taker_book_side === 'ask';
      trades.push({
        id: t.trade_id,
        at,
        shares: numeric(t.count_fp, 0.000001, 10000000),
        price: isYes ? overProbability : no,
        overProbability,
        direction: isYes === buy ? 1 : -1,
      });
    } else {
      if (
        t.condition_id !== c.id ||
        typeof t.token_id !== 'string' ||
        !c.tokens?.includes(t.token_id) ||
        !['BUY', 'SELL'].includes(String(t.side)) ||
        typeof t.transaction_hash !== 'string' ||
        !/^0x[a-fA-F0-9]{64}$/.test(t.transaction_hash) ||
        typeof t.proxy_wallet !== 'string' ||
        !/^0x[a-fA-F0-9]{40}$/.test(t.proxy_wallet)
      )
        throw new Error('Invalid Polymarket trade identity/direction.');
      const over = t.token_id === c.tokens[0],
        buy = t.side === 'BUY',
        price = numeric(t.price, 0, 1),
        shares = numeric(t.size, 0.000001, 10000000),
        walletHash = hash(t.proxy_wallet.toLowerCase());
      trades.push({
        id: hash(
          JSON.stringify([t.transaction_hash, t.token_id, t.side, at, shares, price, walletHash]),
        ),
        at,
        shares,
        price,
        overProbability: over ? price : 1 - price,
        direction: over === buy ? 1 : -1,
        walletHash,
      });
    }
  }
  return { trades, cursor: typeof cursor === 'string' ? cursor : '', older };
}
export interface PredictionResponseEvidence {
  url: string;
  capturedAt: string;
  sha256: string;
  bytes: number;
  status: number;
}
export class PublicPredictionMarketData {
  private kalshiQueue: Promise<void> = Promise.resolve();
  constructor(
    private fetcher: typeof fetch = fetch,
    private now: () => number = Date.now,
    private saveResponse?: (e: PredictionResponseEvidence, text: string) => Promise<void>,
  ) {}
  private async get(url: string) {
    if (url.startsWith('https://external-api.kalshi.com/')) {
      const turn = this.kalshiQueue.then(
        () => new Promise<void>((resolve) => setTimeout(resolve, 300)),
      );
      this.kalshiQueue = turn.catch(() => undefined);
      await turn;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await this.fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { accept: 'application/json' },
      });
      const text = await readBoundedText(response, 2000000),
        evidence = {
          url,
          capturedAt: new Date(this.now()).toISOString(),
          sha256: hash(text),
          bytes: Buffer.byteLength(text),
          status: response.status,
        };
      await this.saveResponse?.(evidence, text);
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const requested = Number(response.headers.get('retry-after'));
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(
              10000,
              Math.max(1000 * 2 ** attempt, Number.isFinite(requested) ? requested * 1000 : 0),
            ),
          ),
        );
        continue;
      }
      if (!response.ok) throw new Error(`Prediction-market read failed (${response.status}).`);
      return JSON.parse(text) as unknown;
    }
    throw new Error('Prediction-market retries exhausted.');
  }
  async getTotal(
    g: FootballGame,
    provider: 'kalshi' | 'polymarket',
    cutoff: string,
  ): Promise<ExternalTotalTape | undefined> {
    eligible(g, cutoff);
    if (Date.parse(cutoff) > this.now()) throw new Error('Future cutoff unavailable.');
    const keys = predictionGameKeys(g),
      root =
        provider === 'kalshi'
          ? 'https://external-api.kalshi.com/trade-api/v2'
          : 'https://data-api.polymarket.com/v2';
    const discover =
      provider === 'kalshi'
        ? `${root}/markets?event_ticker=${keys.kalshi}&limit=1000`
        : `https://gamma-api.polymarket.com/events?slug=${keys.polymarket}`;
    const c =
      provider === 'kalshi'
        ? parseKalshiTotalContract(await this.get(discover), g, cutoff)
        : parsePolymarketTotalContract(await this.get(discover), g, cutoff);
    if (!c) return;
    const from = new Date(Date.parse(cutoff) - 86400000).toISOString(),
      start = Math.floor(Date.parse(from) / 1000),
      end = Math.floor(Date.parse(cutoff) / 1000);
    const priceURL =
      provider === 'kalshi'
        ? `${root}/series/KXNFLTOTAL/markets/${c.id}/candlesticks?start_ts=${start}&end_ts=${end}&period_interval=60`
        : `${root}/prices-history?token_id=${c.tokens![0]}&start=${start}&end=${end}&bucket_seconds=300&limit=1000`;
    const prices =
      provider === 'kalshi'
        ? parseKalshiPrices(await this.get(priceURL), from, cutoff)
        : parsePolymarketPrices(await this.get(priceURL), from, cutoff);
    let cursor = '',
      complete = false;
    const trades: ExternalTotalTrade[] = [],
      seen = new Set<string>();
    for (let page = 0; page < 12; page++) {
      const tradeURL = new URL(provider === 'kalshi' ? `${root}/markets/trades` : `${root}/trades`);
      tradeURL.searchParams.set(provider === 'kalshi' ? 'ticker' : 'condition', c.id);
      tradeURL.searchParams.set('limit', '1000');
      if (provider === 'kalshi') {
        tradeURL.searchParams.set('min_ts', String(start));
        tradeURL.searchParams.set('max_ts', String(end));
      } else tradeURL.searchParams.set('taker_only', 'true');
      if (cursor) tradeURL.searchParams.set('cursor', cursor);
      const result = parsePredictionTrades(await this.get(tradeURL.href), c, from, cutoff);
      trades.push(...result.trades);
      if (!result.cursor) {
        complete = true;
        break;
      }
      // Polymarket market feeds ignore start/end; no ordering contract is assumed.
      if (seen.has(result.cursor)) throw new Error('Repeated market cursor.');
      seen.add(result.cursor);
      cursor = result.cursor;
    }
    const tape: ExternalTotalTape = {
      provider,
      gameId: g.id,
      contractId: c.id,
      line: c.line,
      kickoffAt: g.kickoffAt!,
      cutoffAt: cutoff,
      capturedAt: new Date(this.now()).toISOString(),
      createdAt: c.createdAt,
      windowStartAt: from,
      complete,
      trades,
      prices,
    };
    validateExternalTotalTape(tape);
    return tape;
  }
}
