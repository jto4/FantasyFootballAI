import { readFile } from 'node:fs/promises';
import {
  prepare,
  json,
  hash,
  overview,
  robustFlowParameters,
  seasonalExternalParameters,
} from './trade-flow-evaluation.mjs';
const [contexts, oldPath, correctedPath, patchPath, frozenPath] = process.argv.slice(2);
if (!contexts || !oldPath || !correctedPath || !patchPath || !frozenPath)
  throw new Error(
    'Usage: <contexts> <old-signals> <corrected-signals> <direction-patch> <v15-settings>',
  );
const f = await json(frozenPath);
if (
  JSON.stringify(f.flowParameters) !== JSON.stringify(robustFlowParameters) ||
  JSON.stringify(f.adaptationParameters) !== JSON.stringify(seasonalExternalParameters) ||
  f.contextSha256 !== hash(await readFile(contexts)) ||
  f.originalSignalsSha256 !== hash(await readFile(oldPath)) ||
  f.correctedSignalsSha256 !== hash(await readFile(correctedPath)) ||
  f.patchSha256 !== hash(await readFile(patchPath)) ||
  f.parentSettingsSha256 !== hash(await readFile(f.parentSettingsPath)) ||
  f.diagnosisSha256 !== hash(await readFile('docs/research/2026-10-13-v15-loss-diagnosis.json'))
)
  throw new Error('Frozen robust inputs mismatch');
for (const [p, h] of Object.entries(f.codeHashes))
  if (hash(await readFile(p)) !== h) throw new Error('Frozen robust source mismatch');
const e = await prepare(contexts, oldPath, correctedPath, f.parentSettingsPath);
if (
  f.parentAuditSha256 !== hash(await readFile(e.parentAuditPath)) ||
  JSON.stringify(f.selected) !== JSON.stringify(e.parent.selected)
)
  throw new Error('Parent comparison changed');
const results = {};
for (const policy of f.policies) {
  const rows = e.evaluate(policy, () => true);
  results[policy] = {
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
  console.error('scored', policy);
}
console.log(
  JSON.stringify(
    {
      scoredAt: new Date().toISOString(),
      frozenAt: f.frozenAt,
      primary: f.primary,
      contextSha256: f.contextSha256,
      originalSignalsSha256: f.originalSignalsSha256,
      correctedSignalsSha256: f.correctedSignalsSha256,
      patchSha256: f.patchSha256,
      frozenSha256: hash(await readFile(frozenPath)),
      results,
      warnings: [
        'Canonical repair is verified from captured raw source fields; old v11-v14 Kalshi signed inputs are wrong and their numerical records remain preserved as issued.',
        'Direction-fix-only control separates input repair from changed flow measurements. All refits use earlier weeks and prequential earlier forecasts only.',
        'No parameter tuning on reused late-2025/2026 audit outcomes; no untouched validation, executable historical returns or consistent edge established.',
        'Coverage/unsigned-volume predictors remain absent; missing or incomplete flow stays unavailable. Exact book fallback is a tie. Moneyline/spreads and production remain unchanged.',
      ],
    },
    null,
    2,
  ),
);
