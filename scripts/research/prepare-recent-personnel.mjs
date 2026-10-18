import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readGameContextSnapshot } from './game-context-snapshot.mjs';
import {
  parsePersonnelPerformance,
  parsePersonnelSnaps,
  parseNFLInjuryReports,
  parseQuarterbackObservations,
  preparePersonnelEvidence,
  buildPregameAvailability,
  addPregamePersonnel,
} from '../../packages/integrations/dist/index.js';
const args = process.argv.slice(2);
if (
  args.length !== 10 ||
  args[0] !== '--contexts' ||
  args[2] !== '--data-dir' ||
  args[4] !== '--season' ||
  args[6] !== '--as-of' ||
  args[8] !== '--output'
)
  throw new Error(
    'Usage: --contexts <games.json> --data-dir <public-csv-directory> --season <year> --as-of <ISO time> --output <games.json>',
  );
const season = Number(args[5]),
  cutoff = Date.parse(args[7]);
if (!Number.isInteger(season) || season < 2026 || season > 2099 || !Number.isFinite(cutoff))
  throw new Error('Invalid recent season/cutoff.');
const games = await readGameContextSnapshot(args[1]),
  stats = [],
  snaps = [],
  reports = [],
  sources = [];
const hash = (v) => createHash('sha256').update(v).digest('hex');
async function load(file, parser, target, year, url) {
  const path = join(args[3], file);
  if ((await stat(path)).size > 12000000) throw new Error('Public source exceeds 12 MB.');
  const csv = await readFile(path, 'utf8'),
    rows = parser(csv, year);
  target.push(...rows);
  sources.push({ file, sha256: hash(csv), rows: rows.length, url });
}
for (const year of [season - 1, season]) {
  await load(
    `stats${year}.txt`,
    parsePersonnelPerformance,
    stats,
    year,
    `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${year}.csv`,
  );
  await load(
    `snaps${year}.txt`,
    parsePersonnelSnaps,
    snaps,
    year,
    `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${year}.csv`,
  );
}
await load(
  `injuries${season}.csv`,
  parseNFLInjuryReports,
  reports,
  season,
  `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`,
);
const qbs = [];
await load(
  `qb${season}.csv`,
  parseQuarterbackObservations,
  qbs,
  season,
  `https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_${season}.csv`,
);
const prepared = preparePersonnelEvidence(games, stats, snaps);
let targets = 0,
  epaBoth = 0,
  reportsBoth = 0,
  chartsBoth = 0;
for (let i = 0; i < games.length; i++) {
  const g = games[i];
  if (
    g.season !== season ||
    g.seasonType !== 'REG' ||
    !g.kickoffAt ||
    Date.parse(g.kickoffAt) + 86400000 > cutoff ||
    !Number.isInteger(g.homeScore) ||
    !Number.isInteger(g.awayScore)
  )
    continue;
  const asOf = new Date(Date.parse(g.kickoffAt) - 1000).toISOString();
  games[i] = addPregamePersonnel(
    { ...g, pregame: buildPregameAvailability(g, games, reports, qbs, asOf) },
    games,
    reports,
    stats,
    snaps,
    prepared,
  );
  const { home, away } = games[i].pregame;
  targets++;
  if (home.personnel?.quarterbackEpa !== undefined && away.personnel?.quarterbackEpa !== undefined)
    epaBoth++;
  if (home.reportUpdatedAt && away.reportUpdatedAt) reportsBoth++;
  if (home.quarterbackObservedAt && away.quarterbackObservedAt) chartsBoth++;
}
await writeFile(args[9], JSON.stringify(games));
console.log(
  JSON.stringify(
    {
      preparedAt: new Date().toISOString(),
      season,
      cutoff: args[7],
      targets,
      epaBoth,
      reportsBoth,
      chartsBoth,
      sources,
      snapshotSha256: hash(JSON.stringify(games)),
      warnings: [
        'This is retrospective reconstruction after outcomes, not a prospective holdout.',
        'Undated injury rows are excluded. Weather/official reports are not invented for missing recent contexts.',
        'Only games with at least 24 hours since kickoff and completed scores are prepared.',
      ],
    },
    null,
    2,
  ),
);
