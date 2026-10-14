import { readFile } from 'node:fs/promises';
import { inputs, summarize, hash } from './expanded-total-evaluation.mjs';
import { prepareExpandedExternalTotalsModel } from '../packages/core/dist/expanded-external-totals-model.js';
const [contexts, signals, frozenPath] = process.argv.slice(2);
if (!contexts || !signals || !frozenPath)
  throw new Error('Usage: <contexts> <signals> <v12-settings>');
const frozen = JSON.parse(await readFile(frozenPath));
if (
  frozen.contextSha256 !== hash(await readFile(contexts)) ||
  frozen.signalsSha256 !== hash(await readFile(signals))
)
  throw new Error('Frozen inputs mismatch');
for (const [p, h] of Object.entries(frozen.codeHashes))
  if (hash(await readFile(p)) !== h) throw new Error('Frozen source mismatch');
const e = await inputs(contexts, signals),
  model = prepareExpandedExternalTotalsModel(e.model, e.signals.tapes, frozen.selected),
  old = JSON.parse(await readFile('docs/research/2026-10-13-v12-r2-audit.json', 'utf8')),
  byId = new Map(old.rows.filter((r) => r.kind === 'total').map((r) => [r.id, r]));
const logit = (p) => Math.log(p / (1 - p)),
  sigmoid = (x) => 1 / (1 + Math.exp(-x)),
  clip = (x) => Math.max(-0.15, Math.min(0.15, x));
const blocks = {
  price: [0, 1, 9, 10],
  coverage: [2, 8, 11, 17],
  flow: [3, 4, 5, 12, 13, 14],
  early: [6, 15],
  wallet: [7, 16],
};
const rows = e.base
  .filter((r) => r.kind === 'total')
  .map(({ game, raw, ...r }) => {
    const cutoff = new Date(Date.parse(game.kickoffAt) - 1800000).toISOString(),
      f = model.features(game, r.book, cutoff),
      fit = f.supported ? model.fit(game) : { training: 0, coefficients: Array(18).fill(0) },
      p = model.probability(game, raw, r.book, cutoff);
    if (Math.abs(p - byId.get(r.id).p) > 1e-12)
      throw new Error('V12 diagnosis does not reproduce original predictions');
    const contributions = Object.fromEntries(
      Object.entries(blocks).map(([name, indices]) => [
        name,
        fit.training >= 20 ? indices.reduce((s, i) => s + f.x[i] * fit.coefficients[i], 0) : 0,
      ]),
    );
    const logits = Object.values(contributions).reduce((s, v) => s + v, 0),
      ablations = Object.fromEntries(
        Object.entries(contributions).map(([name, c]) => [
          name,
          f.supported && fit.training >= 20 ? sigmoid(logit(r.book) + clip(logits - c)) : r.book,
        ]),
      );
    return {
      ...r,
      p,
      delta: p - r.book,
      excess: (p - r.y) ** 2 - (r.book - r.y) ** 2,
      linear: 2 * (r.book - r.y) * (p - r.book),
      quadratic: (p - r.book) ** 2,
      supported: f.supported,
      flowCount: f.flowCount,
      earlyCount: f.earlyCount,
      walletCount: f.walletCount,
      training: fit.training,
      contributions,
      ablations,
    };
  });
const mean = (rs, f) => (rs.length ? rs.reduce((s, r) => s + f(r), 0) / rs.length : null);
function describe(rs) {
  return {
    scores: summarize(rs),
    overs: rs.reduce((s, r) => s + r.y, 0),
    overRate: mean(rs, (r) => r.y),
    meanBook: mean(rs, (r) => r.book),
    meanPrediction: mean(rs, (r) => r.p),
    meanDelta: mean(rs, (r) => r.delta),
    meanLinearExcess: mean(rs, (r) => r.linear),
    meanQuadraticExcess: mean(rs, (r) => r.quadratic),
    changed: rs.filter((r) => Math.abs(r.delta) > 1e-12).length,
    underCorrections: rs.filter((r) => r.delta < -1e-12).length,
    overCorrections: rs.filter((r) => r.delta > 1e-12).length,
    flowGames: rs.filter((r) => r.flowCount).length,
    earlyGames: rs.filter((r) => r.earlyCount).length,
    walletGames: rs.filter((r) => r.walletCount).length,
    meanBlockLogits: Object.fromEntries(
      Object.keys(blocks).map((name) => [name, mean(rs, (r) => r.contributions[name])]),
    ),
    fixedCoefficientAblations: Object.fromEntries(
      Object.keys(blocks).map((name) => [
        name,
        summarize(rs.map((r) => ({ ...r, p: r.ablations[name] }))),
      ]),
    ),
  };
}
const late = rows.filter((r) => r.season === 2025 && r.week >= 9),
  cuts = [
    ['2024', (r) => r.season === 2024],
    ['2025-W1-8', (r) => r.season === 2025 && r.week <= 8],
    ['2025-W9-12', (r) => r.season === 2025 && r.week >= 9 && r.week <= 12],
    ['2025-W13-18', (r) => r.season === 2025 && r.week >= 13],
    ['2026-W1-5', (r) => r.season === 2026],
  ];
console.log(
  JSON.stringify(
    {
      diagnosedAt: new Date().toISOString(),
      contextSha256: frozen.contextSha256,
      signalsSha256: frozen.signalsSha256,
      late2025: describe(late),
      phases: cuts.map(([phase, test]) => ({ phase, ...describe(rows.filter(test)) })),
      weeks: Array.from({ length: 18 }, (_, i) => ({
        week: i + 1,
        ...describe(rows.filter((r) => r.season === 2025 && r.week === i + 1)),
      })),
      largestLosses: [...late].sort((a, b) => b.excess - a.excess).slice(0, 15),
      largestGains: [...late].sort((a, b) => a.excess - b.excess).slice(0, 15),
      warnings: [
        'Fixed-coefficient feature ablations diagnose associations, not causal effects or independent new model tests.',
        'Late 2025 and 2026 have already been examined. Diagnosis-informed design cannot turn these periods into untouched validation.',
      ],
    },
    null,
    2,
  ),
);
