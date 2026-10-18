import type { FootballGame } from '../advice-types.js';
import { validateExpandedTotalTape, type ExpandedTotalTape } from '../expanded-total-tape.js';
import type { ExternalTotalTrade } from '../external-total-signals.js';

export interface RobustFlowTrade extends ExternalTotalTrade {
  isBlockTrade?: boolean;
}
export interface RobustFlowTape extends ExpandedTotalTape {
  directionSchema?: 'kalshi-exposure-v1';
  trades: RobustFlowTrade[];
  earlyTrades?: RobustFlowTrade[];
}
export type RobustFlowPolicy = 'innovation' | 'confirmed';
export const robustFlowParameters = Object.freeze({
  recentMinutes: 60,
  baselineMinutes: 180,
  bucketMinutes: 1,
  bucketShareCap: 500,
  minimumRecentMinutes: 5,
  minimumBaselineMinutes: 10,
  minimumWallets: 3,
  largeNotionalFloor: 500,
  largeQuantile: 0.95,
  confirmationMinimumMove: 0.005,
  priceMaxAgeMinutes: 60,
});
type Bucket = { signed: number; gross: number };
const bounded = (v: number) => Math.max(-1, Math.min(1, v));
function buckets(rows: RobustFlowTrade[]) {
  const grouped = new Map<string, Bucket>();
  for (const r of rows) {
    const key = `${r.walletHash ?? 'anonymous'}:${Math.floor(Date.parse(r.at) / 60000)}`,
      b = grouped.get(key) ?? { signed: 0, gross: 0 };
    b.signed += r.direction * r.shares;
    b.gross += r.shares;
    grouped.set(key, b);
  }
  let signed = 0,
    gross = 0;
  for (const b of grouped.values()) {
    const w = Math.min(500, b.gross);
    signed += (b.signed / b.gross) * w;
    gross += w;
  }
  return {
    net: gross ? signed / gross : 0,
    minutes: new Set(rows.map((r) => Math.floor(Date.parse(r.at) / 60000))).size,
    buckets: grouped.size,
  };
}
function walletMean(rows: RobustFlowTrade[]) {
  const groups = new Map<string, RobustFlowTrade[]>();
  for (const r of rows)
    if (r.walletHash) groups.set(r.walletHash, [...(groups.get(r.walletHash) ?? []), r]);
  const values = [...groups.values()].map((rs) => buckets(rs).net);
  return {
    net: values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0,
    wallets: values.length,
  };
}
function notionalGroups(rows: RobustFlowTrade[]) {
  const groups = new Map<string, { notional: number; rows: RobustFlowTrade[] }>();
  for (const r of rows) {
    const key = `${r.walletHash ?? 'anonymous'}:${Math.floor(Date.parse(r.at) / 60000)}`,
      g = groups.get(key) ?? { notional: 0, rows: [] };
    g.notional += r.shares * r.price;
    g.rows.push(r);
    groups.set(key, g);
  }
  return [...groups.values()];
}
/** Changes in bounded pressure, not persistent one-sided flow or inferred wallet skill.
 * Minute aggregation occurs before caps so splitting a fill cannot gain influence.
 */
export function robustTapeFlow(
  t: RobustFlowTape,
  cutoff: string,
  policy: RobustFlowPolicy = 'innovation',
) {
  validateExpandedTotalTape(t);
  if (!['innovation', 'confirmed'].includes(policy) || !Number.isFinite(Date.parse(cutoff)))
    throw new Error('Invalid robust flow request.');
  if (
    t.provider === 'kalshi' &&
    (t.directionSchema !== 'kalshi-exposure-v1' ||
      [...t.trades, ...(t.earlyTrades ?? [])].some((r) => typeof r.isBlockTrade !== 'boolean'))
  )
    throw new Error('Kalshi flow requires canonical direction and block state.');
  const now = Date.parse(cutoff),
    end = Date.parse(t.cutoffAt),
    hour = 3600000;
  const eligible = t.trades.filter((r) => !r.isBlockTrade && Date.parse(r.at) <= now),
    recent = eligible.filter((r) => Date.parse(r.at) > now - hour),
    prior = eligible.filter(
      (r) => Date.parse(r.at) > now - 4 * hour && Date.parse(r.at) <= now - hour,
    );
  const recentStats = buckets(recent),
    priorStats = buckets(prior),
    prices = t.prices
      .filter((p) => Date.parse(p.at) <= now)
      .sort((a, b) => b.at.localeCompare(a.at)),
    last = prices.find((p) => now - Date.parse(p.at) <= hour),
    anchor = prices.find(
      (p) => Date.parse(p.at) <= now - hour && Date.parse(p.at) >= now - 2 * hour,
    );
  const move = last && anchor ? last.probability - anchor.probability : undefined;
  const confirmed = (v: number) =>
    move !== undefined && Math.abs(move) >= 0.005 && Math.sign(move) === Math.sign(v)
      ? v * Math.min(1, Math.abs(move) / 0.02)
      : 0;
  const supported =
    t.complete &&
    now >= end &&
    now - end <= 60000 &&
    recentStats.minutes >= 5 &&
    priorStats.minutes >= 10;
  const innovation = supported ? bounded((recentStats.net - priorStats.net) / 2) : 0;
  const earlier = eligible.filter((r) => Date.parse(r.at) <= now - hour),
    notionals = notionalGroups(earlier)
      .map((g) => g.notional)
      .sort((a, b) => a - b),
    threshold = Math.max(500, notionals[Math.floor((notionals.length - 1) * 0.95)] ?? 500);
  const largeRecent = buckets(
      notionalGroups(recent)
        .filter((g) => g.notional >= threshold)
        .flatMap((g) => g.rows),
    ),
    largePrior = buckets(
      notionalGroups(prior)
        .filter((g) => g.notional >= threshold)
        .flatMap((g) => g.rows),
    );
  const largeSupported = supported && largeRecent.minutes >= 3 && largePrior.minutes >= 5;
  const largeInnovation = largeSupported ? bounded((largeRecent.net - largePrior.net) / 2) : 0;
  const rw = walletMean(recent),
    pw = walletMean(prior),
    walletSupported = supported && rw.wallets >= 3 && pw.wallets >= 3;
  const walletInnovation = walletSupported
    ? bounded((rw.net - pw.net) / 2) * Math.min(1, Math.min(rw.wallets, pw.wallets) / 20)
    : 0;
  const x =
    policy === 'confirmed'
      ? [confirmed(innovation), 0, confirmed(largeInnovation), confirmed(walletInnovation)]
      : [innovation, confirmed(innovation), largeInnovation, walletInnovation];
  return {
    x,
    supported,
    recentMinutes: recentStats.minutes,
    baselineMinutes: priorStats.minutes,
    recentNet: recentStats.net,
    baselineNet: priorStats.net,
    largeSupported,
    walletSupported,
    recentWallets: rw.wallets,
    baselineWallets: pw.wallets,
    priceMove: move,
    priceConfirmed: confirmed(innovation) !== 0,
    threshold,
    blockTradesExcluded: t.trades.filter((r) => r.isBlockTrade).length,
  };
}
export function prepareRobustTotalFlowFeatures(tapes: RobustFlowTape[]) {
  if (!Array.isArray(tapes) || tapes.length > 2500) throw new Error('Too many robust tapes.');
  const byGame = new Map<string, RobustFlowTape[]>(),
    identities = new Set<string>();
  let trades = 0;
  for (const t of tapes) {
    validateExpandedTotalTape(t);
    const key = `${t.gameId}:${t.provider}:${t.cutoffAt}`;
    trades += t.trades.length + (t.earlyTrades?.length ?? 0);
    if (identities.has(key) || trades > 1000000)
      throw new Error('Duplicate or oversized robust history.');
    identities.add(key);
    byGame.set(t.gameId, [...(byGame.get(t.gameId) ?? []), t]);
  }
  return (
    game: FootballGame,
    cutoff: string,
    priceFeatures: number[],
    policy: RobustFlowPolicy = 'innovation',
  ) => {
    if (
      !game.kickoffAt ||
      !Number.isFinite(Date.parse(cutoff)) ||
      Date.parse(cutoff) >= Date.parse(game.kickoffAt) ||
      !Array.isArray(priceFeatures) ||
      priceFeatures.length !== 18 ||
      priceFeatures.some((v) => !Number.isFinite(v) || Math.abs(v) > 4)
    )
      throw new Error('Invalid robust feature origin.');
    const x = Array<number>(18).fill(0),
      providers: Record<string, ReturnType<typeof robustTapeFlow> | undefined> = {};
    for (const [provider, start] of [
      ['kalshi', 0],
      ['polymarket', 9],
    ] as const) {
      x[start] = priceFeatures[start]!;
      x[start + 1] = priceFeatures[start + 1]!;
      const t = (byGame.get(game.id) ?? [])
        .filter(
          (t) =>
            t.provider === provider &&
            t.line === game.totalLine &&
            t.kickoffAt === game.kickoffAt &&
            Date.parse(t.cutoffAt) <= Date.parse(cutoff),
        )
        .sort((a, b) => b.cutoffAt.localeCompare(a.cutoffAt))[0];
      if (!t) continue;
      const f = robustTapeFlow(t, cutoff, policy);
      providers[provider] = f;
      for (const [i, slot] of [3, 4, 6, 7].entries()) x[start + slot] = f.x[i]!;
    }
    return {
      x,
      providers,
      flowCount: Object.values(providers).filter((f) => f?.supported).length,
      confirmedCount: Object.values(providers).filter((f) => f?.priceConfirmed).length,
    };
  };
}
