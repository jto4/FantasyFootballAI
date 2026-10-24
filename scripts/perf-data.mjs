// Opt-in live check of public data loading: downloads and time with an empty disk cache, then a
// fresh process with the cache filled (should be mostly 304s), plus the cost of projecting every
// player twice in one process (the second pass reuses memoized projections).
// Usage: npm run perf:data   (needs network; not part of CI)
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv[2] === '--run') {
  const cacheDir = process.argv[3];
  const counted = { bytes: 0, requests: 0, notModified: 0 };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await realFetch(input, init);
    counted.requests++;
    if (response.status === 304) counted.notModified++;
    response
      .clone()
      .arrayBuffer()
      .then((body) => (counted.bytes += body.byteLength))
      .catch(() => undefined);
    return response;
  };
  const I = await import('../packages/integrations/dist/index.js');
  const C = await import('../packages/core/dist/index.js');
  I.configureDownloadCache(cacheDir);
  const season = C.nflSeasonFor(Date.now());
  let started = performance.now();
  const [data, usage, catalog, injuries] = await Promise.all([
    new I.PublicFootballData().get(season),
    new I.PublicUsageData().get(season),
    I.getSleeperPlayerCatalog(),
    new I.NFLInjuryReportCache().get(season),
  ]);
  const loadMs = Math.round(performance.now() - started);
  const context = C.projectionContext(data, usage);
  const week = Math.min(
    ...data.games
      .filter((g) => g.season === season && g.seasonType === 'REG' && g.homeScore === undefined)
      .map((g) => g.week),
  );
  const league = {
    platform: 'sleeper',
    scoring: {
      rec: 0.5,
      rec_yd: 0.1,
      rec_td: 6,
      rush_yd: 0.1,
      rush_td: 6,
      pass_yd: 0.04,
      pass_td: 4,
      pass_int: -2,
    },
  };
  const project = () => {
    let projected = 0;
    for (const [playerId, history] of context.byPlayer) {
      const last = history.at(-1);
      const game = last && C.teamGame(data.games, season, week, last.team);
      if (!game) continue;
      const result = C.projectFantasyPoints(
        league,
        { playerId, position: last.position, team: last.team, game, history },
        context,
        C.propModelSettings,
        C.propUsageNorms,
      );
      if (result) projected++;
    }
    return projected;
  };
  started = performance.now();
  const players = project();
  const firstMs = Math.round(performance.now() - started);
  started = performance.now();
  project();
  const secondMs = Math.round(performance.now() - started);
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(
    JSON.stringify({
      loadMs,
      downloadedMB: +(counted.bytes / 1e6).toFixed(1),
      requests: counted.requests,
      notModified: counted.notModified,
      catalogPlayers: catalog.size,
      injuryRows: injuries.rows.length,
      projectedPlayers: players,
      projectAllMs: { first: firstMs, repeat: secondMs },
      rssMB: Math.round(process.memoryUsage().rss / 1e6),
    }),
  );
  process.exit(0);
}

const cacheDir = await mkdtemp(join(tmpdir(), 'sidekick-perf-data-'));
const script = fileURLToPath(import.meta.url);
try {
  for (const label of ['empty cache', 'filled cache']) {
    const run = spawnSync(process.execPath, [script, '--run', cacheDir], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(run.stderr || `perf run failed (${label})`);
    console.log(label.padEnd(13), run.stdout.trim().split('\n').at(-1));
  }
} finally {
  await rm(cacheDir, { recursive: true, force: true });
}
