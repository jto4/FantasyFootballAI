import { expect, it } from 'vitest';
import type { FootballGame } from '@sidekick/core';
import {
  historicalPolymarketEvents,
  historicalTotalContract,
  normalizeHistoricalKalshiPrices,
  parseHistoricalClobPrices,
  HistoricalPredictionMarketData,
} from './historical-prediction-market-data.js';
const g: FootballGame = {
  id: '2025_01_DAL_PHI',
  season: 2025,
  week: 1,
  seasonType: 'REG',
  date: '2025-09-04',
  kickoffAt: '2025-09-05T00:20:00.000Z',
  home: 'PHI',
  away: 'DAL',
  totalLine: 47.5,
};
const cutoff = '2025-09-04T23:50:00.000Z';
const market = {
  sportsMarketType: 'totals',
  line: 47.5,
  question: 'Cowboys vs. Eagles: O/U 47.5',
  description: 'In the NFL game Cowboys and Eagles combine to score 48 or more points.',
  gameStartTime: g.kickoffAt,
  createdAt: '2025-08-30T12:00:00Z',
  conditionId: '0x' + 'a'.repeat(64),
  clobTokenIds: '["1","2"]',
  outcomes: '["Over","Under"]',
};
it('matches reversed historical team order and verifies legacy rule orientation, excluding props', () => {
  const e = { slug: 'nfl-phi-dal-2025-09-04', markets: [market] };
  expect(historicalPolymarketEvents([e], g)).toEqual([e]);
  expect(historicalPolymarketEvents([e], { ...g, away: 'DEN' })).toEqual([]);
  expect(historicalTotalContract([e], g, 'polymarket', cutoff)?.tokens).toEqual(['1', '2']);
  for (const [over, under] of [
    ['Yes', 'No'],
    ['Over', 'Under'],
  ]) {
    const legacy = {
      ...market,
      line: undefined,
      question: 'Will there be 48 or more combined points scored?',
      description: `In the NFL game the combined total points scored by Cowboys and Eagles is 48 or more, this market will resolve to “${over}”. Otherwise “${under}”.`,
      outcomes: JSON.stringify([under, over]),
    };
    expect(
      historicalTotalContract([{ ...e, markets: [legacy] }], g, 'polymarket', cutoff)?.tokens,
    ).toEqual(['2', '1']);
    expect(
      historicalTotalContract(
        [{ ...e, markets: [{ ...legacy, description: legacy.description.replace('48', '49') }] }],
        g,
        'polymarket',
        cutoff,
      ),
    ).toBeUndefined();
    expect(
      historicalTotalContract(
        [
          {
            ...e,
            markets: [{ ...legacy, question: 'Will Dak Prescott pass for 48 or more yards?' }],
          },
        ],
        g,
        'polymarket',
        cutoff,
      ),
    ).toBeUndefined();
  }
  expect(
    historicalTotalContract(
      [{ ...e, markets: [{ ...market, gameStartTime: undefined }] }],
      g,
      'polymarket',
      cutoff,
    ),
  ).toBeUndefined();
});
it('normalizes documented historical dollar strings and rejects ambiguous cents', () => {
  expect(
    normalizeHistoricalKalshiPrices({
      candlesticks: [{ yes_bid: { close: '0.5100' }, yes_ask: { close: '0.5500' } }],
    }).candlesticks[0],
  ).toMatchObject({ yes_bid: { close_dollars: '0.5100' }, yes_ask: { close_dollars: '0.5500' } });
  for (const close of [51, '51', '1.5000'])
    expect(() =>
      normalizeHistoricalKalshiPrices({
        candlesticks: [{ yes_bid: { close }, yes_ask: { close: null } }],
      }),
    ).toThrow('Ambiguous');
});
it('keeps legacy samples strictly before cutoff and excludes terminal prices and incomplete intervals', () => {
  const end = Date.parse(cutoff) / 1000,
    from = new Date((end - 86400) * 1000).toISOString();
  expect(
    parseHistoricalClobPrices(
      {
        history: [
          { t: end - 120, p: 0.51 },
          { t: end - 30, p: 0.6 },
          { t: end + 60, p: 0.7 },
          { t: end - 600, p: 1 },
        ],
      },
      from,
      cutoff,
    ),
  ).toEqual([{ at: new Date((end - 60) * 1000).toISOString(), probability: 0.51 }]);
  expect(() =>
    parseHistoricalClobPrices(
      {
        history: [
          { t: end - 120, p: 0.51 },
          { t: end - 120, p: 0.52 },
        ],
      },
      from,
      cutoff,
    ),
  ).toThrow();
  expect(() =>
    parseHistoricalClobPrices({ history: [{ t: end - 120, p: '0.51' }] }, from, cutoff),
  ).toThrow();
});
it('uses archived routes and seven-day bounds, without passing terminal results to the tape', async () => {
  const calls: string[] = [];
  const km = {
    event_ticker: 'KXNFLTOTAL-25SEP04DALPHI',
    market_type: 'binary',
    strike_type: 'greater',
    floor_strike: 47.5,
    title: 'Dallas at Philadelphia: Spread Total Points?',
    yes_sub_title: 'Over 47.5 points scored',
    rules_primary:
      'If teams in the professional football game collectively score more than 47.5 points, resolves Yes.',
    created_time: '2025-08-26T05:39:38Z',
    open_time: '2025-08-26T05:44:00Z',
    ticker: 'KXNFLTOTAL-25SEP04DALPHI-47',
    result: 'no',
  };
  const fetcher = (async (url: URL | string | Request) => {
    const u = String(url);
    calls.push(u);
    return new Response(
      JSON.stringify(
        u.includes('candlesticks')
          ? { candlesticks: [] }
          : u.includes('/trades?')
            ? { trades: [], cursor: '' }
            : { markets: [km], cursor: '' },
      ),
    );
  }) as typeof fetch;
  const t = await new HistoricalPredictionMarketData([], fetcher).total(g, 'kalshi');
  expect(t?.earlyWindowStartAt).toBe('2025-08-28T23:50:00.000Z');
  expect(t?.earlyComplete).toBe(true);
  expect(calls.every((u) => u.includes('/historical/'))).toBe(true);
  expect(new URL(calls[2]!).searchParams.get('min_ts')).toBe(
    String(Date.parse(t!.earlyWindowStartAt!) / 1000),
  );
  expect(t).not.toHaveProperty('result');
});
