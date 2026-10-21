import { readFile, writeFile } from 'node:fs/promises';
import {
  prepare,
  specs,
  specId,
  overview,
  hash,
  seasonalExternalParameters,
} from './seasonal-external-evaluation.mjs';
const [contexts, signals, priorPath, out] = process.argv.slice(2);
if (!contexts || !signals || !priorPath || !out)
  throw new Error('Usage: <contexts> <signals> <v12-settings> <new-v13-settings>');
const e = await prepare(contexts, signals, priorPath),
  results = [];
for (const spec of specs) {
  const summary = overview(e.evaluate(spec, e.development));
  results.push({ spec, id: specId(spec), ...summary });
  console.error('developed', specId(spec), summary.totals.brier, 'changed', summary.changed);
}
results.sort((a, b) => a.totals.brier - b.totals.brier || a.id.localeCompare(b.id));
const files = [
  ...Object.keys(e.prior.codeHashes),
  'packages/core/src/research/seasonal-external-totals-model.ts',
  'scripts/research/seasonal-external-evaluation.mjs',
  'scripts/research/develop-seasonal-external-totals.mjs',
  'scripts/research/audit-seasonal-external-totals.mjs',
];
const frozen = {
  version: 1,
  frozenAt: new Date().toISOString(),
  parameters: seasonalExternalParameters,
  selected: results[0].spec,
  selection:
    'Best enabled candidate on 2024 and 2025 Weeks 1–8, stable lexical tie-break. Book-only control reported separately.',
  audit:
    '2025 Weeks 9–18 and 2026 Weeks 1–5, already examined and diagnosis-informed reused research.',
  results,
  contextSha256: hash(await readFile(contexts)),
  signalsSha256: hash(await readFile(signals)),
  priorSettingsPath: priorPath,
  priorSettingsSha256: hash(await readFile(priorPath)),
  diagnosisSha256: hash(await readFile('docs/research/2026-10-13-v13-loss-diagnosis.json')),
  codeHashes: Object.fromEntries(
    await Promise.all([...new Set(files)].map(async (p) => [p, hash(await readFile(p))])),
  ),
};
await writeFile(out, JSON.stringify(frozen, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ selected: frozen.selected, development: results[0] }));
