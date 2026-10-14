import { readFile } from 'node:fs/promises';
import {
  prepare,
  json,
  hash,
  specId,
  overview,
  stableTotalFeedbackParameters,
  canonicalJson,
} from './stable-total-evaluation.mjs';
const [contexts, oldPath, correctedPath, statsPath, frozenPath] = process.argv.slice(2);
if (!frozenPath)
  throw Error(
    'Usage: <contexts> <old-signals> <corrected-signals> <drive-stats> <frozen-settings>',
  );
const f = await json(frozenPath);
for (const [p, h] of Object.entries(f.codeHashes))
  if (hash(await readFile(p)) !== h) throw Error('Frozen source mismatch');
for (const [p, h] of [
  [contexts, f.contextSha256],
  [oldPath, f.originalSignalsSha256],
  [correctedPath, f.correctedSignalsSha256],
  [statsPath, f.driveStatsSha256],
  ['docs/research/2026-10-13-v18-older-season-diagnosis.json', f.diagnosisSha256],
])
  if (hash(await readFile(p)) !== h) throw Error('Frozen input mismatch');
if (
  JSON.stringify(f.stableTotalFeedbackParameters) !== JSON.stringify(stableTotalFeedbackParameters)
)
  throw Error('Frozen parameters mismatch');
const e = await prepare(contexts, oldPath, correctedPath, statsPath);
if (
  hash(await readFile(e.parentPath)) !== f.parentSettingsSha256 ||
  hash(await readFile(e.parentAuditPath)) !== f.parentAuditSha256
)
  throw Error('Parent changed');
const results = {};
for (const spec of f.specs) {
  const rows = e.evaluate(spec, () => true);
  results[specId(spec)] = {
    all: overview(rows),
    late2025: overview(rows.filter((r) => r.season === 2025 && r.week >= 9)),
    current2026: overview(rows.filter((r) => r.season === 2026)),
    laterAudit: overview(
      rows.filter((r) => (r.season === 2025 && r.week >= 9) || r.season === 2026),
    ),
    seasons: [2023, 2024, 2025, 2026].map((season) => ({
      season,
      ...overview(rows.filter((r) => r.season === season)),
    })),
    weeks: [2023, 2024, 2025, 2026].flatMap((season) =>
      Array.from({ length: season === 2026 ? 5 : 18 }, (_, i) => ({
        season,
        week: i + 1,
        ...overview(rows.filter((r) => r.season === season && r.week === i + 1)),
      })),
    ),
    rows,
  };
  console.error('audited', specId(spec));
}
process.stdout.write(
  await canonicalJson({
    scoredAt: new Date().toISOString(),
    frozenAt: f.frozenAt,
    frozenSha256: hash(await readFile(frozenPath)),
    primary: f.primary,
    results,
    warnings: [
      'Only reliability changes; every raw totals forecast and non-total calculation remains fixed.',
      'Current/future weeks excluded with inherited 48-hour lag, six-week window, season reset and half correction cap; new stability evidence and directional heads use earlier forecasts only.',
      'New feedback selection uses 2021-2022 only, but diagnosis, inherited source selection and revised PBP make all later samples reused retrospective research. No untouched test or executable returns claimed.',
      'Weak-season ties and practically tiny changes are not incremental wins. No live dispatch or issued forecast is modified.',
    ],
  }),
);
