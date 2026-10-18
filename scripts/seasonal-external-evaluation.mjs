import { readFile } from 'node:fs/promises';
import { inputs, hash, summarize } from './expanded-total-evaluation.mjs';
import { prepareExpandedExternalTotalsModel } from '../packages/core/dist/research/expanded-external-totals-model.js';
import {
  prepareSeasonalExternalTotalsModel,
  seasonalExternalParameters,
} from '../packages/core/dist/research/seasonal-external-totals-model.js';
export { hash, summarize, seasonalExternalParameters };
export const specs = ['directional', 'all'].flatMap((features) =>
  [4, 8].flatMap((halfLifeWeeks) =>
    [0, 0.25].map((priorSeasonWeight) => ({ features, halfLifeWeeks, priorSeasonWeight })),
  ),
);
export const specId = (s) => `${s.features}-${s.halfLifeWeeks}-${s.priorSeasonWeight}`;
export async function prepare(contexts, signals, priorPath) {
  const prior = JSON.parse(await readFile(priorPath));
  if (
    prior.contextSha256 !== hash(await readFile(contexts)) ||
    prior.signalsSha256 !== hash(await readFile(signals))
  )
    throw new Error('Prior snapshot mismatch');
  for (const [p, h] of Object.entries(prior.codeHashes))
    if (hash(await readFile(p)) !== h) throw new Error('Prior source mismatch');
  const e = await inputs(contexts, signals),
    external = prepareExpandedExternalTotalsModel(e.model, e.signals.tapes, prior.selected),
    saved = JSON.parse(await readFile('docs/research/2026-10-13-v12-r2-audit.json', 'utf8')),
    savedTotals = new Map(saved.rows.filter((r) => r.kind === 'total').map((r) => [r.id, r]));
  const features = e.base
    .filter((r) => r.kind === 'total')
    .map((r) => {
      const cutoff = new Date(Date.parse(r.game.kickoffAt) - 1800000).toISOString(),
        f = external.features(r.game, r.book, cutoff);
      return {
        game: r.game,
        book: r.book,
        y: r.y,
        supported: f.supported,
        x: f.x,
        priceCount: f.priceCount,
        flowCount: f.flowCount,
        earlyCount: f.earlyCount,
        walletCount: f.walletCount,
      };
    });
  const byId = new Map(features.map((r) => [r.game.id, r]));
  const evaluate = (spec, predicate) => {
    const candidate = prepareSeasonalExternalTotalsModel(e.model, features, spec);
    return e.base.filter(predicate).map(({ game, raw, ...r }) => {
      if (r.kind !== 'total')
        return {
          ...r,
          p: candidate.probability(r.kind, game, raw, r.book, Array(18).fill(0), false),
          v12: r.previous,
        };
      const f = byId.get(r.id),
        out = candidate.forecast(game, r.book, f.x, f.supported),
        v12 = savedTotals.get(r.id);
      if (!v12 || v12.y !== r.y || v12.book !== r.book)
        throw new Error('Prior audit context mismatch');
      return {
        ...r,
        p: out.probability,
        v12: v12.p,
        unadapted: out.rawProbability,
        supported: f.supported,
        reliabilityWeight: out.reliability.weight,
        feedbackGames: out.reliability.games,
        feedbackEffectiveGames: out.reliability.effectiveGames,
        training: out.fit?.training ?? 0,
        trainingEffectiveGames: out.fit?.effectiveGames ?? 0,
        currentSeasonTrainingGames: out.fit?.currentSeasonGames ?? 0,
      };
    });
  };
  return { prior, features, base: e.base, development: e.development, audit: e.audit, evaluate };
}
export function overview(rows) {
  const totals = rows.filter((r) => r.kind === 'total'),
    count = totals.filter((r) => Math.abs(r.p - r.book) > 1e-12).length;
  return {
    totals: summarize(totals),
    v12: summarize(totals.map((r) => ({ ...r, p: r.v12 }))),
    ungated: summarize(totals.map((r) => ({ ...r, p: r.unadapted }))),
    active: summarize(totals.filter((r) => Math.abs(r.p - r.book) > 1e-12)),
    changed: count,
    exactBookFallback: totals.length - count,
    coverage: totals.filter((r) => r.supported).length,
    meanReliabilityWeight:
      totals.reduce((s, r) => s + r.reliabilityWeight, 0) / Math.max(1, totals.length),
    nonTotalMaximumProductionDifference: Math.max(
      0,
      ...rows.filter((r) => r.kind !== 'total').map((r) => Math.abs(r.p - r.previous)),
    ),
  };
}
