import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import {
  parsePersonnelPerformance,
  parsePersonnelSnaps,
  parseNFLInjuryReports,
  preparePersonnelEvidence,
  addPregamePersonnel,
} from '../packages/integrations/dist/index.js';
import { usablePregameContext, nflTeamKey } from '../packages/core/dist/index.js';
const args = process.argv.slice(2);
if (
  args.length !== 6 ||
  args[0] !== '--contexts' ||
  args[2] !== '--data-dir' ||
  args[4] !== '--output'
)
  throw new Error(
    'Usage: --contexts <games.json> --data-dir <public-csv-directory> --output <games.json>',
  );
const games = await readGameContextSnapshot(args[1]),
  stats = [],
  snaps = [],
  reports = [],
  sources = [];
const hash = (s) => createHash('sha256').update(s).digest('hex');
for (const year of [
  ...new Set(
    games
      .filter((g) => g.season >= 2016 && g.season <= 2025)
      .flatMap((g) => [g.season - 1, g.season]),
  ),
].sort()) {
  for (const [file, parser, target, url] of [
    [
      `stats${year}.txt`,
      parsePersonnelPerformance,
      stats,
      `stats_player/stats_player_week_${year}.csv`,
    ],
    [`snaps${year}.txt`, parsePersonnelSnaps, snaps, `snap_counts/snap_counts_${year}.csv`],
    [`injuries${year}.csv`, parseNFLInjuryReports, reports, `injuries/injuries_${year}.csv`],
  ]) {
    let csv;
    try {
      const path = join(args[3], file);
      if ((await stat(path)).size > 12000000) throw new Error('Public source exceeds 12 MB.');
      csv = await readFile(path, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      sources.push({ file, status: 'unavailable' });
      continue;
    }
    if (Buffer.byteLength(csv) > 12000000) throw new Error('Public source exceeds 12 MB.');
    const rows = parser(csv, year);
    target.push(...rows);
    sources.push({
      file,
      rows: rows.length,
      sha256: hash(csv),
      url: `https://github.com/nflverse/nflverse-data/releases/download/${url}`,
    });
  }
}
const prepared = preparePersonnelEvidence(games, stats, snaps),
  coverage = {};
for (let i = 0; i < games.length; i++) {
  const g = games[i];
  if (!usablePregameContext(g)) continue;
  // Do not mix unofficial rows into a team whose selected source was an official article.
  // The stored official source has no practice observations; those remain unknown.
  const selected = reports.filter(
    (r) =>
      r.season === g.season &&
      r.week === g.week &&
      !['home', 'away'].some(
        (side) =>
          nflTeamKey(g[side]) === nflTeamKey(r.team) &&
          g.pregame[side].reportSource === 'nfl-official',
      ),
  );
  if (['home', 'away'].some((side) => g.pregame[side].reportSource === 'nfl-official')) {
    // Preserve previously captured official facts, but do not pretend we reconstructed new roles.
    const original = structuredClone(g.pregame);
    games[i] = addPregamePersonnel(g, games, selected, stats, snaps, prepared);
    for (const side of ['home', 'away'])
      if (original[side].reportSource === 'nfl-official') {
        const newFacts = games[i].pregame[side].personnel;
        games[i].pregame[side].personnel = {
          ...original[side].personnel,
          ...(newFacts
            ? Object.fromEntries(
                Object.entries(newFacts).filter(([k]) => k.startsWith('quarterback')),
              )
            : {}),
        };
        if (!original[side].personnel) delete games[i].pregame[side].personnel;
      }
  } else games[i] = addPregamePersonnel(g, games, selected, stats, snaps, prepared);
  const year = (coverage[g.season] ??= { games: 0, epaBoth: 0, practiceBoth: 0, lineOutBoth: 0 });
  year.games++;
  const { home, away } = games[i].pregame;
  for (const [field, key] of [
    ['quarterbackEpa', 'epaBoth'],
    ['offenseLimitedSnaps', 'practiceBoth'],
    ['offensiveLineOutSnaps', 'lineOutBoth'],
  ])
    if (home.personnel?.[field] !== undefined && away.personnel?.[field] !== undefined) year[key]++;
}
const snapshot = JSON.stringify(games);
await writeFile(args[5], snapshot);
console.log(
  JSON.stringify(
    {
      preparedAt: new Date().toISOString(),
      snapshotSha256: hash(snapshot),
      inputSha256: hash(await readFile(args[1])),
      sources,
      coverage,
      historicalPublicationTimingVerified: false,
      warnings: [
        'EPA models/stat corrections may have been revised retrospectively.',
        'Earlier-game statistics require a prior week and 24-hour allowance; allowance is not a historical publication timestamp.',
        'No new official practice data is fabricated from article status counts.',
      ],
    },
    null,
    2,
  ),
);
