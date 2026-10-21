import { readFile } from 'node:fs/promises';
import {
  prepare,
  hash,
  specs,
  specId,
  overview,
  newFiles,
  stableTotalFeedbackParameters,
  writeArtifact,
} from './stable-total-evaluation.mjs';
const [contexts, oldPath, correctedPath, statsPath, out] = process.argv.slice(2);
if (!out)
  throw Error('Usage: <contexts> <old-signals> <corrected-signals> <drive-stats> <settings-out>');
const e = await prepare(contexts, oldPath, correctedPath, statsPath),
  development = [];
for (const spec of specs) {
  const rows = e.development(spec),
    report = overview(rows);
  development.push({
    spec,
    id: specId(spec),
    ...report,
    seasons: [2021, 2022].map((season) => ({
      season,
      ...overview(rows.filter((r) => r.season === season)),
    })),
  });
  console.error('developed', specId(spec), report.totals.brier);
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
  stableTotalFeedbackParameters,
  selection:
    'Six predeclared weekly stability/direction variants selected on matched 2021-2022 totals Brier only before this 2023-2026 retest. Raw v16 source predictions and v17 temporal/cap/reset settings stay fixed. Diagnosis has inspected 2023/2024 and inherited source settings were selected in prior later-season rounds: all evidence is retrospective, not untouched.',
  contextSha256: hash(await readFile(contexts)),
  originalSignalsSha256: hash(await readFile(oldPath)),
  correctedSignalsSha256: hash(await readFile(correctedPath)),
  driveStatsSha256: hash(await readFile(statsPath)),
  parentSettingsSha256: hash(await readFile(e.parentPath)),
  parentAuditSha256: hash(await readFile(e.parentAuditPath)),
  diagnosisSha256: hash(await readFile('docs/research/2026-10-13-v18-older-season-diagnosis.json')),
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
