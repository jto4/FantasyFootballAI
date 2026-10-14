import { expect, it } from 'vitest';
import {
  canonicalKalshiDirection,
  parseCanonicalPredictionTrades,
} from './canonical-prediction-trades.js';
import type { PredictionContract } from './prediction-market-data.js';
it('reads the canonical same-bit exposure and rejects the contradictory legacy test fixture', () => {
  expect(
    canonicalKalshiDirection({
      taker_outcome_side: 'yes',
      taker_book_side: 'bid',
      is_block_trade: false,
    }),
  ).toEqual({ direction: 1, isBlockTrade: false });
  expect(
    canonicalKalshiDirection({
      taker_outcome_side: 'no',
      taker_book_side: 'ask',
      is_block_trade: true,
    }),
  ).toEqual({ direction: -1, isBlockTrade: true });
  for (const [a, b] of [
    ['no', 'bid'],
    ['yes', 'ask'],
  ])
    expect(() =>
      canonicalKalshiDirection({
        taker_outcome_side: a,
        taker_book_side: b,
        is_block_trade: false,
      }),
    ).toThrow('Contradictory');
  expect(() =>
    canonicalKalshiDirection({ taker_outcome_side: 'yes', taker_book_side: 'bid' }),
  ).toThrow('block');
});
it('corrects real paired fields without changing price/size/time or admitting future trades', () => {
  const c: PredictionContract = {
      provider: 'kalshi',
      id: 'KXNFLTOTAL-25SEP04DALPHI-47',
      createdAt: '2025-08-26T00:00:00.000Z',
      line: 47.5,
    },
    from = '2025-09-03T23:50:00.000Z',
    cutoff = '2025-09-04T23:50:00.000Z';
  const t = {
    ticker: c.id,
    trade_id: 'abcd',
    created_time: cutoff,
    count_fp: '10.5',
    yes_price_dollars: '0.4',
    no_price_dollars: '0.6',
    taker_outcome_side: 'yes',
    taker_book_side: 'bid',
    is_block_trade: false,
  };
  const r = parseCanonicalPredictionTrades(
    {
      trades: [
        t,
        { ...t, trade_id: 'bcde', taker_outcome_side: 'no', taker_book_side: 'ask' },
        { ...t, trade_id: 'cdef', created_time: '2025-09-05T00:00:00Z' },
      ],
      cursor: '',
    },
    c,
    from,
    cutoff,
  );
  expect(r.trades).toHaveLength(2);
  expect(r.trades[0]).toMatchObject({
    direction: 1,
    shares: 10.5,
    at: cutoff,
    overProbability: 0.4,
    price: 0.4,
    isBlockTrade: false,
  });
  expect(r.trades[1]).toMatchObject({ direction: -1, price: 0.6 });
  expect(() =>
    parseCanonicalPredictionTrades({ trades: [t, { ...t }], cursor: '' }, c, from, cutoff),
  ).toThrow('Duplicate');
});
