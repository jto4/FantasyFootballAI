import { readFile } from 'node:fs/promises';
import {
  prepare as originalPrepare,
  json,
  hash,
  summarize,
} from './directional-total-evaluation.mjs';
import { prepareExpandedExternalTotalsModel } from '../packages/core/dist/research/expanded-external-totals-model.js';
import { prepareDirectionalSeasonalTotalsModel } from '../packages/core/dist/research/directional-seasonal-totals-model.js';
import {
  prepareRobustTotalFlowFeatures,
  robustFlowParameters,
} from '../packages/core/dist/research/robust-total-trade-flow.js';
import { seasonalExternalParameters } from '../packages/core/dist/research/seasonal-external-totals-model.js';
export { json, hash, summarize, robustFlowParameters, seasonalExternalParameters };
export async function prepare(contexts, originalPath, correctedPath, parentPath) {
  const parent = await json(parentPath);
  for (const [p, h] of Object.entries(parent.codeHashes))
    if (hash(await readFile(p)) !== h) throw new Error('Parent source changed');
  if (
    parent.contextSha256 !== hash(await readFile(contexts)) ||
    parent.signalsSha256 !== hash(await readFile(originalPath))
  )
    throw new Error('Parent input mismatch');
  const v = await json('docs/research/model-v14-verification.json'),
    parentAuditPath = 'docs/research/2026-10-13-v14-audit.json';
  if (hash(await readFile(parentAuditPath)) !== v.auditSha256)
    throw new Error('Parent audit changed');
  const oldAudit = await json(parentAuditPath);
  if (oldAudit.frozenSha256 !== hash(await readFile(parentPath)))
    throw new Error('Parent settings changed');
  const original = await originalPrepare(contexts, originalPath, parent.parentSettingsPath),
    s = await json(correctedPath, 200000000);
  if (
    s.version !== 2 ||
    s.complete !== true ||
    s.contextSha256 !== parent.contextSha256 ||
    s.directionCorrection?.sourceSignalsSha256 !== parent.signalsSha256 ||
    s.tapes.length !== original.signals.tapes.length
  )
    throw new Error('Corrected history mismatch');
  for (let i = 0; i < s.tapes.length; i++) {
    const t = s.tapes[i],
      old = original.signals.tapes[i];
    const strip = (t) => ({
      ...t,
      directionSchema: undefined,
      trades: t.trades.map((r) => ({ ...r, direction: undefined, isBlockTrade: undefined })),
      ...(t.earlyTrades
        ? {
            earlyTrades: t.earlyTrades.map((r) => ({
              ...r,
              direction: undefined,
              isBlockTrade: undefined,
            })),
          }
        : {}),
    });
    if (
      t.provider === 'polymarket'
        ? JSON.stringify(t) !== JSON.stringify(old)
        : JSON.stringify(strip(t)) !== JSON.stringify(strip(old))
    )
      throw new Error('Direction repair modified other source fields');
  }
  const featureSettings = await json(original.parent.priorSettingsPath),
    external = prepareExpandedExternalTotalsModel(
      original.model,
      s.tapes,
      featureSettings.selected,
    ),
    robust = prepareRobustTotalFlowFeatures(s.tapes),
    oldById = new Map(oldAudit.rows.map((r) => [`${r.kind}:${r.id}`, r]));
  const corrected = original.base
    .filter((r) => r.kind === 'total')
    .map((r) => {
      const cutoff = new Date(Date.parse(r.game.kickoffAt) - 1800000).toISOString(),
        f = external.features(r.game, r.book, cutoff);
      return { ...f, game: r.game, book: r.book, y: r.y, cutoff };
    });
  const byId = new Map(corrected.map((r) => [r.game.id, r]));
  function featureRows(policy) {
    return corrected.map((r) => {
      if (policy === 'direction-fix-only') return { ...r, details: undefined };
      const f = robust(r.game, r.cutoff, r.x, policy);
      return { ...r, x: f.x, supported: r.priceCount > 0 || f.flowCount > 0, details: f };
    });
  }
  function evaluate(policy, predicate) {
    const features = featureRows(policy),
      map = new Map(features.map((r) => [r.game.id, r])),
      adapter = prepareDirectionalSeasonalTotalsModel(original.model, features, parent.selected);
    return original.base.filter(predicate).map(({ game, raw, ...r }) => {
      const old = oldById.get(`${r.kind}:${r.id}`);
      if (!old || old.y !== r.y || old.book !== r.book || old.previous !== r.previous)
        throw new Error('Paired-cohort mismatch');
      if (r.kind !== 'total')
        return { ...r, p: adapter.probability(r.kind, game, raw, r.book, [], false), v14: old.p };
      const f = map.get(r.id),
        out = adapter.forecast(game, r.book, f.x, f.supported);
      return {
        ...r,
        p: out.probability,
        v14: old.p,
        unadapted: out.rawProbability,
        supported: f.supported,
        priceCount: f.priceCount,
        oldFlowCount: f.flowCount,
        robustFlowCount: f.details?.flowCount ?? 0,
        confirmedFlowCount: f.details?.confirmedCount ?? 0,
        reliabilityWeight: out.reliability.weight,
        feedbackGames: out.reliability.games,
        training: out.fit?.training ?? 0,
        flowDetails: f.details?.providers,
      };
    });
  }
  return {
    ...original,
    parent,
    oldAudit,
    parentAuditPath,
    corrected,
    byId,
    featureRows,
    evaluate,
    correctedSignals: s,
  };
}
export function overview(rows) {
  const rs = rows.filter((r) => r.kind === 'total'),
    active = rs.filter((r) => Math.abs(r.p - r.book) > 1e-12);
  return {
    totals: summarize(rs),
    v14: summarize(rs.map((r) => ({ ...r, p: r.v14 }))),
    ungated: summarize(rs.map((r) => ({ ...r, p: r.unadapted }))),
    active: summarize(active),
    changed: active.length,
    materialChangesAt1e6: rs.filter((r) => Math.abs(r.p - r.book) >= 1e-6).length,
    exactBookFallback: rs.length - active.length,
    maxAbsBookDifference: Math.max(0, ...rs.map((r) => Math.abs(r.p - r.book))),
    coverage: rs.filter((r) => r.supported).length,
    robustFlowGames: rs.filter((r) => r.robustFlowCount).length,
    confirmedFlowGames: rs.filter((r) => r.confirmedFlowCount).length,
    nonTotalMaximumProductionDifference: Math.max(
      0,
      ...rows.filter((r) => r.kind !== 'total').map((r) => Math.abs(r.p - r.previous)),
    ),
  };
}
