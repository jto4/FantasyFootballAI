import type { ExternalTotalTrade } from '@sidekick/core';
import { parsePredictionTrades, type PredictionContract } from '../prediction-market-data.js';

export interface CanonicalKalshiDirection {
  direction: -1 | 1;
  isBlockTrade: boolean;
}
/** Kalshi's two direction fields encode the same exposure bit, not outcome plus BUY/SELL. */
export function canonicalKalshiDirection(value: unknown): CanonicalKalshiDirection {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid canonical trade.');
  const r = value as Record<string, unknown>;
  if (typeof r.is_block_trade !== 'boolean') throw new Error('Missing Kalshi block-trade state.');
  if (r.taker_outcome_side === 'yes' && r.taker_book_side === 'bid')
    return { direction: 1, isBlockTrade: r.is_block_trade };
  if (r.taker_outcome_side === 'no' && r.taker_book_side === 'ask')
    return { direction: -1, isBlockTrade: r.is_block_trade };
  throw new Error('Contradictory Kalshi direction fields.');
}
export type CanonicalPredictionTrade = ExternalTotalTrade & { isBlockTrade?: boolean };
/** Versioned research parser: reuse frozen quantity/time/identity validation, replace only Kalshi direction. */
export function parseCanonicalPredictionTrades(
  input: unknown,
  c: PredictionContract,
  from: string,
  cutoff: string,
) {
  const parsed = parsePredictionTrades(input, c, from, cutoff);
  if (c.provider !== 'kalshi') return parsed;
  const raw = (input as { trades: unknown[] }).trades,
    map = new Map<string, unknown>();
  for (const value of raw) {
    const r = value as Record<string, unknown>;
    if (typeof r.trade_id !== 'string' || map.has(r.trade_id))
      throw new Error('Duplicate canonical raw trade.');
    map.set(r.trade_id, value);
  }
  const trades: CanonicalPredictionTrade[] = parsed.trades.map((t) => ({
    ...t,
    ...canonicalKalshiDirection(map.get(t.id)),
  }));
  return { ...parsed, trades };
}
