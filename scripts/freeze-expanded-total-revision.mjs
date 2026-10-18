import { readFile, writeFile } from 'node:fs/promises';
import { inputs, overview, hash, expandedTotalParameters } from './expanded-total-evaluation.mjs';
const [contexts, signals, priorPath, out] = process.argv.slice(2);
if (!contexts || !signals || !priorPath || !out)
  throw new Error('Usage: <contexts> <revised-signals> <prior-settings> <new-revised-settings>');
const prior = JSON.parse(await readFile(priorPath));
if (JSON.stringify(prior.parameters) !== JSON.stringify(expandedTotalParameters))
  throw new Error('Model parameters changed.');
for (const [path, h] of Object.entries(prior.codeHashes))
  if (hash(await readFile(path)) !== h) throw new Error('Frozen model changed.');
const e = await inputs(contexts, signals),
  development = overview(e.evaluate(prior.selected, e.development));
const extraFiles = [
  'packages/integrations/src/research/historical-total-catalog.ts',
  'scripts/retry-historical-external-totals.mjs',
  'scripts/prepare-expanded-total-snapshot.mjs',
  'scripts/freeze-expanded-total-revision.mjs',
  'scripts/audit-expanded-totals.mjs',
  'scripts/develop-expanded-totals.mjs',
];
const revised = {
  ...prior,
  frozenAt: new Date().toISOString(),
  signalsSha256: hash(await readFile(signals)),
  results: [{ spec: prior.selected, ...development }],
  revision: {
    priorSettingsSha256: hash(await readFile(priorPath)),
    priorSignalsSha256: prior.signalsSha256,
    reason:
      'Source-coverage QA recovered four team-prefixed 2024 totals. Family, anchor, penalty and model math remain fixed after initial audit; no re-selection on later outcomes.',
    recommendedProductionChange: false,
    bookControlDevelopmentBrier: development.totals.bookBrier,
  },
  codeHashes: {
    ...prior.codeHashes,
    ...Object.fromEntries(
      await Promise.all(extraFiles.map(async (p) => [p, hash(await readFile(p))])),
    ),
  },
};
await writeFile(out, JSON.stringify(revised, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ selected: revised.selected, development }));
