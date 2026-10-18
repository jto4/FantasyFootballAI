import { readFile } from 'node:fs/promises';
import {
  prepare,
  json,
  hash,
  specId,
  overview,
  recentTotalFeedbackParameters,
  canonicalJson,
} from './recent-total-evaluation.mjs';
const [contexts, oldPath, correctedPath, statsPath, frozenPath] = process.argv.slice(2);
if (!frozenPath)
  throw new Error(
    'Usage: <contexts> <old-signals> <corrected-signals> <drive-stats> <frozen-settings>',
  );
const f = await json(frozenPath);
for (const [p, h] of Object.entries(f.codeHashes))
  if (hash(await readFile(p)) !== h) throw new Error('Frozen source mismatch');
for (const [p, h] of [
  [contexts, f.contextSha256],
  [oldPath, f.originalSignalsSha256],
  [correctedPath, f.correctedSignalsSha256],
  [statsPath, f.driveStatsSha256],
  ['docs/research/2026-10-13-v17-feedback-diagnosis.json', f.diagnosisSha256],
])
  if (hash(await readFile(p)) !== h) throw new Error('Frozen input mismatch');
if (
  JSON.stringify(f.recentTotalFeedbackParameters) !== JSON.stringify(recentTotalFeedbackParameters)
)
  throw new Error('Frozen parameters mismatch');
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
process.stdout.write(
  await canonicalJson({
    scoredAt: new Date().toISOString(),
    frozenAt: f.frozenAt,
    frozenSha256: hash(await readFile(frozenPath)),
    primary: f.primary,
    results,
    warnings: [
      'Only feedback changes; v16 raw probabilities and underlying training/features/flow choice are reproduced exactly.',
      'Prior-only prequential feedback excludes current/future weeks and imposes a 48-hour lag. Season reset or bounded fading prior seed, six-week horizon and correction cap are fixed before audit.',
      'All historical development/audit cohorts have been reused; nominal intervals do not adjust for repeated experiments. No untouched prospective edge is established.',
      'Archived sportsbook probabilities lack quote observation times, so no executable ROI is claimed. Moneyline/spread and live dispatch remain unchanged.',
    ],
  }),
);
