import { readFile, writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import { prepare as drivePrepare, json, hash, summarize } from './drive-total-evaluation.mjs';
import { prepareDriveResidualTotalsModel } from '../packages/core/dist/research/drive-residual-totals-model.js';
import {
  prepareRecentTotalFeedback,
  recentTotalFeedbackParameters,
} from '../packages/core/dist/research/recent-total-feedback.js';
export { json, hash, summarize, recentTotalFeedbackParameters };
export const specs = [2, 4].flatMap((halfLifeWeeks) =>
  [0.5, 1].flatMap((maxWeight) =>
    [false, true].map((priorSeed) => ({ halfLifeWeeks, maxWeight, priorSeed })),
  ),
);
export const specId = (s) =>
  `feedback-${s.halfLifeWeeks}-${s.maxWeight}-${s.priorSeed ? 'seed' : 'reset'}`;
export const newFiles = [
  'packages/core/src/research/recent-total-feedback.ts',
  'scripts/recent-total-evaluation.mjs',
  'scripts/diagnose-drive-feedback.mjs',
  'scripts/develop-recent-total-feedback.mjs',
  'scripts/audit-recent-total-feedback.mjs',
];
export async function canonicalJson(value) {
  return format(JSON.stringify(value), {
    ...(await resolveConfig('docs/research/example.json')),
    parser: 'json',
  });
}
export async function writeArtifact(path, value) {
  await writeFile(path, await canonicalJson(value), { flag: 'wx' });
}
export async function prepare(contexts, oldPath, correctedPath, statsPath) {
  const parentPath = 'docs/research/2026-10-13-v16-frozen-settings.json',
    parentAuditPath = 'docs/research/2026-10-13-v16-audit.json',
    parent = await json(parentPath),
    v = await json('docs/research/model-v16-verification.json');
  if (
    hash(await readFile(parentPath)) !== v.frozenSettingsSha256 ||
    hash(await readFile(parentAuditPath)) !== v.auditSha256
  )
    throw new Error('Parent v16 changed');
  for (const [p, h] of Object.entries(parent.codeHashes))
    if (hash(await readFile(p)) !== h) throw new Error('Frozen parent source changed');
  for (const [p, h] of [
    [contexts, parent.contextSha256],
    [oldPath, parent.originalSignalsSha256],
    [correctedPath, parent.correctedSignalsSha256],
    [statsPath, parent.driveStatsSha256],
    ['docs/research/model-v16-drive-provenance.json', parent.driveProvenanceSha256],
  ])
    if (hash(await readFile(p)) !== h) throw new Error('Parent input changed');
  const e = await drivePrepare(contexts, oldPath, correctedPath, statsPath),
    source = prepareDriveResidualTotalsModel(e.model, e.features, parent.selected),
    parentAudit = await json(parentAuditPath),
    byId = new Map(parentAudit.results[parent.primary].rows.map((r) => [`${r.kind}:${r.id}`, r]));
  const rawRows = e.features.map((r) => {
    const out = source.forecast(r.game, r.book, r.x, r.supported);
    const old = byId.get(`total:${r.game.id}`);
    if (
      old &&
      (old.unadapted !== out.rawProbability ||
        old.p !== out.probability ||
        old.y !== r.y ||
        old.book !== r.book)
    )
      throw new Error('Frozen forecast reproduction differs');
    return {
      game: r.game,
      book: r.book,
      y: r.y,
      rawProbability: out.rawProbability,
      supported: r.supported,
      v16: out.probability,
      legacyFeedback: out.reliability,
      fit: out.fit,
    };
  });
  const rawById = new Map(rawRows.map((r) => [r.game.id, r])),
    adapters = new Map();
  function adapter(spec) {
    let a = adapters.get(specId(spec));
    if (!a) {
      a = prepareRecentTotalFeedback(e.model, rawRows, spec);
      adapters.set(specId(spec), a);
    }
    return a;
  }
  function evaluate(spec, predicate) {
    const a = adapter(spec);
    return e.base.filter(predicate).map(({ game, raw, ...r }) => {
      const old = byId.get(`${r.kind}:${r.id}`);
      if (!old || old.y !== r.y || old.book !== r.book || old.previous !== r.previous)
        throw new Error('Paired cohort changed');
      if (r.kind !== 'total')
        return { ...r, p: a.probability(r.kind, game, raw, r.book, false), v16: old.p };
      const f = rawById.get(r.id);
      if (!f) throw new Error('Missing prequential forecast');
      const out = a.forecast(game, r.book, f.rawProbability, f.supported);
      return {
        ...r,
        p: out.probability,
        v16: old.p,
        unadapted: out.rawProbability,
        supported: f.supported,
        reliabilityWeight: out.reliability.weight,
        feedbackGames: out.reliability.games,
        feedbackWeeks: out.reliability.weeks,
        feedbackEffectiveGames: out.reliability.effectiveGames,
        seedEffectiveGames: out.reliability.seedEffectiveGames,
        feedbackSufficient: out.reliability.sufficient,
        legacyFeedbackWeight: f.legacyFeedback.weight,
      };
    });
  }
  return {
    ...e,
    rawRows,
    rawById,
    source,
    parent,
    parentPath,
    parentAuditPath,
    parentAudit,
    adapter,
    evaluate,
  };
}
export function overview(rows) {
  const rs = rows.filter((r) => r.kind === 'total');
  return {
    totals: summarize(rs),
    v16: summarize(rs.map((r) => ({ ...r, p: r.v16 }))),
    ungated: summarize(rs.map((r) => ({ ...r, p: r.unadapted }))),
    pairedV16Improvement: summarize(rs.map((r) => ({ ...r, previous: r.v16 })))
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
