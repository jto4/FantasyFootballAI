import { footballPosition, nflTeamKey } from './advice-math.js';
import type { FootballGame, FootballStatKey, PlayerGameStats } from './advice-types.js';

export const propModelStats = [
  'passing_yards',
  'completions',
  'attempts',
  'passing_tds',
  'passing_interceptions',
  'rushing_yards',
  'carries',
  'receiving_yards',
  'receptions',
] as const satisfies readonly FootballStatKey[];
export type PropModelStat = (typeof propModelStats)[number];

/** Tunable settings for one stat; fitted offline (scripts/research/prop-model-backtest.mjs). */
export interface PropModelParams {
  /** Games until a past game counts half as much. */
  halfLife: number;
  /** Extra weight multiplier for games from earlier seasons. */
  priorSeasonWeight: number;
  /** Pseudo-games pulling a thin history toward the position average. */
  shrinkGames: number;
  /** Exponent on implied team points ÷ league average. */
  envExponent: number;
  /** Log multiplier per 10 points the player's team is favored by. */
  scriptCoefficient: number;
  /** Exponent on the opponent's allowed amount ÷ league average. */
  opponentExponent: number;
  /** Pseudo-games pulling the opponent factor toward average. */
  opponentShrinkGames: number;
  /** Multiplier for home games. */
  homeFactor: number;
}

export const defaultPropModelParams: PropModelParams = {
  halfLife: 6,
  priorSeasonWeight: 0.6,
  shrinkGames: 2,
  envExponent: 0,
  scriptCoefficient: 0,
  opponentExponent: 0,
  opponentShrinkGames: 6,
  homeFactor: 1,
};

/** League context built once from completed games: team scoring and what defenses allow. */
export interface PropModelLeague {
  /** gameId → team → position → stat totals for players of that position on that team. */
  produced: Map<string, Map<string, Map<string, Partial<Record<PropModelStat, number>>>>>;
  /** Average per team-game for each position and stat. */
  averageAllowed: Map<string, Partial<Record<PropModelStat, number>>>;
  /** Average points a team scores per game. */
  averageTeamPoints: number;
  games: Map<string, FootballGame>;
  /** Team → its regular-season games, newest first. */
  teamGames: Map<string, FootballGame[]>;
}

const order = (g?: FootballGame) => (g ? g.season * 100 + g.week : 0);

/** Aggregates what each team's players produced by position, for opponent adjustments. */
export function buildPropModelLeague(
  rows: PlayerGameStats[],
  games: FootballGame[],
): PropModelLeague {
  const produced: PropModelLeague['produced'] = new Map();
  for (const row of rows) {
    if (row.seasonType !== 'REG') continue;
    const position = footballPosition(row.position);
    const team = nflTeamKey(row.team);
    const byTeam = produced.get(row.gameId) ?? new Map();
    produced.set(row.gameId, byTeam);
    const byPosition = byTeam.get(team) ?? new Map();
    byTeam.set(team, byPosition);
    const totals = byPosition.get(position) ?? {};
    byPosition.set(position, totals);
    for (const stat of propModelStats) {
      const value = row.stats[stat];
      if (value !== undefined && Number.isFinite(value)) totals[stat] = (totals[stat] ?? 0) + value;
    }
  }
  const sums = new Map<string, { n: number; totals: Partial<Record<PropModelStat, number>> }>();
  for (const byTeam of produced.values())
    for (const byPosition of byTeam.values())
      for (const [position, totals] of byPosition) {
        const entry = sums.get(position) ?? { n: 0, totals: {} };
        entry.n++;
        for (const stat of propModelStats)
          entry.totals[stat] = (entry.totals[stat] ?? 0) + (totals[stat] ?? 0);
        sums.set(position, entry);
      }
  const averageAllowed: PropModelLeague['averageAllowed'] = new Map(
    [...sums].map(([position, { n, totals }]) => [
      position,
      Object.fromEntries(propModelStats.map((s) => [s, (totals[s] ?? 0) / n])),
    ]),
  );
  const scored = games.filter(
    (g) => g.seasonType === 'REG' && g.homeScore !== undefined && g.awayScore !== undefined,
  );
  const averageTeamPoints = scored.length
    ? scored.reduce((sum, g) => sum + g.homeScore! + g.awayScore!, 0) / (2 * scored.length)
    : 22;
  const teamGames: PropModelLeague['teamGames'] = new Map();
  for (const g of games.filter((g) => g.seasonType === 'REG'))
    for (const team of [nflTeamKey(g.home), nflTeamKey(g.away)])
      teamGames.set(team, [...(teamGames.get(team) ?? []), g]);
  for (const list of teamGames.values()) list.sort((a, b) => order(b) - order(a));
  return {
    produced,
    averageAllowed,
    averageTeamPoints,
    games: new Map(games.map((g) => [g.id, g])),
    teamGames,
  };
}

export interface PropModelInput {
  stat: PropModelStat;
  position: string;
  team: string;
  /** The game being predicted; only data from before it is used. */
  game: FootballGame;
  /** The player's games (any order); later or same-game rows are ignored. */
  history: PlayerGameStats[];
}

export interface PropModelPrediction {
  mean: number;
  /** Recency-weighted, shrunk average before game adjustments. */
  base: number;
  /** Effective number of past games behind the base. */
  sampleGames: number;
  factors: { environment: number; script: number; opponent: number; home: number };
}

/**
 * Expected value of one stat for one player in one game, from data available before kickoff:
 * the player's recency-weighted history, the betting market's implied team total and spread,
 * what the opponent has allowed to that position, and home field.
 */
export function predictPropMean(
  input: PropModelInput,
  league: PropModelLeague,
  params: PropModelParams = defaultPropModelParams,
): PropModelPrediction | undefined {
  const position = footballPosition(input.position);
  const team = nflTeamKey(input.team);
  const cutoff = order(input.game);
  const past = input.history
    .filter((row) => row.seasonType === 'REG')
    .map((row) => ({ row, at: order(league.games.get(row.gameId)) || row.season * 100 + row.week }))
    .filter((p) => p.at < cutoff && p.row.stats[input.stat] !== undefined)
    .sort((a, b) => b.at - a.at);
  if (!past.length) return undefined;
  let weight = 0,
    total = 0;
  past.forEach(({ row }, gamesAgo) => {
    const w =
      0.5 ** (gamesAgo / params.halfLife) *
      (row.season < input.game.season ? params.priorSeasonWeight : 1);
    weight += w;
    total += w * row.stats[input.stat]!;
  });
  // Thin histories borrow from the player's own earlier level rather than a league average,
  // because props are only posted for players with real roles.
  const allSeasons = past.reduce((s, p) => s + p.row.stats[input.stat]!, 0) / past.length;
  const base = (total + params.shrinkGames * allSeasons) / (weight + params.shrinkGames);

  const home = nflTeamKey(input.game.home) === team;
  const spread = input.game.spreadLine;
  const totalLine = input.game.totalLine;
  // nflverse spread_line is positive when the home team is favored.
  const favoredBy = spread === undefined ? 0 : home ? spread : -spread;
  const implied = totalLine === undefined ? undefined : (totalLine + favoredBy) / 2;
  const environment =
    implied === undefined || implied <= 0
      ? 1
      : (implied / league.averageTeamPoints) ** params.envExponent;
  const script = Math.exp((params.scriptCoefficient * favoredBy) / 10);

  const opponent = nflTeamKey(home ? input.game.away : input.game.home);
  let allowed = 0,
    allowedWeight = 0;
  const average = league.averageAllowed.get(position)?.[input.stat] ?? 0;
  if (average > 0 && params.opponentExponent) {
    const opponentPast = (league.teamGames.get(opponent) ?? []).filter((g) => order(g) < cutoff);
    opponentPast.forEach((g, gamesAgo) => {
      const against = nflTeamKey(g.home) === opponent ? nflTeamKey(g.away) : nflTeamKey(g.home);
      const value = league.produced.get(g.id)?.get(against)?.get(position)?.[input.stat];
      if (value === undefined) return;
      const w =
        0.5 ** (gamesAgo / 8) * (g.season < input.game.season ? params.priorSeasonWeight : 1);
      allowed += w * value;
      allowedWeight += w;
    });
  }
  const opponentRatio =
    allowedWeight && average > 0
      ? (allowed + params.opponentShrinkGames * average) /
        (allowedWeight + params.opponentShrinkGames) /
        average
      : 1;
  const opponentFactor = opponentRatio ** params.opponentExponent;
  const homeFactor = home ? params.homeFactor : 1 / params.homeFactor;
  return {
    mean: Math.max(0, base * environment * script * opponentFactor * homeFactor),
    base,
    sampleGames: past.length,
    factors: {
      environment,
      script,
      opponent: opponentFactor,
      home: homeFactor,
    },
  };
}

/**
 * Outcome spread around the predicted mean, fitted offline per stat. Counts use a negative
 * binomial with the given size; yardage uses the empirical distribution of actual ÷ predicted.
 */
export type PropOutcomeModel =
  { kind: 'count'; size: number } | { kind: 'ratio'; quantiles: number[] };

/** Fitted settings per stat: model settings, ESPN blend weight and outcome spreads. */
export type PropModelSettings = Record<
  PropModelStat,
  {
    params: PropModelParams;
    /** Share of the center taken from ESPN's projection when one exists. */
    espnWeight: number;
    /** Spread around the blended center. */
    outcome: PropOutcomeModel;
    /** Spread around the model alone, for players without an ESPN projection. */
    modelOnlyOutcome: PropOutcomeModel;
  }
>;

function logGamma(x: number): number {
  // Lanczos approximation.
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** P(X ≤ k) for a negative binomial with mean m and size r. */
function negativeBinomialCdf(k: number, mean: number, size: number) {
  if (k < 0) return 0;
  const p = size / (size + mean);
  let sum = 0;
  for (let x = 0; x <= Math.floor(k); x++)
    sum += Math.exp(
      logGamma(x + size) -
        logGamma(size) -
        logGamma(x + 1) +
        size * Math.log(p) +
        x * Math.log(1 - p),
    );
  return Math.min(1, sum);
}

/** Probability the stat finishes above the line (a push on whole-number lines counts as not over). */
export function probabilityOver(line: number, mean: number, outcome: PropOutcomeModel) {
  if (mean <= 0) return 0;
  if (outcome.kind === 'count')
    return 1 - negativeBinomialCdf(Math.floor(line), mean, outcome.size);
  const ratio = line / mean;
  const q = outcome.quantiles;
  // Quantiles are evenly spaced probabilities from 0 to 1 of actual ÷ predicted.
  if (ratio <= q[0]!) return 1;
  if (ratio >= q[q.length - 1]!) return 0;
  for (let i = 1; i < q.length; i++)
    if (ratio <= q[i]!) {
      const lo = q[i - 1]!,
        hi = q[i]!;
      const fraction = hi > lo ? (ratio - lo) / (hi - lo) : 0;
      return 1 - (i - 1 + fraction) / (q.length - 1);
    }
  return 0;
}

/** The line at which the model sees a coin flip (its median). */
export function modelMedian(mean: number, outcome: PropOutcomeModel) {
  if (outcome.kind === 'ratio') {
    const q = outcome.quantiles;
    return mean * q[Math.floor((q.length - 1) / 2)]!;
  }
  for (let k = 0; k < 200; k++) if (negativeBinomialCdf(k, mean, outcome.size) >= 0.5) return k;
  return mean;
}

/**
 * Full prediction for a prop: the center blends the model with ESPN's projection by the tested
 * weight for that stat, and the fitted outcome spread turns it into a chance of going over.
 */
export function predictProp(
  input: PropModelInput & { line: number; espnProjection?: number; marketWeight?: number },
  league: PropModelLeague,
  settings: PropModelSettings[PropModelStat],
):
  | {
      mean: number;
      median: number;
      overChance: number;
      sampleGames: number;
      source: 'blend' | 'espn' | 'model';
    }
  | undefined {
  const model = predictPropMean(input, league, settings.params);
  // Outside the fitted population (a backup's history, a quarterback's scramble yards) there is
  // no model view at all.
  if (!model || model.sampleGames < 3 || !propModelEligible(input.stat, input.position, model.base))
    return undefined;
  const espn = input.espnProjection;
  let mean: number, outcome: PropOutcomeModel, source: 'blend' | 'espn' | 'model';
  if (espn !== undefined && settings.espnWeight > 0) {
    const weight = settings.espnWeight;
    mean = weight * espn + (1 - weight) * model.mean;
    outcome = settings.outcome;
    source = weight === 1 ? 'espn' : 'blend';
  } else {
    mean = model.mean;
    outcome = settings.modelOnlyOutcome;
    source = 'model';
  }
  return {
    mean,
    median: modelMedian(mean, outcome),
    overChance: anchoredOverChance(
      input.line,
      mean,
      outcome,
      input.marketWeight ?? defaultMarketWeight,
    ),
    sampleGames: model.sampleGames,
    source,
  };
}

/** Players and stats like those the model was fitted on; anything else gets no model view. */
export function propModelEligible(stat: PropModelStat, position: string, base: number) {
  const pos = footballPosition(position);
  switch (stat) {
    case 'passing_yards':
      return pos === 'QB' && base >= 150;
    case 'completions':
      return pos === 'QB' && base >= 14;
    case 'attempts':
      return pos === 'QB' && base >= 22;
    case 'passing_tds':
      return pos === 'QB' && base >= 0.8;
    case 'passing_interceptions':
      return pos === 'QB' && base >= 0.4;
    case 'rushing_yards':
      return ['QB', 'RB', 'WR'].includes(pos) && base >= 20;
    case 'carries':
      return ['QB', 'RB'].includes(pos) && base >= 6;
    case 'receiving_yards':
      return ['RB', 'WR', 'TE'].includes(pos) && base >= 20;
    case 'receptions':
      return ['RB', 'WR', 'TE'].includes(pos) && base >= 2;
  }
}

/**
 * Starting share of the model's disagreement with the line that it is allowed to claim. Books price information this model lacks (role changes, injuries, coaching), so the
 * line is the anchor until graded results support a different weight.
 */
export const defaultMarketWeight = 0.25;

/**
 * Chance of the over when the line is treated as the market's coin flip and the model may move
 * only `modelWeight` of the way from 50% toward its own chance.
 */
export function anchoredOverChance(
  line: number,
  mean: number,
  outcome: PropOutcomeModel,
  modelWeight: number,
) {
  return 0.5 + modelWeight * (probabilityOver(line, mean, outcome) - 0.5);
}

/**
 * Refits the model's weight against the line from graded props by log loss. Returns undefined
 * until there are enough decided props to trust it.
 */
export function fitMarketWeight(
  graded: { line: number; mean: number; stat: PropModelStat; over: boolean }[],
  settings: PropModelSettings,
  minimum = 150,
) {
  if (graded.length < minimum) return undefined;
  let best: { weight: number; logLoss: number } | undefined;
  for (let weight = 0; weight <= 1.0001; weight += 0.05) {
    let logLoss = 0;
    for (const g of graded) {
      const p = anchoredOverChance(g.line, g.mean, settings[g.stat].outcome, weight);
      const q = Math.min(0.99, Math.max(0.01, p));
      logLoss -= Math.log(g.over ? q : 1 - q);
    }
    logLoss /= graded.length;
    if (!best || logLoss < best.logLoss) best = { weight: Math.round(weight * 100) / 100, logLoss };
  }
  return best;
}
