import { readFile, stat } from 'node:fs/promises';
import { inputs, hash, summarize } from './expanded-total-evaluation.mjs';
import { prepareExpandedExternalTotalsModel } from '../packages/core/dist/research/expanded-external-totals-model.js';
import {
  prepareSeasonalExternalTotalsModel,
  seasonalExternalParameters,
} from '../packages/core/dist/research/seasonal-external-totals-model.js';
import {
  prepareDirectionalSeasonalTotalsModel,
  directionalTotalPolicy,
  priceOnlyTotalPolicy,
} from '../packages/core/dist/research/directional-seasonal-totals-model.js';
export {
  hash,
  summarize,
  seasonalExternalParameters,
  directionalTotalPolicy,
  priceOnlyTotalPolicy,
};
export async function json(path, max = 20000000) {
  if ((await stat(path)).size > max) throw new Error('Research artifact too large');
  return JSON.parse(await readFile(path, 'utf8'));
}
export async function prepare(contexts, signals, parentPath) {
  const parent = await json(parentPath);
  if (
    parent.contextSha256 !== hash(await readFile(contexts)) ||
    parent.signalsSha256 !== hash(await readFile(signals))
  )
    throw new Error('Parent input mismatch');
  for (const [p, h] of Object.entries(parent.codeHashes))
    if (hash(await readFile(p)) !== h) throw new Error('Frozen parent source mismatch');
  const verification = await json('docs/research/model-v13-verification.json'),
    parentAuditPath = 'docs/research/2026-10-13-v13-audit.json';
  if (hash(await readFile(parentAuditPath)) !== verification.auditSha256)
    throw new Error('Parent audit changed');
  const parentAudit = await json(parentAuditPath);
  if (parentAudit.frozenSha256 !== hash(await readFile(parentPath)))
    throw new Error('Parent audit settings mismatch');
  const prior = await json(parent.priorSettingsPath);
  if (hash(await readFile(parent.priorSettingsPath)) !== parent.priorSettingsSha256)
    throw new Error('Feature settings changed');
  const e = await inputs(contexts, signals),
    external = prepareExpandedExternalTotalsModel(e.model, e.signals.tapes, prior.selected);
  const features = e.base
    .filter((r) => r.kind === 'total')
    .map((r) => {
      const f = external.features(
        r.game,
        r.book,
        new Date(Date.parse(r.game.kickoffAt) - 1800000).toISOString(),
      );
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
  const byId = new Map(features.map((r) => [r.game.id, r])),
    oldById = new Map(parentAudit.rows.map((r) => [`${r.kind}:${r.id}`, r]));
  const spec = {
    halfLifeWeeks: parent.selected.halfLifeWeeks,
    priorSeasonWeight: parent.selected.priorSeasonWeight,
  };
  const evaluate = (predicate, policy = 'directional') => {
    const adapter = prepareDirectionalSeasonalTotalsModel(e.model, features, spec, policy);
    return e.base.filter(predicate).map(({ game, raw, ...r }) => {
      const old = oldById.get(`${r.kind}:${r.id}`);
      if (!old || old.y !== r.y || old.book !== r.book || old.previous !== r.previous)
        throw new Error('Parent paired-cohort mismatch');
      if (r.kind !== 'total')
        return {
          ...r,
          p: adapter.probability(r.kind, game, raw, r.book, Array(18).fill(0), false),
          v13: old.p,
        };
      const f = byId.get(r.id),
        out = adapter.forecast(game, r.book, f.x, f.supported);
      return {
        ...r,
        p: out.probability,
        v13: old.p,
        unadapted: out.rawProbability,
        supported: f.supported,
        reliabilityWeight: out.reliability.weight,
        feedbackGames: out.reliability.games,
        feedbackEffectiveGames: out.reliability.effectiveGames,
        training: out.fit?.training ?? 0,
        trainingEffectiveGames: out.fit?.effectiveGames ?? 0,
        priceCount: f.priceCount,
        flowCount: f.flowCount,
        earlyCount: f.earlyCount,
        walletCount: f.walletCount,
      };
    });
  };
  return {
    ...e,
    parent,
    parentAudit,
    parentAuditPath,
    features,
    byId,
    oldById,
    spec,
    evaluate,
    oldAdapter: () => prepareSeasonalExternalTotalsModel(e.model, features, parent.selected),
  };
}
export function overview(rows) {
  const rs = rows.filter((r) => r.kind === 'total'),
    active = rs.filter((r) => Math.abs(r.p - r.book) > 1e-12),
    ungatedActive = rs.filter((r) => Math.abs(r.unadapted - r.book) > 1e-12),
    v13Active = rs.filter((r) => Math.abs(r.v13 - r.book) > 1e-12);
  return {
    totals: summarize(rs),
    v13: summarize(rs.map((r) => ({ ...r, p: r.v13 }))),
    ungated: summarize(rs.map((r) => ({ ...r, p: r.unadapted }))),
    active: summarize(active),
    bookActive: summarize(active.map((r) => ({ ...r, p: r.book }))),
    ungatedActive: summarize(ungatedActive.map((r) => ({ ...r, p: r.unadapted }))),
    v13Active: summarize(v13Active.map((r) => ({ ...r, p: r.v13 }))),
    pairedV13Improvement: summarize(rs.map((r) => ({ ...r, previous: r.v13 })))
      .previousImprovementInterval,
    changed: active.length,
    exactBookFallback: rs.length - active.length,
    v13Changed: v13Active.length,
    coverage: rs.filter((r) => r.supported).length,
    meanReliabilityWeight: rs.reduce((s, r) => s + r.reliabilityWeight, 0) / Math.max(1, rs.length),
    nonTotalMaximumProductionDifference: Math.max(
      0,
      ...rows.filter((r) => r.kind !== 'total').map((r) => Math.abs(r.p - r.previous)),
    ),
  };
}
