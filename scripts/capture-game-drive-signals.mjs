import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import {
  loadGameDriveSource,
  decodeDriveCsv,
  parseGameDriveSignals,
} from '../packages/integrations/dist/research/game-drive-signals.js';
import { hash } from './expanded-total-evaluation.mjs';
const [out] = process.argv.slice(2);
if (!out) throw new Error('Usage: <output-directory>');
await mkdir(out, { recursive: true });
const rows = [],
  sources = [];
for (let season = 2019; season <= 2026; season++) {
  let loaded;
  const path = `${out}/pbp-${season}.csv.gz`;
  let source;
  try {
    const bytes = await readFile(path);
    source = {
      url: `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`,
      capturedAt: (await stat(path)).mtime.toISOString(),
      bytes,
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    source = await loadGameDriveSource(season);
    await writeFile(path, source.bytes, { flag: 'wx' });
  }
  loaded = { ...source, ...parseGameDriveSignals(decodeDriveCsv(source.bytes), season) };
  rows.push(...loaded.rows);
  sources.push({
    season,
    url: loaded.url,
    capturedAt: loaded.capturedAt,
    compressedSha256: hash(loaded.bytes),
    compressedBytes: loaded.bytes.length,
    teamRows: loaded.rows.length,
    plays: loaded.plays,
    drives: loaded.drives,
    unavailableGames: loaded.unavailableGames,
  });
  console.error('captured', season, loaded.rows.length, loaded.plays);
}
const raw = JSON.stringify(rows);
await writeFile(`${out}/drive-stats.json`, raw, { flag: 'wx' });
await writeFile(
  'docs/research/model-v16-drive-provenance.json',
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      sources,
      rows: rows.length,
      snapshotSha256: hash(raw),
      warning:
        'Latest revised PBP. Prior completed weeks with a 48-hour lag only; not certified contemporaneous historical publications. No weather or injury vintage added.',
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
