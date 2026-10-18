import { readFile } from 'node:fs/promises';
import {
  prepare as recentPrepare,
  json,
  hash,
  summarize,
  writeArtifact,
  canonicalJson,
} from './recent-total-evaluation.mjs';
import {
  prepareStableTotalFeedback,
  stableTotalFeedbackParameters,
} from '../../packages/core/dist/research/stable-total-feedback.js';
export { json, hash, summarize, writeArtifact, canonicalJson, stableTotalFeedbackParameters };
export const specs = ['pooled', 'directional'].flatMap((scope) => [
  { method: 'cluster', strength: 0.5, scope },
  { method: 'cluster', strength: 1, scope },
  { method: 'leave-week-out', strength: 1, scope },
]);
export const specId = (s) => `stable-${s.method}-${s.strength}-${s.scope}`;
export const newFiles = [
  'packages/core/src/research/stable-total-feedback.ts',
  'scripts/research/stable-total-evaluation.mjs',
  'scripts/research/diagnose-older-total-seasons.mjs',
  'scripts/research/develop-stable-total-feedback.mjs',
  'scripts/research/audit-stable-total-feedback.mjs',
];
export async function prepare(contexts, oldPath, correctedPath, statsPath) {
  const parentPath = 'docs/research/2026-10-13-v17-frozen-settings.json',
    parentAuditPath = 'docs/research/2026-10-13-v17-audit.json',
    parent = await json(parentPath),
    v = await json('docs/research/model-v17-verification.json');
  if (
    hash(await readFile(parentPath)) !== v.frozenSettingsSha256 ||
    hash(await readFile(parentAuditPath)) !== v.auditSha256
  )
    throw Error('Parent v17 changed');
  for (const [p, h] of Object.entries(parent.codeHashes))
    if (hash(await readFile(p)) !== h) throw Error('Frozen parent source changed');
  for (const [p, h] of [
    [contexts, parent.contextSha256],
    [oldPath, parent.originalSignalsSha256],
    [correctedPath, parent.correctedSignalsSha256],
    [statsPath, parent.driveStatsSha256],
  ])
    if (hash(await readFile(p)) !== h) throw Error('Parent inputs changed');
  const e = await recentPrepare(contexts, oldPath, correctedPath, statsPath),
    old = await json(parentAuditPath),
    byId = new Map(old.results[parent.primary].rows.map((r) => [`${r.kind}:${r.id}`, r])),
    legacy = e.adapter(parent.selected),
    adapters = new Map();
  for (const r of e.base.filter((r) => r.kind === 'total')) {
    const f = e.rawById.get(r.id),
      p = legacy.forecast(r.game, r.book, f.rawProbability, f.supported);
    if (p.probability !== byId.get(`total:${r.id}`).p)
      throw Error('Parent forecast reproduction mismatch');
  }
  function adapter(spec) {
    let a = adapters.get(specId(spec));
    if (!a) {
      a = prepareStableTotalFeedback(e.model, e.rawRows, spec);
      adapters.set(specId(spec), a);
    }
    return a;
  }
  function scoreTotal(a, r) {
    const out = a.forecast(r.game, r.book, r.rawProbability, r.supported);
    return {
      p: out.probability,
      unadapted: out.rawProbability,
      supported: r.supported,
      reliabilityWeight: out.reliability.weight,
      ordinaryWeight: out.reliability.ordinaryWeight,
      feedbackGames: out.reliability.games,
      feedbackWeeks: out.reliability.weeks,
      feedbackEffectiveGames: out.reliability.effectiveGames,
      feedbackSufficient: out.reliability.sufficient,
      standardError: out.reliability.standardError,
      leaveWeekOutMinimum: out.reliability.leaveWeekOutMinimum,
      direction: out.reliability.direction,
    };
  }
  function evaluate(spec, predicate) {
    const a = adapter(spec);
    return e.base.filter(predicate).map(({ game, raw, ...r }) => {
      const prior = byId.get(`${r.kind}:${r.id}`);
      if (!prior || prior.book !== r.book || prior.y !== r.y || prior.previous !== r.previous)
        throw Error('Matched cohort changed');
      if (r.kind !== 'total')
        return { ...r, p: a.probability(r.kind, game, raw, r.book, false), v17: prior.p };
      const f = e.rawById.get(r.id);
      return { ...r, v17: prior.p, ...scoreTotal(a, f) };
    });
  }
  function development(spec) {
    const a = adapter(spec);
    return e.rawRows
      .filter((r) => [2021, 2022].includes(r.game.season))
      .map((r) => {
        const old = legacy.forecast(r.game, r.book, r.rawProbability, r.supported);
        return {
          id: r.game.id,
          season: r.game.season,
          week: r.game.week,
          kind: 'total',
          book: r.book,
          y: r.y,
          previous: r.v16,
          v17: old.probability,
          ...scoreTotal(a, r),
        };
      });
  }
  return {
    ...e,
    parent,
    parentPath,
    parentAuditPath,
    parentAudit: old,
    legacy,
    adapter,
    evaluate,
    development,
  };
}
export function overview(rows) {
  const rs = rows.filter((r) => r.kind === 'total');
  return {
    totals: summarize(rs),
    v17: summarize(rs.map((r) => ({ ...r, p: r.v17 }))),
    ungated: summarize(rs.map((r) => ({ ...r, p: r.unadapted }))),
    pairedV17Improvement: summarize(rs.map((r) => ({ ...r, previous: r.v17 })))
      .previousImprovementInterval,
    coverage: rs.filter((r) => r.supported).length,
    changed: rs.filter((r) => Math.abs(r.p - r.book) > 1e-12).length,
    exactBookFallback: rs.filter((r) => r.p === r.book).length,
    materialChangesAt1e3: rs.filter((r) => Math.abs(r.p - r.book) >= 0.001).length,
    meanAbsoluteBookCorrection:
      rs.reduce((s, r) => s + Math.abs(r.p - r.book), 0) / Math.max(1, rs.length),
    nonTotalMaximumProductionDifference: Math.max(
      0,
      ...rows.filter((r) => r.kind !== 'total').map((r) => Math.abs(r.p - r.previous)),
    ),
  };
}
