import { readFile } from 'node:fs/promises';
import {
  prepare,
  hash,
  specs,
  specId,
  overview,
  newFiles,
  recentTotalFeedbackParameters,
  writeArtifact,
} from './recent-total-evaluation.mjs';
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
await writeArtifact(out, {
  version: 1,
  frozenAt: new Date().toISOString(),
  primary: selected.id,
  selected: selected.spec,
  specs,
  recentTotalFeedbackParameters,
  selection:
    'Eight fixed short-memory feedback variants selected by 2024 plus 2025 weeks 1-8 Brier only, before this audit. All source forecasts, features, fitting parameters and no-flow choice inherited from frozen v16. Reused development and audit are not untouched evidence.',
  contextSha256: hash(await readFile(contexts)),
  originalSignalsSha256: hash(await readFile(oldPath)),
  correctedSignalsSha256: hash(await readFile(correctedPath)),
  driveStatsSha256: hash(await readFile(statsPath)),
  parentSettingsSha256: hash(await readFile(e.parentPath)),
  parentAuditSha256: hash(await readFile(e.parentAuditPath)),
  diagnosisSha256: hash(await readFile('docs/research/2026-10-13-v17-feedback-diagnosis.json')),
  codeHashes: Object.fromEntries(
    await Promise.all(
      [...new Set([...Object.keys(e.parent.codeHashes), ...newFiles])].map(async (p) => [
        p,
        hash(await readFile(p)),
      ]),
    ),
  ),
  development,
});
console.log(
  JSON.stringify({ primary: selected.id, selected: selected.spec, development }, null, 2),
);
