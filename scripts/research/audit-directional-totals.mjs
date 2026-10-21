import { readFile } from 'node:fs/promises';
import {
  prepare,
  json,
  hash,
  overview,
  summarize,
  directionalTotalPolicy,
  priceOnlyTotalPolicy,
  seasonalExternalParameters,
} from './directional-total-evaluation.mjs';
const [contexts, signals, frozenPath] = process.argv.slice(2);
if (!contexts || !signals || !frozenPath)
  throw new Error('Usage: <contexts> <signals> <v14-settings>');
const f = await json(frozenPath);
if (
  JSON.stringify(f.policy) !== JSON.stringify(directionalTotalPolicy) ||
  JSON.stringify(f.priceOnlySensitivityPolicy) !== JSON.stringify(priceOnlyTotalPolicy) ||
  JSON.stringify(f.parameters) !== JSON.stringify(seasonalExternalParameters) ||
  f.contextSha256 !== hash(await readFile(contexts)) ||
  f.signalsSha256 !== hash(await readFile(signals)) ||
  f.parentSettingsSha256 !== hash(await readFile(f.parentSettingsPath)) ||
  f.parentAuditSha256 !== hash(await readFile(f.parentAuditPath)) ||
  f.diagnosisSha256 !== hash(await readFile('docs/research/2026-10-13-v14-loss-diagnosis.json'))
)
  throw new Error('Frozen directional inputs mismatch');
for (const [p, h] of Object.entries(f.codeHashes))
  if (hash(await readFile(p)) !== h) throw new Error('Frozen directional source mismatch');
const e = await prepare(contexts, signals, f.parentSettingsPath);
if (JSON.stringify(e.spec) !== JSON.stringify(f.selected))
  throw new Error('Parent adaptation changed');
const rows = e.evaluate(() => true),
  priceOnlyRows = e.evaluate(() => true, 'prices-only');
console.log(
  JSON.stringify(
    {
      scoredAt: new Date().toISOString(),
      frozenAt: f.frozenAt,
      policy: f.policy,
      selected: f.selected,
      contextSha256: f.contextSha256,
      signalsSha256: f.signalsSha256,
      frozenSha256: hash(await readFile(frozenPath)),
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
      markets: ['moneyline', 'spread'].map((kind) => ({
        kind,
        ...summarize(rows.filter((r) => r.kind === kind)),
      })),
      rows,
      priceOnlySensitivity: {
        policy: f.priceOnlySensitivityPolicy,
        all: overview(priceOnlyRows),
        development: overview(priceOnlyRows.filter(e.development)),
        audit: overview(priceOnlyRows.filter(e.audit)),
        late2025: overview(priceOnlyRows.filter((r) => r.season === 2025 && r.week >= 9)),
        current2026: overview(priceOnlyRows.filter((r) => r.season === 2026)),
        rows: priceOnlyRows,
      },
      warnings: [
        'Fixed requested ablation, no parameter tuning on late-2025/2026 results. Both fits and feedback are refitted using retained features and earlier labels only.',
        'Coverage still guards eligibility and freshness; flags and unsigned relative volume cannot be predictive coefficients. Signed trade flow is retained.',
        'All periods have already been inspected; no untouched accuracy, consistently profitable edge or executable historical returns established.',
        'Exact book fallback is a tie; report active cases separately. Moneyline/spreads, production dispatch and earlier forecasts remain unchanged.',
      ],
    },
    null,
    2,
  ),
);
