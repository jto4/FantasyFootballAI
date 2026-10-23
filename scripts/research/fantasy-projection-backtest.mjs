// Scores the app's own weekly fantasy projections on 2026 games the stat models never saw, against
// an 8-game average and (benchmark only) ESPN's forecasts, under two scoring systems. Fits the
// kicker and D/ST settings on 2025 and tests them on 2026, and the running-back adjustment for
// teammates ruled out (needs nflverse injuries_{season}.csv saved as inj{season}.csv), outcome
// spreads for ranges and win probability, and the forecast-wind adjustment.
// Usage: node scripts/research/fantasy-projection-backtest.mjs <nflverse dir> <espn settings.json> [out.json] [--emit]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PublicFootballData,
  PublicPlayerForecasts,
  fetchGameWeather,
  parseDepthCharts,
  parseGameWeather,
  weatherVenue,
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
  windFactor,
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
// Forecast wind issued about 48 hours before each 2025–2026 game at fixed outdoor venues (the
// archive the betting model uses), so no game's own weather leaks into its projection.
const windKph = new Map();
const outdoor = new Map();
for (const g of data.games)
  if (g.seasonType === 'REG' && g.season >= 2025 && g.kickoffAt && weatherVenue(g))
    outdoor.set(weatherVenue(g).id, [...(outdoor.get(weatherVenue(g).id) ?? []), g]);
for (const list of outdoor.values()) {
  const raw = await fetchGameWeather(
    list[0],
    '2025-09-01',
    new Date().toISOString().slice(0, 10),
  ).catch(() => undefined);
  for (const g of list) {
    const w = raw && parseGameWeather(raw, g, g.kickoffAt);
    if (w) windKph.set(g.id, w.windKph);
  }
}
const context = projectionContext(data, { snaps, depth, ruledOut, windKph });

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
      weather,
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

// Outcome spread: error SD = a + b × projection per position (fitted on 2025 by least squares on
// |error|·√(π/2)), plus the 10th/90th percentiles of the standardized error for ranges. Checked on
// 2026 by range coverage and by win-probability calibration on random lineup pairs. Skill players
// and D/ST use Afton's rules; kickers use half PPR (Afton has no kicker slot).
function outcomeSpread() {
  const cases = [];
  const scored = new Map();
  for (const r of data.players) {
    const pos = footballPosition(r.position);
    if (r.seasonType !== 'REG' || (pos !== 'K' && pos !== 'DST')) continue;
    const points = score(pos === 'K' ? halfPpr : afton, r);
    if (points !== undefined)
      scored.set(r.playerId, [
        ...(scored.get(r.playerId) ?? []),
        { row: r, gameId: r.gameId, points },
      ]);
  }
  for (const row of data.players) {
    const pos = footballPosition(row.position);
    if (row.season < 2025 || row.seasonType !== 'REG') continue;
    const game = context.league.games.get(row.gameId);
    if (!game) continue;
    let projected;
    if (['QB', 'RB', 'WR', 'TE'].includes(pos)) {
      const history = context.byPlayer.get(row.playerId) ?? [];
      const prior = history
        .filter((h) => order(h) < order(row))
        .sort((a, b) => order(b) - order(a));
      if (prior.length < 3) continue;
      const recent = prior
        .slice(0, 8)
        .map((h) => score(afton, h))
        .filter((p) => p !== undefined);
      if (!(recent.reduce((a, b) => a + b, 0) / recent.length >= 5)) continue;
      projected = projectFantasyPoints(
        afton,
        { playerId: row.playerId, position: pos, team: row.team, game, history },
        context,
        propModelSettings,
        propUsageNorms,
        vacated.exponent,
      )?.points;
    } else if (pos === 'K' || pos === 'DST') {
      const prior = (scored.get(row.playerId) ?? []).filter((h) => order(h.row) < order(row));
      projected = projectSpecialTeamsPoints(
        pos,
        row.team,
        game,
        prior,
        context,
        special.fitted[pos] ?? specialTeamsDefaults[pos],
      )?.points;
    } else continue;
    const actual = score(pos === 'K' ? halfPpr : afton, row);
    if (projected !== undefined && actual !== undefined)
      cases.push({ pos, season: row.season, week: row.week, game, projected, actual });
  }
  // Wind: one threshold and coefficient for the offense and kickers, fitted on 2025 by RMSE and
  // adopted only if it also lowers RMSE on 2026 games with wind above the threshold.
  const offense = cases.filter((c) => c.pos !== 'DST');
  const rmse = (list, w) =>
    Math.sqrt(
      list.reduce((s, c) => s + (c.actual - c.projected * windFactor(context, c.game, w)) ** 2, 0) /
        list.length,
    );
  let wind = { windThresholdKph: 15, windCoefficient: 0 };
  for (const windThresholdKph of [10, 15, 20, 25])
    for (let k = -30; k <= 0; k++) {
      const w = { windThresholdKph, windCoefficient: k / 100 };
      if (
        rmse(
          offense.filter((c) => c.season === 2025),
          w,
        ) <
        rmse(
          offense.filter((c) => c.season === 2025),
          wind,
        )
      )
        wind = w;
    }
  const windy = offense.filter(
    (c) => c.season === 2026 && (context.windKph.get(c.game.id) ?? 0) > wind.windThresholdKph,
  );
  const off = { ...wind, windCoefficient: 0 };
  const adoptedWind = windy.length && rmse(windy, wind) < rmse(windy, off) ? wind : off;
  const windReport = {
    chosenOn2025: wind,
    adopted: adoptedWind,
    gamesWithForecast: context.windKph.size,
    windyTest: windy.length,
    windyTestRmse: {
      adjusted: Math.round(rmse(windy, wind) * 1000) / 1000,
      unadjusted: Math.round(rmse(windy, off) * 1000) / 1000,
    },
  };
  for (const c of offense) c.projected *= windFactor(context, c.game, adoptedWind);
  const spread = {};
  const report = {};
  const r = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DST']) {
    const train = cases.filter((c) => c.pos === pos && c.season === 2025);
    const test = cases.filter((c) => c.pos === pos && c.season === 2026);
    if (train.length < 50) continue;
    const xs = train.map((c) => c.projected);
    const ys = train.map((c) => Math.abs(c.actual - c.projected) * Math.sqrt(Math.PI / 2));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0,
      sxx = 0;
    xs.forEach((x, i) => {
      sxy += (x - mx) * (ys[i] - my);
      sxx += (x - mx) ** 2;
    });
    const slope = Math.max(0, sxy / sxx);
    const intercept = my - slope * mx;
    const sd = (p) => Math.max(1, intercept + slope * p);
    const z = train.map((c) => (c.actual - c.projected) / sd(c.projected)).sort((a, b) => a - b);
    const q = (p) => z[Math.round(p * (z.length - 1))];
    spread[pos] = {
      sdIntercept: r(intercept),
      sdSlope: r(slope, 4),
      low: r(q(0.1)),
      high: r(q(0.9)),
    };
    const covered = test.filter(
      (c) =>
        c.actual >= c.projected + spread[pos].low * sd(c.projected) &&
        c.actual <= c.projected + spread[pos].high * sd(c.projected),
    ).length;
    report[pos] = {
      train: train.length,
      test: test.length,
      rangeCoverage2026: r(covered / test.length),
    };
  }
  // Win probability on random lineup pairs (QB, 3 RB, 2 WR, TE, D/ST) from the same week.
  const phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pairs = (season) => {
    const out = [];
    const weeks = [...new Set(cases.filter((c) => c.season === season).map((c) => c.week))];
    for (const week of weeks) {
      const pool = Object.fromEntries(
        ['QB', 'RB', 'WR', 'TE', 'DST'].map((p) => [
          p,
          cases.filter((c) => c.season === season && c.week === week && c.pos === p),
        ]),
      );
      if (Object.values(pool).some((l) => l.length < 8)) continue;
      for (let n = 0; n < 300; n++) {
        const used = new Set();
        const pick = (p, k) => {
          const chosen = [];
          while (chosen.length < k) {
            const c = pool[p][Math.floor(random() * pool[p].length)];
            if (used.has(c)) continue;
            used.add(c);
            chosen.push(c);
          }
          return chosen;
        };
        const lineup = () => [
          ...pick('QB', 1),
          ...pick('RB', 3),
          ...pick('WR', 2),
          ...pick('TE', 1),
          ...pick('DST', 1),
        ];
        const a = lineup(),
          b = lineup();
        const sd = (c) =>
          Math.max(1, spread[c.pos].sdIntercept + spread[c.pos].sdSlope * c.projected);
        const sum = (l, k) => l.reduce((s, c) => s + c[k], 0);
        const actual = sum(a, 'actual') - sum(b, 'actual');
        if (actual === 0) continue;
        out.push({
          mean: sum(a, 'projected') - sum(b, 'projected'),
          variance: [...a, ...b].reduce((s, c) => s + sd(c) ** 2, 0),
          won: actual > 0 ? 1 : 0,
        });
      }
    }
    return out;
  };
  const brier = (list, k) =>
    list.reduce((s, c) => s + (phi(c.mean / Math.sqrt(k * c.variance)) - c.won) ** 2, 0) /
    list.length;
  const train = pairs(2025),
    test = pairs(2026);
  let varianceScale = 1;
  for (const k of [0.8, 0.9, 1, 1.1, 1.2, 1.4, 1.6])
    if (brier(train, k) < brier(train, varianceScale)) varianceScale = k;
  const bins = [];
  for (let lo = 0; lo < 1; lo += 0.2) {
    const inBin = test.filter((c) => {
      const p = phi(c.mean / Math.sqrt(varianceScale * c.variance));
      return p >= lo && p < lo + 0.2;
    });
    if (inBin.length)
      bins.push({
        from: r(lo, 1),
        n: inBin.length,
        predicted: r(
          inBin.reduce((s, c) => s + phi(c.mean / Math.sqrt(varianceScale * c.variance)), 0) /
            inBin.length,
        ),
        actual: r(inBin.reduce((s, c) => s + c.won, 0) / inBin.length),
      });
  }
  return {
    spread,
    varianceScale,
    wind: adoptedWind,
    report: {
      ...report,
      wind: windReport,
      winProbability: {
        trainPairs: train.length,
        testPairs: test.length,
        varianceScale,
        brier2026: r(brier(test, varianceScale), 4),
        coinFlip: 0.25,
        calibration2026: bins,
      },
    },
  };
}
// Abramowitz–Stegun 7.1.26, accurate to about 1e-7.
function erf(x) {
  const sign = Math.sign(x);
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return sign * y;
}
const specialTeamsDefaults = {
  K: { halfLife: 8, kickerEnvExponent: 0, defenseOpponentCoefficient: 0 },
  DST: { halfLife: 8, kickerEnvExponent: 0, defenseOpponentCoefficient: 0 },
};

const vacated = vacatedCarries(afton);
const special = specialTeams(halfPpr);
const outcomes = outcomeSpread();
const weather = outcomes.wind;
const aftonSpecial = specialTeams(afton);
const aftonResult = evaluate(afton, 'Afton (ESPN rules)');
const result = {
  afton: aftonResult,
  halfPpr: evaluate(halfPpr, 'Half PPR'),
  specialTeams: { halfPpr: special.report, afton: aftonSpecial.report },
  vacatedCarries: { afton: vacated },
  outcomeSpread: outcomes.report,
};
console.log(JSON.stringify(result, null, 2));
if (outFile && !outFile.startsWith('--')) writeFileSync(outFile, JSON.stringify(result, null, 2));
if (process.argv.includes('--emit'))
  writeFileSync(
    'packages/core/src/fantasy-projection-settings.ts',
    `// Generated by scripts/research/fantasy-projection-backtest.mjs --emit; see docs/decisions.md.\n` +
      `import type {\n  OutcomeSpread,\n  SpecialTeamsParams,\n  WeatherParams,\n} from './fantasy-projection.js';\n\n` +
      `/** Weight on the stat model versus the player's recent fantasy average, by position. */\n` +
      `export const fantasyModelWeight: Record<'QB' | 'RB' | 'WR' | 'TE', number> = ${JSON.stringify(
        Object.fromEntries(
          Object.entries(aftonResult.blend).map(([pos, b]) => [pos, b.modelWeight]),
        ),
      )};\n\n` +
      `/** Running backs: exponent on 1 / (1 − carry share of backs ruled out); 0 means off. */\n` +
      `export const vacatedCarryExponent = ${vacated.exponent};\n\n` +
      `/** Error SD = sdIntercept + sdSlope × projection; low/high are 10th/90th standardized errors. */\n` +
      `export const fantasyOutcomeSpread: Record<'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST', OutcomeSpread> = ${JSON.stringify(outcomes.spread, null, 2)};\n\n` +
      `/** Forecast wind effect on QB/RB/WR/TE/K projections; a coefficient of 0 means off. */\n` +
      `export const weatherSettings: WeatherParams = ${JSON.stringify(outcomes.wind)};\n\n` +
      `/** Inflates summed lineup variance for win probability (fitted on random 2025 lineup pairs). */\n` +
      `export const matchupVarianceScale = ${outcomes.varianceScale};\n\n` +
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
