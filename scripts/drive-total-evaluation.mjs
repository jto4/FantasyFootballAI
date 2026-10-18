import { readFile } from 'node:fs/promises';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import { prepare as flowPrepare, json, hash, summarize } from './trade-flow-evaluation.mjs';
import {
  prepareDriveTotalSignals,
  validateDriveTotalStats,
  driveSignalParameters,
} from '../packages/core/dist/drive-total-signals.js';
import {
  prepareDriveResidualTotalsModel,
  driveResidualParameters,
} from '../packages/core/dist/research/drive-residual-totals-model.js';
export { json, hash, summarize, driveSignalParameters, driveResidualParameters };
export const specs = [25, 100].flatMap((penalty) =>
  [false, true].map((flow) => ({ penalty, flow })),
);
export const specId = (s) =>
  `drive-residual-${s.penalty}-${s.flow ? 'with-flow' : 'football-only'}`;
export const newFiles = [
  'packages/core/src/drive-total-signals.ts',
  'packages/core/src/research/drive-residual-totals-model.ts',
  'packages/integrations/src/research/game-drive-signals.ts',
  'scripts/capture-game-drive-signals.mjs',
  'scripts/retain-drive-sources.mjs',
  'scripts/replay-drive-signals.mjs',
  'scripts/diagnose-robust-flow-value.mjs',
  'scripts/drive-total-evaluation.mjs',
  'scripts/develop-drive-totals.mjs',
  'scripts/audit-drive-totals.mjs',
];
export async function prepare(contexts, oldPath, correctedPath, statsPath) {
  const parentPath = 'docs/research/2026-10-13-v15-frozen-settings.json',
    parent = await json(parentPath),
    verification = await json('docs/research/model-v15-verification.json'),
    parentAuditPath = 'docs/research/2026-10-13-v15-audit.json';
  if (
    hash(await readFile(parentPath)) !== verification.frozenSettingsSha256 ||
    hash(await readFile(parentAuditPath)) !== verification.auditSha256 ||
    hash(await readFile(correctedPath)) !== parent.correctedSignalsSha256
  )
    throw new Error('Parent v15 mismatch');
  for (const [p, h] of Object.entries(parent.codeHashes))
    if (hash(await readFile(p)) !== h) throw new Error('Parent source changed');
  const e = await flowPrepare(contexts, oldPath, correctedPath, parent.parentSettingsPath),
    stats = await json(statsPath, 10000000),
    provenance = await json('docs/research/model-v16-drive-provenance.json');
  if (hash(await readFile(statsPath)) !== provenance.snapshotSha256)
    throw new Error('Drive snapshot mismatch');
  validateDriveTotalStats(stats);
  const signal = prepareDriveTotalSignals(await readGameContextSnapshot(contexts), stats),
    flow = new Map(e.featureRows('innovation').map((r) => [r.game.id, r]));
  const features = e.model.observations.flatMap((r) => {
    const q = r.markets.total;
    if (!q || q.push || !r.game.kickoffAt || r.game.season < 2019 || r.game.seasonType !== 'REG')
      return [];
    const f = signal.features(r.game),
      external = flow.get(r.game.id);
    const flowX = [3, 4, 6, 7].map((i) => ((external?.x[i] ?? 0) + (external?.x[i + 9] ?? 0)) / 2);
    return [
      {
        game: r.game,
        book: q.baseline,
        y: q.y,
        residual: r.game.homeScore + r.game.awayScore - r.game.totalLine,
        supported: f.supported,
        x: [...f.x, ...flowX],
        coverage: f.coverage,
        projectedPoints: f.projectedPoints,
        flowSupported: !!external?.details?.flowCount,
      },
    ];
  });
  const byId = new Map(features.map((r) => [r.game.id, r])),
    prior = await json(parentAuditPath),
    old = new Map(prior.results.innovation.rows.map((r) => [`${r.kind}:${r.id}`, r])),
    adapters = new Map();
  function evaluate(spec, predicate) {
    let a = adapters.get(specId(spec));
    if (!a) {
      a = prepareDriveResidualTotalsModel(e.model, features, spec);
      adapters.set(specId(spec), a);
    }
    return e.base.filter(predicate).map(({ game, raw, ...r }) => {
      const p = old.get(`${r.kind}:${r.id}`);
      if (!p || p.book !== r.book || p.y !== r.y || p.previous !== r.previous)
        throw new Error('Matched cohort changed');
      if (r.kind !== 'total')
        return { ...r, p: a.probability(r.kind, game, raw, r.book, [], false), v15: p.p };
      const f = byId.get(r.id);
      if (!f) throw new Error('Missing drive feature row');
      const o = a.forecast(game, r.book, f.x, f.supported);
      return {
        ...r,
        p: o.probability,
        unadapted: o.rawProbability,
        v15: p.p,
        supported: f.supported,
        coverage: f.coverage,
        projectedPoints: f.projectedPoints,
        flowSupported: f.flowSupported,
        x: f.x,
        reliabilityWeight: o.reliability.weight,
        feedbackGames: o.reliability.games,
        training: o.fit.training,
        effectiveGames: o.fit.effectiveGames,
        residualSd: o.fit.residualSd,
      };
    });
  }
  return { ...e, evaluate, features, signal, parent, parentPath, parentAuditPath, provenance };
}
export function overview(rows) {
  const rs = rows.filter((r) => r.kind === 'total');
  return {
    totals: summarize(rs),
    ungated: summarize(rs.map((r) => ({ ...r, p: r.unadapted }))),
    v15: summarize(rs.map((r) => ({ ...r, p: r.v15 }))),
    pairedV15Improvement: summarize(rs.map((r) => ({ ...r, previous: r.v15 })))
      .previousImprovementInterval,
    coverage: rs.filter((r) => r.supported).length,
    flowCoverage: rs.filter((r) => r.flowSupported).length,
    changed: rs.filter((r) => Math.abs(r.p - r.book) > 1e-12).length,
    materialChangesAt1e3: rs.filter((r) => Math.abs(r.p - r.book) >= 1e-3).length,
    meanAbsoluteBookCorrection:
      rs.reduce((s, r) => s + Math.abs(r.p - r.book), 0) / Math.max(1, rs.length),
    nonTotalMaximumProductionDifference: Math.max(
      0,
      ...rows.filter((r) => r.kind !== 'total').map((r) => Math.abs(r.p - r.previous)),
    ),
  };
}
