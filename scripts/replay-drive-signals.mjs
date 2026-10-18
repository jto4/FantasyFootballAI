import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { parseGameDriveSignals } from '../packages/integrations/dist/research/game-drive-signals.js';
import { json, hash } from './directional-total-evaluation.mjs';
const [out] = process.argv.slice(2);
if (!out) throw new Error('Usage: <output-snapshot>');
const m = await json('docs/research/model-v16-drive-provenance.json'),
  rows = [];
for (const s of m.sources) {
  const compressed = await readFile(s.selectedPath);
  if (hash(compressed) !== s.selectedCompressedSha256) throw new Error('Retained source changed');
  const csv = gunzipSync(compressed, { maxOutputLength: 25000000 }).toString('utf8');
  if (hash(csv) !== s.selectedSha256) throw new Error('Selected source changed');
  const r = parseGameDriveSignals(csv, s.season);
  if (
    r.rows.length !== s.teamRows ||
    JSON.stringify(r.unavailableGames) !== JSON.stringify(s.unavailableGames)
  )
    throw new Error('Source derivation changed');
  rows.push(...r.rows);
}
const raw = JSON.stringify(rows);
if (hash(raw) !== m.snapshotSha256) throw new Error('Rebuilt snapshot mismatch');
await writeFile(out, raw, { flag: 'wx' });
console.log(JSON.stringify({ sha256: hash(raw), rows: rows.length }));
