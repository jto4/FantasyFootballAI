import { createHash } from 'node:crypto';
import {
  validateExpandedTotalTape,
  type ExpandedTotalTape,
  type FootballGame,
  type ExternalTotalTape,
  type ExternalTotalTrade,
} from '@sidekick/core';
import {
  predictionGameKeys,
  parsePredictionTrades,
  parsePolymarketPrices,
  parseKalshiPrices,
  type PredictionContract,
  type PredictionResponseEvidence,
} from '../prediction-market-data.js';
import { readBoundedText } from '../http.js';
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const list = (v: unknown, max = 1000): unknown[] => {
  if (!Array.isArray(v) || v.length > max) throw new Error('Invalid historical market rows.');
  return v;
};
const iso = (v: unknown) => {
  if (typeof v !== 'string' || v.length > 40 || !Number.isFinite(Date.parse(v)))
    throw new Error('Invalid historical time.');
  return new Date(v).toISOString();
};
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const nickname: Record<string, string> = {
  ARI: 'Cardinals',
  ATL: 'Falcons',
  BAL: 'Ravens',
  BUF: 'Bills',
  CAR: 'Panthers',
  CHI: 'Bears',
  CIN: 'Bengals',
  CLE: 'Browns',
  DAL: 'Cowboys',
  DEN: 'Broncos',
  DET: 'Lions',
  GB: 'Packers',
  HOU: 'Texans',
  IND: 'Colts',
  JAX: 'Jaguars',
  KC: 'Chiefs',
  LA: 'Rams',
  LAC: 'Chargers',
  LV: 'Raiders',
  MIA: 'Dolphins',
  MIN: 'Vikings',
  NE: 'Patriots',
  NO: 'Saints',
  NYG: 'Giants',
  NYJ: 'Jets',
  PHI: 'Eagles',
  PIT: 'Steelers',
  SEA: 'Seahawks',
  SF: '49ers',
  TB: 'Buccaneers',
  TEN: 'Titans',
  WAS: 'Commanders',
};
const canonical = (s: string) =>
  (
    ({ lar: 'LA', la: 'LA', las: 'LV', lv: 'LV', wsh: 'WAS', was: 'WAS', jac: 'JAX' }) as Record<
      string,
      string
    >
  )[s] ?? s.toUpperCase();
export function historicalPolymarketEvents(catalog: unknown[], g: FootballGame): unknown[] {
  if (catalog.length > 5000) throw new Error('Historical catalog too large.');
  return catalog.filter((value) => {
    const e = obj(value);
    if (typeof e.slug !== 'string' || e.slug.length > 200) return false;
    const m = e.slug.match(/^nfl-([a-z]{2,3})-([a-z]{2,3})-(\d{4}-\d{2}-\d{2})$/);
    if (m)
      return (
        m[3] === g.date &&
        [canonical(m[1]!), canonical(m[2]!)].sort().join(':') === [g.home, g.away].sort().join(':')
      );
    return (
      /^nfl-/.test(e.slug) &&
      list(e.markets).some((v) => {
        const r = obj(v);
        return (
          typeof r.gameStartTime === 'string' &&
          iso(r.gameStartTime) === g.kickoffAt &&
          typeof r.description === 'string' &&
          /NFL/.test(r.description) &&
          [g.home, g.away].every(
            (t) => nickname[t] && r.description!.toString().includes(nickname[t]!),
          )
        );
      })
    );
  });
}
/** Normalize older rule/schema variants without treating props or differently lined games as totals. */
export function historicalTotalContract(
  input: unknown,
  g: FootballGame,
  provider: 'kalshi' | 'polymarket',
  cutoff: string,
): PredictionContract | undefined {
  if (
    !g.kickoffAt ||
    !Number.isFinite(g.totalLine) ||
    g.totalLine! % 1 !== 0.5 ||
    Date.parse(cutoff) >= Date.parse(g.kickoffAt)
  )
    return;
  const response = obj(input),
    raw =
      provider === 'kalshi'
        ? list(response.markets)
        : list(input, 5000).flatMap((e) => list(obj(e).markets));
  const matches: PredictionContract[] = [];
  for (const value of raw) {
    const r = obj(value),
      created = provider === 'kalshi' ? r.created_time : r.createdAt;
    if (provider === 'kalshi') {
      if (
        r.event_ticker !== predictionGameKeys(g).kalshi ||
        r.market_type !== 'binary' ||
        r.strike_type !== 'greater' ||
        r.floor_strike !== g.totalLine
      )
        continue;
      if (
        typeof r.rules_primary !== 'string' ||
        r.rules_primary.length > 8000 ||
        !/collectively score more than/i.test(r.rules_primary) ||
        !/professional football game|Pro Football game/.test(r.rules_primary) ||
        /first.half|second.half|quarter|regulation.only|remaining.points|margin/i.test(
          r.rules_primary,
        )
      )
        continue;
      if (
        typeof r.yes_sub_title !== 'string' ||
        !new RegExp(`^Over ${String(g.totalLine).replace('.', '\\.')} points(?: scored)?$`).test(
          r.yes_sub_title,
        )
      )
        continue;
      if (iso(r.open_time) > cutoff || iso(created) > cutoff) continue;
      if (
        typeof r.ticker !== 'string' ||
        !/^[A-Z0-9-]{1,100}$/.test(r.ticker) ||
        !r.ticker.startsWith(predictionGameKeys(g).kalshi + '-')
      )
        throw new Error('Historical Kalshi identity mismatch.');
      matches.push({ provider, id: r.ticker, createdAt: iso(created), line: g.totalLine! });
    } else {
      if (
        typeof r.question !== 'string' ||
        r.question.length > 500 ||
        typeof r.description !== 'string' ||
        r.description.length > 8000
      )
        continue;
      const question = r.question,
        description = r.description.replace(/[“”]/g, '"'),
        threshold = Math.ceil(g.totalLine!);
      const ordinary =
        r.sportsMarketType === 'totals' &&
        r.line === g.totalLine &&
        question.endsWith(`: O/U ${g.totalLine}`) &&
        description.includes(`combine to score ${threshold} or more points`);
      const legacy =
        question === `Will there be ${threshold} or more combined points scored?` &&
        description.includes(`is ${threshold} or more`) &&
        description.includes('combined total points');
      if (!ordinary && !legacy) continue;
      if (
        !/NFL/.test(description) ||
        /first.half|second.half|quarter|regulation.only/.test(description) ||
        typeof r.gameStartTime !== 'string' ||
        !Number.isFinite(Date.parse(r.gameStartTime)) ||
        iso(r.gameStartTime) !== g.kickoffAt ||
        [g.home, g.away].some((t) => !nickname[t] || !description.includes(nickname[t]!))
      )
        continue;
      if (iso(created) > cutoff) continue;
      if (
        typeof r.conditionId !== 'string' ||
        !/^0x[a-fA-F0-9]{64}$/.test(r.conditionId) ||
        typeof r.clobTokenIds !== 'string' ||
        r.clobTokenIds.length > 300 ||
        typeof r.outcomes !== 'string' ||
        r.outcomes.length > 100
      )
        throw new Error('Historical Polymarket identity mismatch.');
      const tokens = JSON.parse(r.clobTokenIds),
        outcomes = JSON.parse(r.outcomes),
        over = legacy && /resolve to "Yes\.?"/.test(description) ? 'Yes' : 'Over',
        under = over === 'Yes' ? 'No' : 'Under';
      if (!new RegExp(`resolve to "${over}\\.?"`).test(description) && legacy)
        throw new Error('Unverified historical outcome orientation.');
      if (
        !Array.isArray(tokens) ||
        tokens.length !== 2 ||
        tokens[0] === tokens[1] ||
        !tokens.every((t) => typeof t === 'string' && /^\d{1,100}$/.test(t)) ||
        !Array.isArray(outcomes) ||
        outcomes.length !== 2 ||
        !outcomes.includes(over) ||
        !outcomes.includes(under)
      )
        throw new Error('Invalid historical outcomes.');
      matches.push({
        provider,
        id: r.conditionId.toLowerCase(),
        createdAt: iso(created),
        line: g.totalLine!,
        tokens: [tokens[outcomes.indexOf(over)], tokens[outcomes.indexOf(under)]],
      });
    }
  }
  if (provider === 'kalshi' && (typeof response.cursor !== 'string' || response.cursor))
    throw new Error('Incomplete historical contract discovery.');
  const unique = [...new Map(matches.map((m) => [m.id, m])).values()];
  if (unique.length > 1) throw new Error('Ambiguous historical exact total.');
  return unique[0];
}
export function normalizeHistoricalKalshiPrices(input: unknown) {
  const r = obj(input);
  return {
    ...r,
    candlesticks: list(r.candlesticks, 2000).map((v) => {
      const row = obj(v),
        convert = (value: unknown) => {
          const q = obj(value);
          if (q.close_dollars !== undefined) return q;
          if (q.close === null || q.close === undefined) return { ...q, close_dollars: null };
          if (typeof q.close !== 'string' || !/^\d+\.\d+$/.test(q.close) || Number(q.close) > 1)
            throw new Error('Ambiguous historical price units.');
          return { ...q, close_dollars: q.close };
        };
      return { ...row, yes_bid: convert(row.yes_bid), yes_ask: convert(row.yes_ask) };
    }),
  };
}
/** Legacy CLOB samples retain older NFL prices absent from the v2 price endpoint.
 * Request one-minute samples and conservatively wait a full sample interval.
 */
export function parseHistoricalClobPrices(
  input: unknown,
  from: string,
  cutoff: string,
): ExternalTotalTape['prices'] {
  const seen = new Set<number>(),
    prices: ExternalTotalTape['prices'] = [];
  for (const value of list(obj(input).history, 2000)) {
    const r = obj(value);
    if (
      typeof r.t !== 'number' ||
      !Number.isInteger(r.t) ||
      typeof r.p !== 'number' ||
      !Number.isFinite(r.p) ||
      r.p < 0 ||
      r.p > 1 ||
      seen.has(r.t)
    )
      throw new Error('Invalid historical CLOB sample.');
    seen.add(r.t);
    const at = (r.t + 60) * 1000;
    if (r.t * 1000 < Date.parse(from) || at > Date.parse(cutoff) || r.p === 0 || r.p === 1)
      continue;
    prices.push({ at: new Date(at).toISOString(), probability: r.p });
  }
  return prices.sort((a, b) => a.at.localeCompare(b.at));
}
export class HistoricalPredictionMarketData {
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private catalog: unknown[],
    private fetcher: typeof fetch = fetch,
    private save?: (e: PredictionResponseEvidence, text: string) => Promise<void>,
  ) {}
  private async get(url: string) {
    if (url.startsWith('https://external-api.kalshi.com/')) {
      const turn = this.queue.then(() => new Promise<void>((r) => setTimeout(r, 350)));
      this.queue = turn.catch(() => undefined);
      await turn;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await this.fetcher(url, {
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers: { accept: 'application/json' },
        }),
        text = await readBoundedText(response, 2000000);
      await this.save?.(
        {
          url,
          capturedAt: new Date().toISOString(),
          sha256: hash(text),
          bytes: Buffer.byteLength(text),
          status: response.status,
        },
        text,
      );
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise((r) =>
          setTimeout(
            r,
            Math.min(
              10000,
              Math.max(
                1000 * 2 ** attempt,
                (Number(response.headers.get('retry-after')) || 0) * 1000,
              ),
            ),
          ),
        );
        continue;
      }
      if (!response.ok) throw new Error(`Historical market read failed (${response.status}).`);
      return JSON.parse(text) as unknown;
    }
    throw new Error('Historical reads exhausted.');
  }
  async total(
    g: FootballGame,
    provider: 'kalshi' | 'polymarket',
  ): Promise<ExpandedTotalTape | undefined> {
    if (!g.kickoffAt || g.totalLine === undefined || g.totalLine % 1 !== 0.5) return;
    const cutoff = new Date(Date.parse(g.kickoffAt) - 1800000).toISOString(),
      from = new Date(Date.parse(cutoff) - 86400000).toISOString(),
      earlyFrom = new Date(Date.parse(cutoff) - 7 * 86400000).toISOString(),
      start = Date.parse(from) / 1000,
      end = Date.parse(cutoff) / 1000;
    let input: unknown,
      archived = false;
    if (provider === 'kalshi') {
      const root = 'https://external-api.kalshi.com/trade-api/v2',
        event = predictionGameKeys(g).kalshi;
      archived = g.season <= 2025;
      input = await this.get(
        `${root}/${archived ? 'historical/' : ''}markets?event_ticker=${event}&limit=1000`,
      );
    } else input = historicalPolymarketEvents(this.catalog, g);
    const c = historicalTotalContract(input, g, provider, cutoff);
    if (!c) return;
    const kroot = 'https://external-api.kalshi.com/trade-api/v2',
      proot = 'https://data-api.polymarket.com/v2';
    let prices: ExternalTotalTape['prices'] = [];
    const priceURL =
      provider === 'kalshi'
        ? `${kroot}/${archived ? 'historical/markets/' : 'series/KXNFLTOTAL/markets/'}${c.id}/candlesticks?start_ts=${start}&end_ts=${end}&period_interval=60`
        : `${proot}/prices-history?token_id=${c.tokens![0]}&start=${start}&end=${end}&bucket_seconds=10800&limit=1000`;
    const priceData = await this.get(priceURL);
    prices =
      provider === 'kalshi'
        ? parseKalshiPrices(
            archived ? normalizeHistoricalKalshiPrices(priceData) : priceData,
            from,
            cutoff,
          )
        : parsePolymarketPrices(priceData, from, cutoff);
    if (provider === 'polymarket' && g.season <= 2024) {
      const legacy = await this.get(
        `https://clob.polymarket.com/prices-history?market=${c.tokens![0]}&startTs=${start}&endTs=${end}&fidelity=1`,
      );
      const older = parseHistoricalClobPrices(legacy, from, cutoff);
      prices = [...new Map([...prices, ...older].map((p) => [p.at, p])).values()];
    }
    const trades: ExternalTotalTrade[] = [],
      seen = new Set<string>();
    let cursor = '',
      complete = false;
    for (let page = 0; page < 12; page++) {
      const url = new URL(
        provider === 'kalshi'
          ? `${kroot}/${archived ? 'historical' : 'markets'}/trades`
          : `${proot}/trades`,
      );
      url.searchParams.set(provider === 'kalshi' ? 'ticker' : 'condition', c.id);
      url.searchParams.set('limit', '1000');
      if (provider === 'kalshi') {
        url.searchParams.set('min_ts', String(Date.parse(earlyFrom) / 1000));
        url.searchParams.set('max_ts', String(end));
      } else url.searchParams.set('taker_only', 'true');
      if (cursor) url.searchParams.set('cursor', cursor);
      const p = parsePredictionTrades(await this.get(url.href), c, earlyFrom, cutoff);
      trades.push(...p.trades);
      if (!p.cursor) {
        complete = true;
        break;
      }
      if (seen.has(p.cursor)) throw new Error('Historical cursor loop.');
      seen.add(p.cursor);
      cursor = p.cursor;
    }
    // Old permanent Polymarket tiers are coarse. Recover exact transaction observations
    // only from a complete time-filtered tape, never from a terminal settlement point.
    if (provider === 'polymarket' && complete) {
      const grouped = new Map<number, ExternalTotalTrade[]>();
      for (const t of trades) {
        if (t.at < from) continue;
        const at = Date.parse(t.at);
        grouped.set(at, [...(grouped.get(at) ?? []), t]);
      }
      const points = [...grouped].sort(([a], [b]) => a - b);
      for (const [at, ts] of points.slice(-1500)) {
        const probability =
          ts.reduce((s, t) => s + t.overProbability * t.shares, 0) /
          ts.reduce((s, t) => s + t.shares, 0);
        if (probability > 0 && probability < 1)
          prices = prices
            .filter((p) => p.at !== new Date(at).toISOString())
            .concat({ at: new Date(at).toISOString(), probability });
      }
    }
    if (prices.length > 2000) throw new Error('Historical price points exceed limit.');
    const tape: ExpandedTotalTape = {
      gameId: g.id,
      provider,
      contractId: c.id,
      line: c.line,
      kickoffAt: g.kickoffAt,
      cutoffAt: cutoff,
      capturedAt: new Date().toISOString(),
      createdAt: c.createdAt,
      windowStartAt: from,
      complete,
      trades: trades.filter((t) => t.at >= from),
      earlyWindowStartAt: earlyFrom,
      earlyComplete: complete,
      earlyTrades: trades.filter((t) => t.at < from),
      prices: prices.sort((a, b) => a.at.localeCompare(b.at)),
    };
    validateExpandedTotalTape(tape);
    return tape;
  }
}
