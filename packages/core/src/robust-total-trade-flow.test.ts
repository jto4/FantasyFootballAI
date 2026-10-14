import { expect, it } from 'vitest';
import {
  robustTapeFlow,
  prepareRobustTotalFlowFeatures,
  type RobustFlowTape,
  type RobustFlowTrade,
} from './robust-total-trade-flow.js';
const cutoff = '2025-09-07T16:30:00.000Z',
  now = Date.parse(cutoff);
function fixture(): RobustFlowTape {
  const trade = (i: number, recent = false): RobustFlowTrade => ({
    id: `trade:${recent ? 'r' : 'p'}:${i}`,
    at: new Date(now - (recent ? 10 + i : 90 + i) * 60000).toISOString(),
    shares: 1000,
    price: 0.5,
    overProbability: 0.5,
    direction: recent ? 1 : -1,
    walletHash: ['a', 'b', 'c'][i % 3]!.repeat(64),
  });
  return {
    gameId: '2025_01_DAL_PHI',
    provider: 'polymarket',
    contractId: '0x' + 'a'.repeat(64),
    line: 47.5,
    kickoffAt: '2025-09-07T17:00:00.000Z',
    cutoffAt: cutoff,
    createdAt: '2025-09-01T00:00:00.000Z',
    capturedAt: '2026-10-13T00:00:00.000Z',
    windowStartAt: new Date(now - 86400000).toISOString(),
    complete: true,
    trades: [
      ...Array.from({ length: 15 }, (_, i) => trade(i)),
      ...Array.from({ length: 10 }, (_, i) => trade(i, true)),
    ],
    prices: [
      { at: new Date(now - 90 * 60000).toISOString(), probability: 0.45 },
      { at: new Date(now - 10 * 60000).toISOString(), probability: 0.55 },
    ],
  };
}
it('centers recent flow against the same contract baseline instead of turning constant direction into information', () => {
  const t = fixture(),
    f = robustTapeFlow(t, cutoff);
  expect(f.supported).toBe(true);
  expect(f.x[0]).toBe(1);
  expect(f.x[1]).toBe(1);
  expect(f.walletSupported).toBe(true);
  const persistent = { ...t, trades: t.trades.map((r) => ({ ...r, direction: 1 as const })) };
  expect(robustTapeFlow(persistent, cutoff).x).toEqual([0, 0, 0, 0]);
});
it('aggregates before size caps and large-trade thresholds so split fills cannot acquire extra influence', () => {
  const t = fixture(),
    before = robustTapeFlow(t, cutoff),
    split = {
      ...t,
      trades: t.trades.flatMap((r) =>
        Array.from({ length: 5 }, (_, j) => ({ ...r, id: r.id + ':' + j, shares: r.shares / 5 })),
      ),
    };
  const after = robustTapeFlow(split, cutoff);
  expect(after.x).toEqual(before.x);
  expect(after.threshold).toBe(before.threshold);
  expect(after.recentMinutes).toBe(before.recentMinutes);
});
it('requires distinct minutes, preserves incomplete-history gates, and excludes off-book pressure', () => {
  const t = fixture(),
    clustered = {
      ...t,
      trades: t.trades.map((r) =>
        r.id.includes(':r:') ? { ...r, at: new Date(now - 10 * 60000).toISOString() } : r,
      ),
    };
  expect(robustTapeFlow(clustered, cutoff).supported).toBe(false);
  expect(robustTapeFlow({ ...t, complete: false }, cutoff).x).toEqual([0, 0, 0, 0]);
  const k: RobustFlowTape = {
    ...t,
    provider: 'kalshi',
    directionSchema: 'kalshi-exposure-v1',
    trades: t.trades.map((r) => {
      const withoutWallet = { ...r };
      delete withoutWallet.walletHash;
      return { ...withoutWallet, isBlockTrade: r.direction === 1 };
    }),
  };
  expect(robustTapeFlow(k, cutoff).supported).toBe(false);
  expect(robustTapeFlow(k, cutoff).blockTradesExcluded).toBe(10);
  const legacy = { ...k };
  delete legacy.directionSchema;
  expect(() => robustTapeFlow(legacy, cutoff)).toThrow('canonical');
});
it('requires contemporaneous price agreement for confirmed flow, never a terminal or future observation', () => {
  const t = fixture();
  expect(robustTapeFlow(t, cutoff, 'confirmed').x[0]).toBe(1);
  const flat = { ...t, prices: t.prices.map((p) => ({ ...p, probability: 0.5 })) };
  expect(robustTapeFlow(flat, cutoff, 'confirmed').x).toEqual([0, 0, 0, 0]);
  const adverse = { ...t, prices: t.prices.map((p) => ({ ...p, probability: 1 - p.probability })) };
  expect(robustTapeFlow(adverse, cutoff, 'confirmed').x).toEqual([0, 0, 0, 0]);
  expect(() =>
    robustTapeFlow(
      { ...t, prices: [{ at: '2025-09-07T16:31:00.000Z', probability: 0.6 }] },
      cutoff,
    ),
  ).toThrow();
});
it('joins exact game/line/cutoff and never reintroduces coverage or unsigned volume columns', () => {
  const t = fixture(),
    get = prepareRobustTotalFlowFeatures([t]),
    g = {
      id: t.gameId,
      season: 2025,
      week: 1,
      seasonType: 'REG' as const,
      date: '2025-09-07',
      home: 'PHI',
      away: 'DAL',
      kickoffAt: t.kickoffAt,
      totalLine: t.line,
    },
    x = Array(18).fill(0.1),
    f = get(g, cutoff, x);
  for (const i of [2, 5, 8, 11, 14, 17]) expect(f.x[i]).toBe(0);
  expect(f.flowCount).toBe(1);
  expect(get({ ...g, totalLine: 46.5 }, cutoff, x).flowCount).toBe(0);
  expect(get(g, new Date(now - 60000).toISOString(), x).flowCount).toBe(0);
  expect(() => prepareRobustTotalFlowFeatures([t, t])).toThrow('Duplicate');
});
