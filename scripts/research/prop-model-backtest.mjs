// Fits and evaluates the player-prop model. Train: 2025 regular season (2024 as history).
// Holdout: completed 2026 regular-season games, never used for fitting. Prints fitted settings
// and holdout metrics as JSON. Usage: node scripts/research/prop-model-backtest.mjs [out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PublicFootballData,
  PublicPlayerForecasts,
} from '../../packages/integrations/dist/index.js';
import {
  buildPropModelLeague,
  defaultPropModelParams,
  footballPosition,
  modelMedian,
  nflTeamKey,
  playerNameKey,
  predictPropMean,
  probabilityOver,
  propMedianRatio,
  propModelStats,
} from '../../packages/core/dist/index.js';

const data = await new PublicFootballData().get(2026);
const rows = data.players.filter((r) => r.seasonType === 'REG');
const league = buildPropModelLeague(rows, data.games);
// League averages come from training seasons only, so the holdout never informs them.
const trainLeague = buildPropModelLeague(
  rows.filter((r) => r.season <= 2025),
  data.games.filter((g) => g.season <= 2025),
);
league.averageAllowed = trainLeague.averageAllowed;
league.averageTeamPoints = trainLeague.averageTeamPoints;

// Optional usage data from local nflverse files: --usage <dir> with stats_player_week, snap_counts
// and depth_charts CSVs for 2024–2026 (statsYYYY.csv, snapsYYYY.csv, depthYYYY.csv).
const usageIndex = process.argv.indexOf('--usage');
const usageDir = usageIndex > 0 ? process.argv[usageIndex + 1] : undefined;
const csv = (file) => {
  const [header, ...lines] = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const keys = header.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(keys.map((k, i) => [k, cells[i]]));
  });
};
const num = (v) => (v === undefined || v === '' || v === 'NA' ? undefined : Number(v));
const depthIndex = new Map();
let usageNorms;
if (usageDir) {
  const statUsage = new Map();
  const snapUsage = new Map();
  for (const season of [2024, 2025, 2026]) {
    for (const r of csv(join(usageDir, `stats${season}.csv`)))
      statUsage.set(`${r.player_id}:${r.game_id}`, {
        targetShare: num(r.target_share),
        receivingAirYards: num(r.receiving_air_yards),
      });
    for (const r of csv(join(usageDir, `snaps${season}.csv`)))
      snapUsage.set(
        `${playerNameKey(r.player)}:${nflTeamKey(r.team)}:${r.game_id}`,
        num(r.offense_pct),
      );
    const skill = (pos) =>
      ['QB'].includes(pos)
        ? 'QB'
        : ['RB', 'HB'].includes(pos)
          ? 'RB'
          : ['WR', 'LWR', 'RWR', 'SWR'].includes(pos)
            ? 'WR'
            : pos === 'TE'
              ? 'TE'
              : undefined;
    for (const r of csv(join(usageDir, `depth${season}.csv`))) {
      // 2024 files are weekly (week + depth_team); later files are dated snapshots (dt + pos_rank).
      const id = r.gsis_id;
      const pos = skill(r.dt ? r.pos_abb : r.depth_position);
      const rank = num(r.dt ? r.pos_rank : r.depth_team);
      if (!id || !pos || !rank) continue;
      const entry = r.dt ? { at: r.dt, pos, rank } : { season, week: Number(r.week), pos, rank };
      depthIndex.set(id, [...(depthIndex.get(id) ?? []), entry]);
    }
  }
  for (const r of rows) {
    const stat = statUsage.get(`${r.playerId}:${r.gameId}`);
    const snap = snapUsage.get(`${playerNameKey(r.name)}:${nflTeamKey(r.team)}:${r.gameId}`);
    const usage = {
      ...(snap !== undefined ? { snapShare: snap } : {}),
      ...(stat?.targetShare !== undefined && Number.isFinite(stat.targetShare)
        ? { targetShare: stat.targetShare }
        : {}),
      ...(stat?.receivingAirYards !== undefined && Number.isFinite(stat.receivingAirYards)
        ? { receivingAirYards: stat.receivingAirYards }
        : {}),
    };
    if (Object.keys(usage).length) r.usage = usage;
  }
}
/** Depth rank at a position before a game: weekly charts by week, dated charts by kickoff. */
function depthRank(playerId, position, game) {
  const entries = depthIndex.get(playerId);
  if (!entries || !game) return undefined;
  const cutoff = game.kickoffAt ?? `${game.date}T23:59:59Z`;
  const pos = footballPosition(position);
  const pick = entries.filter(
    (e) =>
      e.pos === pos &&
      (e.at
        ? e.at < cutoff && e.at.slice(0, 4) >= String(game.season)
        : e.season === game.season && e.week === game.week),
  );
  if (!pick.length) return undefined;
  if (pick[0].at) {
    const latest = pick.reduce((a, b) => (a.at > b.at ? a : b)).at;
    return Math.min(...pick.filter((e) => e.at === latest).map((e) => e.rank));
  }
  return Math.min(...pick.map((e) => e.rank));
}
const byPlayer = new Map();
for (const r of rows) byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r]);

if (usageDir) {
  // Norms come from training games only (2025), so the holdout never informs them.
  const train = rows.filter((r) => r.season === 2025 && r.usage);
  const shares = {};
  for (const r of train) {
    const pos = footballPosition(r.position);
    if (!['QB', 'RB', 'WR', 'TE'].includes(pos) || r.usage.snapShare === undefined) continue;
    const rank = depthRank(r.playerId, pos, league.games.get(r.gameId));
    if (!rank || rank > 4) continue;
    (shares[pos] ??= [[], [], [], []])[rank - 1].push(r.usage.snapShare);
  }
  const median = (v) => {
    const sorted = [...v].sort((a, b) => a - b);
    return sorted.length
      ? Math.round(sorted[Math.floor(sorted.length / 2)] * 1000) / 1000
      : undefined;
  };
  const snapShareByRank = Object.fromEntries(
    Object.entries(shares).map(([pos, byRank]) => {
      const values = byRank.map(median);
      // Ranks without data take the next-better rank's share so lookups never fail.
      for (let i = 1; i < values.length; i++) values[i] ??= values[i - 1];
      return [pos, values];
    }),
  );
  let yards = 0,
    air = 0;
  for (const r of train)
    if (
      ['WR', 'TE'].includes(footballPosition(r.position)) &&
      (r.usage.receivingAirYards ?? 0) > 0
    ) {
      yards += r.stats.receiving_yards ?? 0;
      air += r.usage.receivingAirYards;
    }
  usageNorms = { snapShareByRank, yardsPerAirYard: Math.round((yards / air) * 1000) / 1000 };
  console.error(
    'usage norms',
    JSON.stringify(usageNorms),
    'rows with usage',
    rows.filter((r) => r.usage).length,
  );
}
// Players a book would post a line for, judged from pre-game history with default settings.
const eligible = {
  passing_yards: (pos, base) => pos === 'QB' && base >= 150,
  completions: (pos, base) => pos === 'QB' && base >= 14,
  attempts: (pos, base) => pos === 'QB' && base >= 22,
  passing_tds: (pos, base) => pos === 'QB' && base >= 0.8,
  passing_interceptions: (pos, base) => pos === 'QB' && base >= 0.4,
  rushing_yards: (pos, base) => ['QB', 'RB', 'WR'].includes(pos) && base >= 20,
  carries: (pos, base) => ['QB', 'RB'].includes(pos) && base >= 6,
  receiving_yards: (pos, base) => ['RB', 'WR', 'TE'].includes(pos) && base >= 20,
  receptions: (pos, base) => ['RB', 'WR', 'TE'].includes(pos) && base >= 2,
  rushing_tds: (pos, base) => ['QB', 'RB'].includes(pos) && base >= 0.15,
  receiving_tds: (pos, base) => ['RB', 'WR', 'TE'].includes(pos) && base >= 0.1,
};

function samples(stat) {
  const out = [];
  for (const r of rows) {
    const game = league.games.get(r.gameId);
    const actual = r.stats[stat];
    if (!game || actual === undefined || r.season < 2025) continue;
    const pos = footballPosition(r.position);
    const history = byPlayer.get(r.playerId);
    const prior = predictPropMean(
      { stat, position: pos, team: r.team, game, history },
      league,
      defaultPropModelParams,
    );
    if (!prior || prior.sampleGames < 3 || !eligible[stat](pos, prior.base)) continue;
    const lastGame = history
      .filter((h) => h.season * 100 + h.week < r.season * 100 + r.week)
      .sort((a, b) => b.season * 100 + b.week - (a.season * 100 + a.week))[0];
    const depth = usageDir
      ? {
          now: depthRank(r.playerId, pos, game),
          atLastGame: lastGame
            ? depthRank(r.playerId, pos, league.games.get(lastGame.gameId))
            : undefined,
        }
      : undefined;
    out.push({ row: r, game, pos, actual, history, depth, holdout: r.season === 2026 });
  }
  return out;
}

const modelPredict = (stat, s, params) =>
  predictPropMean(
    {
      stat,
      position: s.pos,
      team: s.row.team,
      game: s.game,
      history: s.history,
      ...(s.depth ? { depth: s.depth } : {}),
    },
    league,
    params,
    usageNorms,
  );
const deviance = (y, mu) => {
  const m = Math.max(mu, 1e-6);
  return 2 * ((y > 0 ? y * Math.log(y / m) : 0) - (y - m));
};
function loss(stat, list, params) {
  let sum = 0;
  for (const s of list) {
    sum += deviance(s.actual, modelPredict(stat, s, params).mean);
  }
  return sum / list.length;
}

const grid = {
  halfLife: [3, 5, 8, 12, 20],
  priorSeasonWeight: [0.2, 0.4, 0.7, 1],
  shrinkGames: [0, 1, 3, 6],
  envExponent: [0, 0.4, 0.8, 1.2],
  scriptCoefficient: [-0.3, -0.15, 0, 0.15, 0.3],
  opponentExponent: [0, 0.3, 0.6, 1],
  opponentShrinkGames: [3, 6, 12],
  homeFactor: [0.97, 1, 1.03],
  ...(usageDir
    ? {
        snapExponent: [0, 0.3, 0.6, 1],
        depthExponent: [0, 0.3, 0.6, 1],
        targetShareExponent: [0, 0.3, 0.6, 1],
        airYardsWeight: [0, 0.25, 0.5],
      }
    : {}),
};
function fit(stat, train) {
  let params = { ...defaultPropModelParams };
  let best = loss(stat, train, params);
  // Coordinate search: a few passes over each setting holding the others fixed.
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (const [key, values] of Object.entries(grid))
      for (const value of values) {
        if (params[key] === value) continue;
        const next = { ...params, [key]: value };
        const l = loss(stat, train, next);
        if (l < best - 1e-9) {
          best = l;
          params = next;
          improved = true;
        }
      }
    if (!improved) break;
  }
  return { params, trainDeviance: best };
}

const isCount = (stat) => !stat.endsWith('_yards');
function lgamma(x) {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
function outcomeModel(stat, fitted) {
  if (isCount(stat)) {
    let best;
    for (const size of [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 20, 40, 100, 1000]) {
      let ll = 0;
      for (const { mean, actual } of fitted) {
        const m = Math.max(mean, 1e-6),
          p = size / (size + m);
        ll +=
          lgamma(actual + size) -
          lgamma(size) -
          lgamma(actual + 1) +
          size * Math.log(p) +
          actual * Math.log(1 - p);
      }
      if (!best || ll > best.ll) best = { size, ll };
    }
    return { kind: 'count', size: best.size };
  }
  const ratios = fitted
    .map(({ mean, actual }) => actual / Math.max(mean, 1e-6))
    .sort((a, b) => a - b);
  const quantiles = Array.from({ length: 41 }, (_, i) => {
    const pos = (i / 40) * (ratios.length - 1);
    const lo = Math.floor(pos),
      hi = Math.ceil(pos);
    return Math.round((ratios[lo] + (ratios[hi] - ratios[lo]) * (pos - lo)) * 1000) / 1000;
  });
  return { kind: 'ratio', quantiles };
}

const forecasts = new Map();
// ESPN's forecasts are a benchmark here only; the app does not use them.
const espnBenchmark = (await new PublicPlayerForecasts().get(2026)).playerForecasts ?? [];
for (const f of espnBenchmark)
  forecasts.set(`${f.week}:${playerNameKey(f.name)}:${nflTeamKey(f.team)}`, f);

const half = (x) => Math.floor(x) + 0.5;
const report = {
  trainedOn: '2025 REG (2024 history)',
  holdout: '2026 REG completed games',
  stats: {},
};
for (const stat of propModelStats) {
  const all = samples(stat);
  const train = all.filter((s) => !s.holdout);
  const holdout = all.filter((s) => s.holdout);
  const { params, trainDeviance } = fit(stat, train);
  const predict = (s, p = params) => modelPredict(stat, s, p);
  const outcome = outcomeModel(
    stat,
    train.map((s) => ({ mean: predict(s).mean, actual: s.actual })),
  );
  // Holdout metrics.
  let mae = { model: 0, recent: 0, seasonAverage: 0, espn: 0, blend: 0 },
    espnN = 0;
  const pit = Array(10).fill(0);
  const lines = { naive: [], espn: [] };
  for (const s of holdout) {
    const p = predict(s);
    const median = modelMedian(p.mean, outcome);
    const recent = predict(s, { ...defaultPropModelParams }).mean;
    const thisSeason = s.history
      .filter((r) => r.season === 2026 && r.week < s.row.week)
      .map((r) => r.stats[stat]);
    const seasonAverage = thisSeason.length
      ? thisSeason.reduce((a, b) => a + b, 0) / thisSeason.length
      : recent;
    mae.model += Math.abs(s.actual - median);
    mae.recent += Math.abs(s.actual - recent * (propMedianRatio[stat] ?? 1));
    mae.seasonAverage += Math.abs(s.actual - seasonAverage * (propMedianRatio[stat] ?? 1));
    const f = forecasts.get(`${s.row.week}:${playerNameKey(s.row.name)}:${nflTeamKey(s.row.team)}`);
    const espn = f?.stats[stat];
    if (espn !== undefined) {
      espnN++;
      const typical = espn * (propMedianRatio[stat] ?? 1);
      mae.espn += Math.abs(s.actual - typical);
      mae.blend += Math.abs(s.actual - modelMedian((p.mean + espn) / 2, outcome));
      lines.espn.push({
        line: half(typical),
        p: probabilityOver(half(typical), p.mean, outcome),
        actual: s.actual,
      });
    }
    // Probability integral transform: a calibrated model spreads these evenly over deciles.
    const below = 1 - probabilityOver(s.actual, p.mean, outcome);
    const atOrBelow = isCount(stat) ? 1 - probabilityOver(s.actual - 1, p.mean, outcome) : below;
    const u = isCount(stat) ? (below + atOrBelow) / 2 : below;
    pit[Math.min(9, Math.floor(u * 10))]++;
    const naiveLine = half(seasonAverage * (propMedianRatio[stat] ?? 1));
    lines.naive.push({
      line: naiveLine,
      p: probabilityOver(naiveLine, p.mean, outcome),
      actual: s.actual,
    });
  }
  const n = holdout.length;
  const scoreLines = (list) => {
    if (!list.length) return undefined;
    let logLoss = 0,
      brier = 0,
      wins = 0,
      losses = 0,
      confident = { wins: 0, losses: 0 };
    for (const { line, p, actual } of list) {
      const over = actual > line ? 1 : 0;
      const q = Math.min(0.99, Math.max(0.01, p));
      logLoss -= over ? Math.log(q) : Math.log(1 - q);
      brier += (q - over) ** 2;
      const pick = p >= 0.5 ? 1 : 0;
      if (pick === over) wins++;
      else losses++;
      if (Math.abs(p - 0.5) >= 0.08) {
        if (pick === over) confident.wins++;
        else confident.losses++;
      }
    }
    return {
      lines: list.length,
      overRate:
        Math.round((list.filter((x) => x.actual > x.line).length / list.length) * 1000) / 1000,
      logLoss: Math.round((logLoss / list.length) * 1000) / 1000,
      coinFlipLogLoss: 0.693,
      brier: Math.round((brier / list.length) * 1000) / 1000,
      sideRecord: `${wins}-${losses}`,
      sideHitRate: Math.round((wins / (wins + losses)) * 1000) / 1000,
      confidentRecord: `${confident.wins}-${confident.losses}`,
      confidentHitRate:
        confident.wins + confident.losses
          ? Math.round((confident.wins / (confident.wins + confident.losses)) * 1000) / 1000
          : undefined,
    };
  };
  const r3 = (x) => Math.round(x * 100) / 100;
  report.stats[stat] = {
    params,
    outcome,
    train: {
      n: train.length,
      deviance: r3(trainDeviance),
      defaultDeviance: r3(loss(stat, train, defaultPropModelParams)),
    },
    holdout: {
      n,
      maeVsActual: {
        model: r3(mae.model / n),
        recencyOnly: r3(mae.recent / n),
        seasonAverage: r3(mae.seasonAverage / n),
        ...(espnN
          ? {
              espnTypical: r3(mae.espn / espnN),
              modelEspnBlend: r3(mae.blend / espnN),
              espnGames: espnN,
            }
          : {}),
      },
      calibrationDeciles: pit.map((c) => Math.round((c / n) * 1000) / 1000),
      vsNaiveLines: scoreLines(lines.naive),
      vsEspnLines: scoreLines(lines.espn),
    },
  };
  // Ensemble: blend the model mean with ESPN's projection. The weight and the outcome spread are
  // fitted on 2026 weeks 1–3 and tested on weeks 4 and later, so the test stays out of sample.
  const withEspn = holdout
    .map((s) => {
      const f = forecasts.get(
        `${s.row.week}:${playerNameKey(s.row.name)}:${nflTeamKey(s.row.team)}`,
      );
      const espn = f?.stats[stat];
      return espn === undefined ? undefined : { s, espn, model: predict(s).mean };
    })
    .filter(Boolean);
  const early = withEspn.filter((x) => x.s.row.week <= 3);
  const late = withEspn.filter((x) => x.s.row.week >= 4);
  const center = (x, w) => w * x.espn + (1 - w) * x.model;
  let bestWeight = 1,
    bestDev = Infinity;
  for (const w of [0, 0.25, 0.5, 0.75, 1]) {
    const dev =
      early.reduce((sum, x) => sum + deviance(x.s.actual, center(x, w)), 0) / early.length;
    if (dev < bestDev) {
      bestDev = dev;
      bestWeight = w;
    }
  }
  const ensembleOutcome = outcomeModel(
    stat,
    early.map((x) => ({ mean: center(x, bestWeight), actual: x.s.actual })),
  );
  const pitLate = Array(10).fill(0);
  let maeEnsemble = 0,
    maeEspnLate = 0,
    medianOver = 0;
  for (const x of late) {
    const mean = center(x, bestWeight);
    const median = modelMedian(mean, ensembleOutcome);
    maeEnsemble += Math.abs(x.s.actual - median);
    maeEspnLate += Math.abs(x.s.actual - x.espn * (propMedianRatio[stat] ?? 1));
    if (x.s.actual > median) medianOver++;
    const below = 1 - probabilityOver(x.s.actual, mean, ensembleOutcome);
    const atOrBelow = isCount(stat)
      ? 1 - probabilityOver(x.s.actual - 1, mean, ensembleOutcome)
      : below;
    pitLate[Math.min(9, Math.floor((isCount(stat) ? (below + atOrBelow) / 2 : below) * 10))]++;
  }
  report.stats[stat].ensemble = {
    espnWeight: bestWeight,
    outcome: ensembleOutcome,
    fittedOn: `2026 weeks 1–3 (${early.length})`,
    testedOn: `2026 weeks 4+ (${late.length})`,
    test: late.length
      ? {
          maeEnsembleMedian: r3(maeEnsemble / late.length),
          maeEspnTypical: r3(maeEspnLate / late.length),
          shareOverMedian: r3(medianOver / late.length),
          calibrationDeciles: pitLate.map((c) => Math.round((c / late.length) * 1000) / 1000),
        }
      : undefined,
  };
  console.error(
    stat,
    JSON.stringify(report.stats[stat].holdout.maeVsActual),
    JSON.stringify(report.stats[stat].ensemble.test),
    'w',
    bestWeight,
  );
}
// Production settings: the model's fitted settings and its outcome spread from training. The app
// does not use ESPN; the ensemble numbers above are only a benchmark.
const emitIndex = process.argv.indexOf('--emit');
if (emitIndex > 0) {
  const settings = {};
  for (const stat of propModelStats) {
    const entry = report.stats[stat];
    settings[stat] = { params: entry.params, outcome: entry.outcome };
  }
  writeFileSync(
    process.argv[emitIndex + 1],
    `// Generated by scripts/research/prop-model-backtest.mjs --emit; see docs/decisions.md.\n` +
      `import type { PropModelSettings, PropUsageNorms } from './prop-model.js';\n\n` +
      `export const propModelSettings: PropModelSettings = ${JSON.stringify(settings, null, 2)};\n\n` +
      `export const propUsageNorms: PropUsageNorms = ${JSON.stringify(usageNorms ?? { snapShareByRank: {}, yardsPerAirYard: 0.8 }, null, 2)};\n`,
  );
}
const out = process.argv[2]?.startsWith('--') ? undefined : process.argv[2];
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
else console.log(JSON.stringify(report, null, 2));
