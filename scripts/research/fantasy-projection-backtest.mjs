// Scores the app's own weekly fantasy projections on 2026 games the stat models never saw, against
// an 8-game average and (benchmark only) ESPN's forecasts, under two scoring systems. Fits the
// kicker and D/ST settings on 2025 and tests them on 2026, and the running-back adjustment for
// teammates ruled out (needs nflverse injuries_{season}.csv saved as inj{season}.csv).
// Usage: node scripts/research/fantasy-projection-backtest.mjs <nflverse dir> <espn settings.json> [out.json] [--emit]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PublicFootballData,
  PublicPlayerForecasts,
  parseDepthCharts,
  parseNFLInjuryReports,
  parsePersonnelSnaps,
} from '../../packages/integrations/dist/index.js';
import {
  footballPosition,
  nflTeamKey,
  playerNameKey,
  projectFantasyPoints,
  projectSpecialTeamsPoints,
  projectionContext,
  propModelSettings,
  ruledOutKeys,
  propUsageNorms,
  scoreHistoricalGame,
  snapKey,
} from '../../packages/core/dist/index.js';

const [usageDir, espnSettingsFile, outFile] = process.argv.slice(2);
const data = await new PublicFootballData().get(2026);
const snaps = new Map();
const depth = new Map();
for (const season of [2024, 2025, 2026]) {
  for (const row of parsePersonnelSnaps(
    readFileSync(join(usageDir, `snaps${season}.csv`), 'utf8'),
    season,
  ))
    snaps.set(snapKey(row.name, row.team, row.gameId), row.offense);
  for (const [id, entries] of parseDepthCharts(
    readFileSync(join(usageDir, `depth${season}.csv`), 'utf8'),
    season,
  ))
    depth.set(id, [...(depth.get(id) ?? []), ...entries]);
}
const ruledOut = new Set();
for (const season of [2025, 2026])
  for (const key of ruledOutKeys(
    parseNFLInjuryReports(readFileSync(join(usageDir, `inj${season}.csv`), 'utf8'), season),
  ))
    ruledOut.add(key);
const context = projectionContext(data, { snaps, depth, ruledOut });

// Afton's real ESPN rules (with D/ST and kicker overrides) and a standard half-PPR league.
const items = JSON.parse(readFileSync(espnSettingsFile, 'utf8')).settings.scoringSettings
  .scoringItems;
const afton = { platform: 'espn', scoring: {}, positionScoring: { DST: {}, K: {} } };
for (const i of items) {
  afton.scoring[i.statId] = i.points;
  if (i.pointsOverrides?.['16'] !== undefined)
    afton.positionScoring.DST[i.statId] = i.pointsOverrides['16'];
  if (i.pointsOverrides?.['17'] !== undefined)
    afton.positionScoring.K[i.statId] = i.pointsOverrides['17'];
}
const halfPpr = {
  platform: 'sleeper',
  scoring: {
    pass_yd: 0.04,
    pass_td: 4,
    pass_int: -2,
    pass_2pt: 2,
    rush_yd: 0.1,
    rush_td: 6,
    rush_2pt: 2,
    rec: 0.5,
    rec_yd: 0.1,
    rec_td: 6,
    rec_2pt: 2,
    fum_lost: -2,
    // Sleeper's standard kicker and team defense rules.
    fgm_0_19: 3,
    fgm_20_29: 3,
    fgm_30_39: 3,
    fgm_40_49: 4,
    fgm_50p: 5,
    fgmiss: -1,
    xpm: 1,
    xpmiss: -1,
    sack: 1,
    int: 2,
    fum_rec: 2,
    def_td: 6,
    def_st_td: 6,
    safe: 2,
    blk_kick: 2,
    pts_allow_0: 10,
    pts_allow_1_6: 7,
    pts_allow_7_13: 4,
    pts_allow_14_20: 1,
    pts_allow_21_27: 0,
    pts_allow_28_34: -1,
    pts_allow_35p: -4,
  },
};

const espn = new Map();
for (const f of (await new PublicPlayerForecasts().get(2026)).playerForecasts ?? [])
  espn.set(`${f.week}:${playerNameKey(f.name)}:${nflTeamKey(f.team)}`, f);
const zeros = Object.fromEntries(
  [
    'passing_yards',
    'passing_tds',
    'passing_interceptions',
    'passing_2pt_conversions',
    'rushing_yards',
    'rushing_tds',
    'rushing_2pt_conversions',
    'rushing_fumbles_lost',
    'receptions',
    'receiving_yards',
    'receiving_tds',
    'receiving_2pt_conversions',
    'receiving_fumbles_lost',
    'sack_fumbles_lost',
  ].map((k) => [k, 0]),
);
const order = (r) => r.season * 100 + r.week;
const score = (league, row) => scoreHistoricalGame(league, row).points;

function evaluate(league, name) {
  const cases = [];
  for (const row of data.players) {
    const pos = footballPosition(row.position);
    if (row.season !== 2026 || row.seasonType !== 'REG' || !['QB', 'RB', 'WR', 'TE'].includes(pos))
      continue;
    const game = context.league.games.get(row.gameId);
    const history = context.byPlayer.get(row.playerId) ?? [];
    const prior = history.filter((h) => order(h) < order(row)).sort((a, b) => order(b) - order(a));
    if (prior.length < 3 || !game) continue;
    const priorPoints = prior
      .slice(0, 8)
      .map((h) => score(league, h))
      .filter((p) => p !== undefined);
    const baseline = priorPoints.reduce((a, b) => a + b, 0) / priorPoints.length;
    // Fantasy-relevant players only: those averaging five or more points recently.
    if (!(baseline >= 5)) continue;
    const actual = score(league, row);
    const ours = projectFantasyPoints(
      league,
      { playerId: row.playerId, position: pos, team: row.team, game, history },
      context,
      propModelSettings,
      propUsageNorms,
      vacated.exponent,
    );
    if (actual === undefined || !ours) continue;
    const f = espn.get(`${row.week}:${playerNameKey(row.name)}:${nflTeamKey(row.team)}`);
    const espnPoints = f ? score(league, { ...row, stats: { ...zeros, ...f.stats } }) : undefined;
    cases.push({
      pos,
      week: row.week,
      actual,
      ours: ours.points,
      baseline,
      ...(espnPoints !== undefined ? { espn: espnPoints } : {}),
    });
  }
  const mae = (list, key) =>
    Math.round((list.reduce((s, c) => s + Math.abs(c.actual - c[key]), 0) / list.length) * 100) /
    100;
  // Of every same-week, same-position pair, how often the higher projection scored more.
  const pairs = (list, key) => {
    let right = 0,
      total = 0;
    const groups = new Map();
    for (const c of list)
      groups.set(`${c.week}:${c.pos}`, [...(groups.get(`${c.week}:${c.pos}`) ?? []), c]);
    for (const group of groups.values())
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i],
            b = group[j];
          if (a.actual === b.actual || a[key] === b[key]) continue;
          total++;
          if (a[key] > b[key] === a.actual > b.actual) right++;
        }
    return Math.round((right / total) * 1000) / 1000;
  };
  const withEspn = cases.filter((c) => c.espn !== undefined);
  // Blend with the player's own recent fantasy average: weight chosen on weeks 1–3, tested on 4+.
  const blend = Object.fromEntries(
    ['QB', 'RB', 'WR', 'TE'].map((pos) => {
      const early = cases.filter((c) => c.pos === pos && c.week <= 3);
      const late = cases.filter((c) => c.pos === pos && c.week >= 4);
      const err = (list, w) =>
        list.reduce((s, c) => s + Math.abs(c.actual - (w * c.ours + (1 - w) * c.baseline)), 0) /
        list.length;
      let best = 1;
      for (const w of [0, 0.25, 0.5, 0.75, 1]) if (err(early, w) < err(early, best)) best = w;
      // A blend is adopted only if it also beats the model alone on the later weeks.
      const adopted = err(late, best) < err(late, 1) ? best : 1;
      return [
        pos,
        {
          modelWeight: adopted,
          chosenOnEarlyWeeks: best,
          testMae: {
            blend: Math.round(err(late, best) * 100) / 100,
            model: Math.round(err(late, 1) * 100) / 100,
            baseline: Math.round(err(late, 0) * 100) / 100,
          },
          testGames: late.length,
        },
      ];
    }),
  );
  const byPosition = Object.fromEntries(
    ['QB', 'RB', 'WR', 'TE'].map((pos) => {
      const list = withEspn.filter((c) => c.pos === pos);
      return [
        pos,
        {
          n: list.length,
          ours: mae(list, 'ours'),
          baseline: mae(list, 'baseline'),
          espn: mae(list, 'espn'),
        },
      ];
    }),
  );
  return {
    scoring: name,
    games: cases.length,
    maeAll: { ours: mae(cases, 'ours'), baseline: mae(cases, 'baseline') },
    sameGamesWithEspn: {
      n: withEspn.length,
      mae: {
        ours: mae(withEspn, 'ours'),
        baseline: mae(withEspn, 'baseline'),
        espn: mae(withEspn, 'espn'),
      },
      pairwiseOrder: {
        ours: pairs(withEspn, 'ours'),
        baseline: pairs(withEspn, 'baseline'),
        espn: pairs(withEspn, 'espn'),
      },
    },
    byPosition,
    blend,
  };
}

// Kickers and D/ST: scored history per player, settings fitted on 2025, tested on 2026.
function specialTeams(league) {
  const rows = data.players.filter(
    (r) => r.seasonType === 'REG' && ['K', 'DST'].includes(footballPosition(r.position)),
  );
  const byId = new Map();
  for (const r of rows) {
    const points = score(league, r);
    if (points !== undefined)
      byId.set(r.playerId, [...(byId.get(r.playerId) ?? []), { row: r, gameId: r.gameId, points }]);
  }
  const cases = [];
  for (const list of byId.values())
    for (const { row, points } of list) {
      if (row.season < 2025) continue;
      const game = context.league.games.get(row.gameId);
      const prior = list.filter((h) => order(h.row) < order(row));
      if (!game || prior.length < 3) continue;
      cases.push({
        row,
        game,
        actual: points,
        history: prior,
        pos: footballPosition(row.position),
      });
    }
  const run = (list, params) =>
    list.reduce((sum, c) => {
      const p = projectSpecialTeamsPoints(c.pos, c.row.team, c.game, c.history, context, params);
      return sum + Math.abs(c.actual - (p?.points ?? 0));
    }, 0) / list.length;
  const fitted = {};
  const report = {};
  for (const pos of ['K', 'DST']) {
    const train = cases.filter((c) => c.pos === pos && c.row.season === 2025);
    const test = cases.filter((c) => c.pos === pos && c.row.season === 2026);
    if (!train.length || !test.length) continue;
    let best;
    for (const halfLife of [3, 5, 8, 12, 20])
      for (const kickerEnvExponent of pos === 'K' ? [0, 0.5, 1, 1.5] : [0])
        for (const defenseOpponentCoefficient of pos === 'DST'
          ? [0, 0.1, 0.2, 0.3, 0.4, 0.5]
          : [0]) {
          const params = { halfLife, kickerEnvExponent, defenseOpponentCoefficient };
          const loss = run(train, params);
          if (!best || loss < best.loss) best = { params, loss };
        }
    fitted[pos] = best.params;
    const baseline =
      test.reduce((sum, c) => {
        const recent = [...c.history].sort((a, b) => order(b.row) - order(a.row)).slice(0, 8);
        return sum + Math.abs(c.actual - recent.reduce((s, h) => s + h.points, 0) / recent.length);
      }, 0) / test.length;
    report[pos] = {
      train: train.length,
      test: test.length,
      params: best.params,
      maeTest: {
        ours: Math.round(run(test, best.params) * 100) / 100,
        baseline8: Math.round(baseline * 100) / 100,
      },
    };
  }
  return { fitted, report };
}

// Running backs whose teammates are ruled out: exponent fitted on 2025, tested on 2026, by RMSE.
function vacatedCarries(league) {
  const cases = [];
  for (const row of data.players) {
    if (row.season < 2025 || row.seasonType !== 'REG' || footballPosition(row.position) !== 'RB')
      continue;
    const game = context.league.games.get(row.gameId);
    const history = context.byPlayer.get(row.playerId) ?? [];
    if (!game || history.filter((h) => order(h) < order(row)).length < 3) continue;
    const actual = score(league, row);
    const at = (exponent) =>
      projectFantasyPoints(
        league,
        { playerId: row.playerId, position: 'RB', team: row.team, game, history },
        context,
        propModelSettings,
        propUsageNorms,
        exponent,
      );
    const base = at(0);
    if (actual === undefined || !base || base.points < 3) continue;
    if (!at(1)?.vacatedCarryShare) continue;
    cases.push({ season: row.season, actual, at });
  }
  const rmse = (list, exponent) =>
    Math.sqrt(list.reduce((s, c) => s + (c.actual - c.at(exponent).points) ** 2, 0) / list.length);
  const train = cases.filter((c) => c.season === 2025);
  const test = cases.filter((c) => c.season === 2026);
  let best = 0;
  for (const e of [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5])
    if (rmse(train, e) < rmse(train, best)) best = e;
  // Adopted only if it also beats no adjustment on the 2026 games.
  const adopted = test.length && rmse(test, best) < rmse(test, 0) ? best : 0;
  const r = (x) => Math.round(x * 100) / 100;
  return {
    exponent: adopted,
    chosenOn2025: best,
    train: train.length,
    test: test.length,
    testRmse: { adjusted: r(rmse(test, best)), unadjusted: r(rmse(test, 0)) },
  };
}

const vacated = vacatedCarries(afton);
const special = specialTeams(halfPpr);
const aftonSpecial = specialTeams(afton);
const aftonResult = evaluate(afton, 'Afton (ESPN rules)');
const result = {
  afton: aftonResult,
  halfPpr: evaluate(halfPpr, 'Half PPR'),
  specialTeams: { halfPpr: special.report, afton: aftonSpecial.report },
  vacatedCarries: { afton: vacated },
};
console.log(JSON.stringify(result, null, 2));
if (outFile && !outFile.startsWith('--')) writeFileSync(outFile, JSON.stringify(result, null, 2));
if (process.argv.includes('--emit'))
  writeFileSync(
    'packages/core/src/fantasy-projection-settings.ts',
    `// Generated by scripts/research/fantasy-projection-backtest.mjs --emit; see docs/decisions.md.\n` +
      `import type { SpecialTeamsParams } from './fantasy-projection.js';\n\n` +
      `/** Weight on the stat model versus the player's recent fantasy average, by position. */\n` +
      `export const fantasyModelWeight: Record<'QB' | 'RB' | 'WR' | 'TE', number> = ${JSON.stringify(
        Object.fromEntries(
          Object.entries(aftonResult.blend).map(([pos, b]) => [pos, b.modelWeight]),
        ),
      )};\n\n` +
      `/** Running backs: exponent on 1 / (1 − carry share of backs ruled out); 0 means off. */\n` +
      `export const vacatedCarryExponent = ${vacated.exponent};\n\n` +
      `export const specialTeamsSettings: Record<'K' | 'DST', SpecialTeamsParams> = ${JSON.stringify(
        {
          K: special.fitted.K ?? {
            halfLife: 8,
            kickerEnvExponent: 0,
            defenseOpponentCoefficient: 0,
          },
          DST: special.fitted.DST ?? {
            halfLife: 8,
            kickerEnvExponent: 0,
            defenseOpponentCoefficient: 0,
          },
        },
        null,
        2,
      )};\n`,
  );
