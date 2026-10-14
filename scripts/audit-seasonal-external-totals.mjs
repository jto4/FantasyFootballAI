import { readFile } from 'node:fs/promises';
import {
  prepare,
  overview,
  hash,
  seasonalExternalParameters,
  summarize,
} from './seasonal-external-evaluation.mjs';
const [contexts, signals, frozenPath] = process.argv.slice(2);
if (!contexts || !signals || !frozenPath)
  throw new Error('Usage: <contexts> <signals> <v13-settings>');
const f = JSON.parse(await readFile(frozenPath));
if (
  JSON.stringify(f.parameters) !== JSON.stringify(seasonalExternalParameters) ||
  f.contextSha256 !== hash(await readFile(contexts)) ||
  f.signalsSha256 !== hash(await readFile(signals)) ||
  f.priorSettingsSha256 !== hash(await readFile(f.priorSettingsPath)) ||
  f.diagnosisSha256 !== hash(await readFile('docs/research/2026-10-13-v13-loss-diagnosis.json'))
)
  throw new Error('Frozen input mismatch');
for (const [p, h] of Object.entries(f.codeHashes))
  if (hash(await readFile(p)) !== h) throw new Error('Frozen source mismatch');
const e = await prepare(contexts, signals, f.priorSettingsPath),
  rows = e.evaluate(f.selected, () => true);
const result = {
  scoredAt: new Date().toISOString(),
  frozenAt: f.frozenAt,
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
  warnings: [
    'All audit seasons were already inspected and late-2025 diagnosis informed this design; no untouched validation or executable historical profit is claimed.',
    'Forecast feedback uses earlier prequential predictions and labels, never current-week or later labels. Weekly walk-forward updates legitimately use earlier audit-week outcomes.',
    'Exact sportsbook fallback is a tie, not a model win. Confidence intervals are nominal week-clustered estimates, not a correction for all repeated project experiments.',
    'Moneyline/spread dispatch and earlier issued forecasts are unchanged; research-only, no production promotion.',
  ],
};
console.log(JSON.stringify(result, null, 2));
