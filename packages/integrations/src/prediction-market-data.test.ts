import { expect, it } from 'vitest';
import {
  parseKalshiTotalContract,
  parsePolymarketTotalContract,
  parseKalshiPrices,
  parsePolymarketPrices,
  parsePredictionTrades,
  PublicPredictionMarketData,
  type PredictionContract,
} from './prediction-market-data.js';
import type { FootballGame } from '@sidekick/core';
const g: FootballGame = {
  id: '2026_05_LV_NE',
  season: 2026,
  week: 5,
  seasonType: 'REG',
  date: '2026-10-11',
  kickoffAt: '2026-10-11T17:00:00.000Z',
  home: 'NE',
  away: 'LV',
  totalLine: 45.5,
};
const cutoff = '2026-10-11T16:30:00.000Z',
  from = '2026-10-10T16:30:00.000Z';
const km = {
  event_ticker: 'KXNFLTOTAL-26OCT11LVNE',
  market_type: 'binary',
  strike_type: 'greater',
  floor_strike: 45.5,
  title: 'Full Game: over 45.5 points scored?',
  rules_primary: 'collectively score more than 45.5 points in the Pro Football game',
  created_time: '2026-10-04T12:00:00Z',
  open_time: '2026-10-04T13:00:00Z',
  ticker: 'KXNFLTOTAL-26OCT11LVNE-46',
};
it('requires exact full-game contracts, pre-cutoff creation and unique matches', () => {
  expect(parseKalshiTotalContract({ markets: [km], cursor: '' }, g, cutoff)?.id).toBe(km.ticker);
  expect(
    parseKalshiTotalContract(
      { markets: [{ ...km, created_time: '2026-10-11T18:00:00Z' }], cursor: '' },
      g,
      cutoff,
    ),
  ).toBeUndefined();
  expect(
    parseKalshiTotalContract(
      { markets: [{ ...km, title: 'First Half: over 45.5 points scored?' }], cursor: '' },
      g,
      cutoff,
    ),
  ).toBeUndefined();
  expect(() => parseKalshiTotalContract({ markets: [km, km], cursor: '' }, g, cutoff)).toThrow(
    'Ambiguous',
  );
  expect(() => parseKalshiTotalContract({ markets: [km], cursor: 'next' }, g, cutoff)).toThrow(
    'Truncated',
  );
  const market = {
    sportsMarketType: 'totals',
    line: 45.5,
    slug: 'nfl-lv-ne-2026-10-11-total-45pt5',
    question: 'Raiders vs. Patriots: O/U 45.5',
    description: 'In the upcoming NFL game, the teams combine to score 46 or more points',
    gameStartTime: g.kickoffAt,
    createdAt: '2026-10-04T12:00:00Z',
    conditionId: '0x' + 'a'.repeat(64),
    clobTokenIds: '["1","2"]',
    outcomes: '["Under","Over"]',
  };
  expect(
    parsePolymarketTotalContract([{ slug: 'nfl-lv-ne-2026-10-11', markets: [market] }], g, cutoff)
      ?.tokens,
  ).toEqual(['2', '1']);
  expect(
    parsePolymarketTotalContract(
      [
        {
          slug: 'nfl-lv-ne-2026-10-11',
          markets: [{ ...market, gameStartTime: '2026-10-11T18:00:00Z' }],
        },
      ],
      g,
      cutoff,
    ),
  ).toBeUndefined();
});
it('excludes clamped payouts, terminal ticks and buckets overlapping the cutoff', () => {
  const end = Date.parse(cutoff) / 1000;
  const parsed = parsePolymarketPrices(
    {
      pagination: { has_more: false },
      data: [
        { timestamp: end - 300, price: 0.51, resolution_seconds: 300 },
        { timestamp: end, price: 1, resolution_seconds: 0 },
        { timestamp: end - 1, price: 0.7, resolution_seconds: 300 },
      ],
    },
    from,
    cutoff,
  );
  expect(parsed).toEqual([{ at: cutoff, probability: 0.51 }]);
  expect(() =>
    parsePolymarketPrices({ pagination: { has_more: true }, data: [] }, from, cutoff),
  ).toThrow('Truncated');
  expect(() =>
    parseKalshiPrices(
      {
        candlesticks: [
          {
            end_period_ts: end,
            yes_bid: { close_dollars: '0.6' },
            yes_ask: { close_dollars: '0.5' },
          },
        ],
      },
      from,
      cutoff,
    ),
  ).toThrow('Crossed');
});
it('uses taker execution direction, converts Under probabilities, and removes future executions', () => {
  const c: PredictionContract = {
    provider: 'polymarket',
    id: '0x' + 'a'.repeat(64),
    line: 45.5,
    createdAt: from,
    tokens: ['1', '2'],
  };
  const row = {
    condition_id: c.id,
    token_id: '2',
    side: 'BUY',
    transaction_hash: '0x' + 'b'.repeat(64),
    proxy_wallet: '0x' + 'c'.repeat(40),
    timestamp: Date.parse(cutoff) / 1000 - 1,
    price: 0.6,
    size: 1000,
  };
  const r = parsePredictionTrades(
    {
      data: [row, { ...row, timestamp: Date.parse(g.kickoffAt!) / 1000 }],
      pagination: { has_more: false, next_cursor: null },
    },
    c,
    from,
    cutoff,
  );
  expect(r.trades).toHaveLength(1);
  expect(r.trades[0]).toMatchObject({ overProbability: 0.4, direction: -1 });
  expect(r.trades[0]?.walletHash).toHaveLength(64);
  expect(JSON.stringify(r)).not.toContain(row.proxy_wallet);
  const k: PredictionContract = { provider: 'kalshi', id: km.ticker, createdAt: from, line: 45.5 };
  const kt = {
    ticker: k.id,
    trade_id: 'abcd',
    created_time: cutoff,
    count_fp: '10.5',
    yes_price_dollars: '0.4',
    no_price_dollars: '0.6',
    taker_outcome_side: 'no',
    taker_book_side: 'bid',
  };
  expect(
    parsePredictionTrades({ trades: [kt], cursor: '' }, k, from, cutoff).trades[0]?.direction,
  ).toBe(1);
});
it('bounds URLs, deadlines, response bytes and retry attempts for public reads', async () => {
  let n = 0;
  const adapter = new PublicPredictionMarketData(async (url, init) => {
    n++;
    expect(String(url)).toContain(
      'https://gamma-api.polymarket.com/events?slug=nfl-lv-ne-2026-10-11',
    );
    expect(init?.signal).toBeDefined();
    expect(init?.redirect).toBe('error');
    return Response.json([]);
  });
  expect(await adapter.getTotal(g, 'polymarket', cutoff)).toBeUndefined();
  expect(n).toBe(1);
  await expect(
    new PublicPredictionMarketData(
      async () => new Response('x', { headers: { 'content-length': '2000001' } }),
    ).getTotal(g, 'polymarket', cutoff),
  ).rejects.toThrow('size limit');
  await expect(adapter.getTotal(g, 'polymarket', '2026-10-11T18:00:00Z')).rejects.toThrow('cutoff');
});
