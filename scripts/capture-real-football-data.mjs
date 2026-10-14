import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  PublicFootballData,
  SleeperPlayerCatalog,
  FootballNewsCache,
  NFLInjuryReportCache,
  readBoundedJson,
} from '../packages/integrations/dist/index.js';

const path = process.argv[2];
if (!path)
  throw new Error('Provide an output path outside the repository for public football data.');
const response = await fetch('https://api.sleeper.app/v1/state/nfl', {
  signal: AbortSignal.timeout(20000),
});
if (!response.ok) throw new Error('Current NFL state is unavailable.');
const state = await readBoundedJson(response, 10000);
const season = Number(state?.season),
  week = state?.week;
if (
  !Number.isInteger(season) ||
  season < 2021 ||
  season > 2099 ||
  !Number.isInteger(week) ||
  week < 1 ||
  week > 18 ||
  state.season_type !== 'regular'
)
  throw new Error('Current regular-season scope is unavailable.');
const settled = await Promise.allSettled([
  new PublicFootballData().get(season),
  new SleeperPlayerCatalog().get(),
  new FootballNewsCache().getForAdvice(),
  new NFLInjuryReportCache().get(season),
]);
const [data, catalog, news, injuries] = settled.map((r) =>
  r.status === 'fulfilled' ? r.value : undefined,
);
if (!data?.players?.length || !catalog?.size)
  throw new Error('Required real football evidence is unavailable.');
const contents = JSON.stringify({
  asOf: new Date().toISOString(),
  state: { season, week, seasonType: state.season_type },
  data,
  catalog: [...catalog],
  news,
  injuries,
});
const output = resolve(path);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, contents, { mode: 0o600 });
console.log(
  JSON.stringify({
    season,
    week,
    playerGameRows: data.players.length,
    catalogPlayers: catalog.size,
    publicForecastRows: data.playerForecasts?.length ?? 0,
    injuryRows: injuries?.rows.length ?? 0,
    snapshotSha256: createHash('sha256').update(contents).digest('hex'),
    scope: 'Public football sources only; no owner league or saved credentials read.',
  }),
);
