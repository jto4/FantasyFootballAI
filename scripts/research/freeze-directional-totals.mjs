import { readFile, writeFile } from 'node:fs/promises';
import {
  prepare,
  hash,
  directionalTotalPolicy,
  priceOnlyTotalPolicy,
  seasonalExternalParameters,
} from './directional-total-evaluation.mjs';
const [contexts, signals, parentPath, out] = process.argv.slice(2);
if (!contexts || !signals || !parentPath || !out)
  throw new Error('Usage: <contexts> <signals> <v13-settings> <new-v14-settings>');
const e = await prepare(contexts, signals, parentPath),
  files = [
    ...Object.keys(e.parent.codeHashes),
    'packages/core/src/research/directional-seasonal-totals-model.ts',
    'scripts/directional-total-evaluation.mjs',
    'scripts/diagnose-seasonal-total-losses.mjs',
    'scripts/freeze-directional-totals.mjs',
    'scripts/audit-directional-totals.mjs',
  ];
const f = {
  version: 1,
  frozenAt: new Date().toISOString(),
  policy: directionalTotalPolicy,
  priceOnlySensitivityPolicy: priceOnlyTotalPolicy,
  parameters: seasonalExternalParameters,
  selected: e.spec,
  selection:
    'User-requested feature ablation: force removal of coverage indicators and unsigned relative volume. No hyperparameter search or audit-based selection. Retain parent four-week decay, season reset, ridge and prequential feedback.',
  audit: '2025 Weeks 9–18 and 2026 Weeks 1–5; already inspected, reused retrospective research.',
  contextSha256: e.parent.contextSha256,
  signalsSha256: e.parent.signalsSha256,
  parentSettingsPath: parentPath,
  parentSettingsSha256: hash(await readFile(parentPath)),
  parentAuditPath: e.parentAuditPath,
  parentAuditSha256: hash(await readFile(e.parentAuditPath)),
  diagnosisSha256: hash(await readFile('docs/research/2026-10-13-v14-loss-diagnosis.json')),
  codeHashes: Object.fromEntries(
    await Promise.all([...new Set(files)].map(async (p) => [p, hash(await readFile(p))])),
  ),
};
await writeFile(out, JSON.stringify(f, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ selected: f.selected, policy: f.policy }));
