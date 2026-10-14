import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTeamTotalSignals } from '../packages/integrations/dist/team-total-signals.js';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--out') throw new Error('Usage: --out <directory>');
await mkdir(args[1], { recursive: true });
const rows = [],
  sources = [],
  hash = (v) => createHash('sha256').update(v).digest('hex');
for (let season = 2015; season <= 2026; season++) {
  const loaded = await loadTeamTotalSignals(season);
  await writeFile(`${args[1]}/team-${season}.csv`, loaded.csv, { flag: 'wx' });
  rows.push(...loaded.rows);
  sources.push({
    season,
    url: loaded.url,
    capturedAt: loaded.capturedAt,
    sha256: hash(loaded.csv),
    bytes: Buffer.byteLength(loaded.csv),
    rows: loaded.rows.length,
  });
  console.error('captured', season, loaded.rows.length);
}
await writeFile(`${args[1]}/signals.json`, JSON.stringify(rows), { flag: 'wx' });
console.log(
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      sources,
      snapshotSha256: hash(JSON.stringify(rows)),
      rows: rows.length,
      warning:
        'Latest revised team stats; historical publication versions are unavailable. No contemporaneous pregame availability claim.',
    },
    null,
    2,
  ),
);
