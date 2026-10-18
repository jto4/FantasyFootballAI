import { readFile, writeFile } from 'node:fs/promises';
import {
  prepare,
  hash,
  robustFlowParameters,
  seasonalExternalParameters,
} from './trade-flow-evaluation.mjs';
const [contexts, oldPath, correctedPath, patchPath, parentPath, out] = process.argv.slice(2);
if (!contexts || !oldPath || !correctedPath || !patchPath || !parentPath || !out)
  throw new Error(
    'Usage: <contexts> <old-signals> <corrected-signals> <direction-patch> <v14-settings> <new-v15-settings>',
  );
const e = await prepare(contexts, oldPath, correctedPath, parentPath);
if (e.correctedSignals.directionCorrection.patchSha256 !== hash(await readFile(patchPath)))
  throw new Error('Direction patch mismatch');
const files = [
  ...Object.keys(e.parent.codeHashes),
  'packages/core/src/research/robust-total-trade-flow.ts',
  'packages/integrations/src/research/canonical-prediction-trades.ts',
  'scripts/correct-historical-trade-directions.mjs',
  'scripts/trade-flow-evaluation.mjs',
  'scripts/diagnose-signed-total-flow.mjs',
  'scripts/freeze-robust-total-flow.mjs',
  'scripts/audit-robust-total-flow.mjs',
];
const f = {
  version: 1,
  frozenAt: new Date().toISOString(),
  flowParameters: robustFlowParameters,
  adaptationParameters: seasonalExternalParameters,
  selected: e.parent.selected,
  policies: ['direction-fix-only', 'innovation', 'confirmed'],
  primary: 'innovation',
  selection:
    'Fixed source-semantic repair plus predeclared robust-flow and price-confirmed control; inherit v14 adaptation with no hyperparameter search or audit-based selection.',
  contextSha256: e.parent.contextSha256,
  originalSignalsSha256: e.parent.signalsSha256,
  correctedSignalsSha256: hash(await readFile(correctedPath)),
  patchSha256: hash(await readFile(patchPath)),
  parentSettingsPath: parentPath,
  parentSettingsSha256: hash(await readFile(parentPath)),
  parentAuditSha256: hash(await readFile(e.parentAuditPath)),
  diagnosisSha256: hash(await readFile('docs/research/2026-10-13-v15-loss-diagnosis.json')),
  codeHashes: Object.fromEntries(
    await Promise.all([...new Set(files)].map(async (p) => [p, hash(await readFile(p))])),
  ),
};
await writeFile(out, JSON.stringify(f, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ primary: f.primary, policies: f.policies, adaptation: f.selected }));
