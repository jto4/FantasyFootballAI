import { readFile, writeFile } from 'node:fs/promises';
import {
  prepare,
  specs,
  specId,
  hash,
  overview,
  newFiles,
  driveSignalParameters,
  driveResidualParameters,
} from './drive-total-evaluation.mjs';
const [contexts, oldPath, correctedPath, statsPath, out] = process.argv.slice(2);
if (!out)
  throw new Error(
    'Usage: <contexts> <old-signals> <corrected-signals> <drive-stats> <settings-out>',
  );
const e = await prepare(contexts, oldPath, correctedPath, statsPath),
  development = [];
for (const spec of specs) {
  const r = overview(e.evaluate(spec, e.development));
  development.push({ spec, id: specId(spec), ...r });
  console.error('developed', specId(spec), r.totals.brier);
}
const selected = [...development].sort(
  (a, b) => a.totals.brier - b.totals.brier || a.id.localeCompare(b.id),
)[0];
const frozen = {
  version: 1,
  frozenAt: new Date().toISOString(),
  selected: selected.spec,
  primary: selected.id,
  specs,
  selection:
    'Four predeclared variants, selected by 2024 plus 2025 weeks 1-8 Brier only. No audit outcome tuning. Retrospective development and audit have been inspected in earlier rounds; neither is untouched.',
  driveSignalParameters,
  driveResidualParameters,
  contextSha256: hash(await readFile(contexts)),
  originalSignalsSha256: hash(await readFile(oldPath)),
  correctedSignalsSha256: hash(await readFile(correctedPath)),
  driveStatsSha256: hash(await readFile(statsPath)),
  driveProvenanceSha256: hash(await readFile('docs/research/model-v16-drive-provenance.json')),
  diagnosisSha256: hash(await readFile('docs/research/2026-10-13-v16-flow-diagnosis.json')),
  parentSettingsSha256: hash(await readFile(e.parentPath)),
  parentAuditSha256: hash(await readFile(e.parentAuditPath)),
  codeHashes: Object.fromEntries(
    await Promise.all(
      [...new Set([...Object.keys(e.parent.codeHashes), ...newFiles])].map(async (p) => [
        p,
        hash(await readFile(p)),
      ]),
    ),
  ),
  development,
  joinedRows: e.signal.joinedRows,
  rejectedJoinRows: e.signal.rejectedJoinRows,
};
await writeFile(out, JSON.stringify(frozen, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ primary: frozen.primary, development }, null, 2));
