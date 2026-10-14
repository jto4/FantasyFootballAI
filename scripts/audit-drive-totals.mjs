import { readFile } from 'node:fs/promises';
import {
  prepare,
  json,
  hash,
  specId,
  overview,
  driveSignalParameters,
  driveResidualParameters,
} from './drive-total-evaluation.mjs';
const [contexts, oldPath, correctedPath, statsPath, frozenPath] = process.argv.slice(2);
if (!frozenPath)
  throw new Error(
    'Usage: <contexts> <old-signals> <corrected-signals> <drive-stats> <frozen-settings>',
  );
const f = await json(frozenPath);
for (const [p, h] of Object.entries(f.codeHashes))
  if (hash(await readFile(p)) !== h) throw new Error('Frozen source changed');
for (const [p, h] of [
  [contexts, f.contextSha256],
  [oldPath, f.originalSignalsSha256],
  [correctedPath, f.correctedSignalsSha256],
  [statsPath, f.driveStatsSha256],
  ['docs/research/model-v16-drive-provenance.json', f.driveProvenanceSha256],
  ['docs/research/2026-10-13-v16-flow-diagnosis.json', f.diagnosisSha256],
])
  if (hash(await readFile(p)) !== h) throw new Error('Frozen input changed');
if (
  JSON.stringify(driveSignalParameters) !== JSON.stringify(f.driveSignalParameters) ||
  JSON.stringify(driveResidualParameters) !== JSON.stringify(f.driveResidualParameters)
)
  throw new Error('Frozen parameters changed');
const e = await prepare(contexts, oldPath, correctedPath, statsPath);
if (
  hash(await readFile(e.parentPath)) !== f.parentSettingsSha256 ||
  hash(await readFile(e.parentAuditPath)) !== f.parentAuditSha256
)
  throw new Error('Parent changed');
const results = {};
for (const spec of f.specs) {
  const rows = e.evaluate(spec, () => true);
  results[specId(spec)] = {
    all: overview(rows),
    development: overview(rows.filter(e.development)),
    audit: overview(rows.filter(e.audit)),
    late2025: overview(rows.filter((r) => r.season === 2025 && r.week >= 9)),
    current2026: overview(rows.filter((r) => r.season === 2026)),
    seasons: [2023, 2024, 2025, 2026].map((season) => ({
      season,
      ...overview(rows.filter((r) => r.season === season)),
    })),
    weeks: [2025, 2026].flatMap((season) =>
      Array.from({ length: season === 2025 ? 18 : 5 }, (_, i) => ({
        season,
        week: i + 1,
        ...overview(rows.filter((r) => r.season === season && r.week === i + 1)),
      })),
    ),
    rows,
  };
  console.error('audited', specId(spec));
}
console.log(
  JSON.stringify(
    {
      scoredAt: new Date().toISOString(),
      frozenAt: f.frozenAt,
      frozenSha256: hash(await readFile(frozenPath)),
      primary: f.primary,
      results,
      warnings: [
        'Latest revised prior PBP, no certified historical publication timestamps; 48-hour lag excludes current/future weeks.',
        'Reused retrospective cohorts, developmental selection and repeated comparisons invalidate an untouched-test claim. Nominal week-cluster intervals do not adjust for all prior experiments.',
        'Book probabilities are devigged archived quotes without observation times; probability scores are not executable returns. No consistent edge or guaranteed sportsbook outperformance.',
        'Moneyline and spread predictions delegate to the unchanged production model. Production totals are not promoted automatically.',
      ],
    },
    null,
    2,
  ),
);
