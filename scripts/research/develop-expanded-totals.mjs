import { readFile, writeFile } from 'node:fs/promises';
import {
  inputs,
  specs,
  specId,
  overview,
  hash,
  frozenFiles,
  expandedTotalParameters,
} from './expanded-total-evaluation.mjs';
const [context, signals, out] = process.argv.slice(2);
if (!context || !signals || !out)
  throw new Error('Usage: <contexts> <signals> <new-settings.json>');
const e = await inputs(context, signals),
  results = [];
for (const spec of specs) {
  const rows = e.evaluate(spec, e.development),
    summary = overview(rows);
  results.push({ spec, id: specId(spec), ...summary });
  console.error('developed', specId(spec), summary.totals.brier);
}
results.sort((a, b) => a.totals.brier - b.totals.brier || a.id.localeCompare(b.id));
const selected = results[0].spec;
const frozen = {
  version: 1,
  frozenAt: new Date().toISOString(),
  development:
    '2024 regular season and 2025 Weeks 1–8 only; older source coverage checked without outcomes',
  audit: '2025 Weeks 9–18 and 2026 Weeks 1–5; reused retrospective seasons',
  parameters: expandedTotalParameters,
  selected,
  results,
  contextSha256: hash(await readFile(context)),
  signalsSha256: hash(await readFile(signals)),
  codeHashes: Object.fromEntries(
    await Promise.all(frozenFiles.map(async (p) => [p, hash(await readFile(p))])),
  ),
};
await writeFile(out, JSON.stringify(frozen, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ selected, development: results[0] }));
