import {
  validateExternalTotalTape,
  type ExternalTotalTape,
  type ExternalTotalTrade,
} from './external-total-signals.js';

export interface ExpandedTotalTape extends ExternalTotalTape {
  earlyWindowStartAt?: string;
  earlyTrades?: ExternalTotalTrade[];
  earlyComplete?: boolean;
}

/** Earlier history is optional; incomplete history cannot become an observed zero. */
export function validateExpandedTotalTape(t: ExpandedTotalTape): void {
  validateExternalTotalTape(t);
  if (
    t.earlyWindowStartAt === undefined &&
    t.earlyTrades === undefined &&
    t.earlyComplete === undefined
  )
    return;
  const start = Date.parse(t.earlyWindowStartAt ?? '');
  if (
    !Number.isFinite(start) ||
    start >= Date.parse(t.windowStartAt) ||
    Date.parse(t.cutoffAt) - start > 7 * 86400000 ||
    !Array.isArray(t.earlyTrades) ||
    t.earlyTrades.length > 12000 ||
    typeof t.earlyComplete !== 'boolean'
  )
    throw new Error('Invalid earlier trade window.');
  const ids = new Set(t.trades.map((r) => r.id));
  for (const r of t.earlyTrades) {
    const at = Date.parse(r.at);
    if (
      !Number.isFinite(at) ||
      at < Math.max(start, Date.parse(t.createdAt)) ||
      at >= Date.parse(t.windowStartAt) ||
      !/^[a-zA-Z0-9_:.-]{1,160}$/.test(r.id) ||
      ids.has(r.id) ||
      !Number.isFinite(r.shares) ||
      r.shares <= 0 ||
      r.shares > 10000000 ||
      !Number.isFinite(r.price) ||
      r.price < 0 ||
      r.price > 1 ||
      !Number.isFinite(r.overProbability) ||
      r.overProbability < 0 ||
      r.overProbability > 1 ||
      ![-1, 1].includes(r.direction) ||
      (r.walletHash !== undefined && !/^[a-f0-9]{64}$/.test(r.walletHash))
    )
      throw new Error('Invalid earlier trade.');
    ids.add(r.id);
  }
}
