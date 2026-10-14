import { readFile } from 'node:fs/promises';
import { prepare, hash, summarize } from './trade-flow-evaluation.mjs';
import { prepareDirectionalSeasonalTotalsModel } from '../packages/core/dist/directional-seasonal-totals-model.js';
const [contexts, oldPath, correctedPath, parentPath] = process.argv.slice(2);
if (!contexts || !oldPath || !correctedPath || !parentPath)
  throw new Error('Usage: <contexts> <original-signals> <corrected-signals> <v14-settings>');
const e = await prepare(contexts, oldPath, correctedPath, parentPath),
  adapter = prepareDirectionalSeasonalTotalsModel(e.model, e.features, e.parent.selected),
  byId = new Map(e.features.map((r) => [r.game.id, r])),
  oldById = new Map(e.oldAudit.rows.map((r) => [`${r.kind}:${r.id}`, r])),
  sigmoid = (x) => 1 / (1 + Math.exp(-x)),
  logit = (p) => Math.log(p / (1 - p)),
  clip = (x) => Math.max(-0.15, Math.min(0.15, x));
const groups = {
  prices: [0, 1, 6, 7],
  kalshiFlow: [2, 3, 4, 5],
  polymarketFlow: [8, 9, 10, 11],
  recent: [2, 8],
  large: [3, 9],
  earlier: [4, 10],
  wallet: [5, 11],
};
const rows = e.base
  .filter((r) => r.kind === 'total')
  .map(({ game, raw: _raw, ...r }) => {
    const f = byId.get(r.id),
      out = adapter.forecast(game, r.book, f.x, f.supported),
      old = oldById.get(`total:${r.id}`);
    if (out.probability !== old.p) throw new Error('V14 diagnosis failed reproduction');
    const indices = [0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 16],
      x = indices.map((i) => f.x[i]);
    const terms = Object.fromEntries(
      Object.entries(groups).map(([name, columns]) => [
        name,
        out.fit?.training >= 20
          ? columns.reduce((s, i) => s + x[i] * out.fit.coefficients[i], 0)
          : 0,
      ]),
    );
    const all = terms.prices + terms.kalshiFlow + terms.polymarketFlow,
      ablate = (name) =>
        r.book +
        out.reliability.weight * (sigmoid(logit(r.book) + clip(all - terms[name])) - r.book),
      p = out.probability,
      d = p - r.book;
    const corrected = e.byId.get(r.id),
      recentTapeStats = e.correctedSignals.tapes
        .filter((t) => t.gameId === r.id)
        .map((t) => {
          const rs = t.trades.filter((v) => Date.parse(v.at) > Date.parse(t.cutoffAt) - 3600000),
            weights = rs.map((v) => Math.min(5000, v.shares)),
            sum = weights.reduce((s, v) => s + v, 0);
          return {
            provider: t.provider,
            n: rs.length,
            minutes: new Set(rs.map((v) => Math.floor(Date.parse(v.at) / 60000))).size,
            positive: rs.filter((v) => v.direction === 1).length,
            largestCappedShare: sum ? Math.max(...weights) / sum : 0,
            wallets: new Set(rs.map((v) => v.walletHash).filter(Boolean)).size,
          };
        });
    return {
      ...r,
      p,
      delta: d,
      linear: 2 * (r.book - r.y) * d,
      quadratic: d * d,
      excess: (p - r.y) ** 2 - (r.book - r.y) ** 2,
      terms,
      oldFeatures: f.x,
      correctedFeatures: corrected.x,
      recentTapeStats,
      ablations: Object.fromEntries(
        ['kalshiFlow', 'polymarketFlow', 'recent', 'large', 'earlier', 'wallet'].map((name) => [
          name,
          ablate(name),
        ]),
      ),
    };
  });
const mean = (rs, fn) => rs.reduce((s, r) => s + fn(r), 0) / Math.max(1, rs.length);
function summary(rs) {
  return {
    scores: summarize(rs),
    meanLinearExcess: mean(rs, (r) => r.linear),
    meanQuadraticExcess: mean(rs, (r) => r.quadratic),
    meanDelta: mean(rs, (r) => r.delta),
    fixedFitFeedbackAblations: Object.fromEntries(
      Object.keys(groups)
        .filter((n) => n !== 'prices')
        .map((name) => [name, summarize(rs.map((r) => ({ ...r, p: r.ablations[name] })))]),
    ),
    flowDistribution: ['kalshi', 'polymarket'].map((provider, i) => ({
      provider,
      oldNetMean: mean(rs, (r) => r.oldFeatures[i * 9 + 3]),
      correctedNetMean: mean(rs, (r) => r.correctedFeatures[i * 9 + 3]),
      saturatedOldNet: rs.filter((r) => Math.abs(r.oldFeatures[i * 9 + 3]) > 0.95).length,
      saturatedCorrectedNet: rs.filter((r) => Math.abs(r.correctedFeatures[i * 9 + 3]) > 0.95)
        .length,
      fewerThanFiveRecentMinutes: rs.filter((r) =>
        r.recentTapeStats.some((t) => t.provider === provider && t.n >= 5 && t.minutes < 5),
      ).length,
      dominantSingleTradeAboveHalf: rs.filter((r) =>
        r.recentTapeStats.some((t) => t.provider === provider && t.largestCappedShare > 0.5),
      ).length,
    })),
  };
}
const late = rows.filter((r) => r.season === 2025 && r.week >= 9);
console.log(
  JSON.stringify(
    {
      diagnosedAt: new Date().toISOString(),
      source: 'https://docs.kalshi.com/getting_started/order_direction',
      contextSha256: e.parent.contextSha256,
      originalSignalsSha256: e.parent.signalsSha256,
      correctedSignalsSha256: hash(await readFile(correctedPath)),
      parentSettingsSha256: hash(await readFile(parentPath)),
      parentAuditSha256: hash(await readFile(e.parentAuditPath)),
      late2025: summary(late),
      current2026: summary(rows.filter((r) => r.season === 2026)),
      largestLosses: [...late].sort((a, b) => b.excess - a.excess).slice(0, 12),
      warnings: [
        'Old Kalshi direction encoding is defective, so earlier signed-flow attribution and wins cannot be treated as evidence of correctly oriented flow.',
        'Fixed-fit ablations are descriptive only. Corrected-feature distribution is computed without scoring a new candidate.',
        'All later samples were previously inspected and remain reused research.',
      ],
    },
    null,
    2,
  ),
);
