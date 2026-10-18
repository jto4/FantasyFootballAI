import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import {
  decodeDriveCsv,
  projectDriveSourceCsv,
  parseGameDriveSignals,
} from '../packages/integrations/dist/research/game-drive-signals.js';
import { json, hash } from './directional-total-evaluation.mjs';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: <captured-source-directory>');
const manifestPath = 'docs/research/model-v16-drive-provenance.json',
  m = await json(manifestPath),
  rows = [];
for (const source of m.sources) {
  const raw = await readFile(`${directory}/pbp-${source.season}.csv.gz`);
  if (hash(raw) !== source.compressedSha256) throw new Error('Raw source changed');
  const selected = projectDriveSourceCsv(decodeDriveCsv(raw)),
    bytes = gzipSync(selected, { level: 9 }),
    path = `docs/research/model-v16-pbp-${source.season}-selected.csv.gz`;
  await writeFile(path, bytes, { flag: 'wx' });
  const rebuilt = parseGameDriveSignals(selected, source.season);
  if (
    rebuilt.rows.length !== source.teamRows ||
    JSON.stringify(rebuilt.unavailableGames) !== JSON.stringify(source.unavailableGames)
  )
    throw new Error('Selected-source reconstruction changed');
  rows.push(...rebuilt.rows);
  source.selectedPath = path;
  source.selectedSha256 = hash(selected);
  source.selectedCompressedSha256 = hash(bytes);
  source.selectedBytes = Buffer.byteLength(selected);
  source.selectedCompressedBytes = bytes.length;
  console.error('retained', source.season, bytes.length);
}
if (hash(JSON.stringify(rows)) !== m.snapshotSha256) throw new Error('Derived snapshot changed');
m.selectedRetention =
  'Raw source fields needed for every feature retained, no inferred values. Aggregation reproduces the original normalized snapshot exactly.';
await writeFile(manifestPath, JSON.stringify(m, null, 2));
