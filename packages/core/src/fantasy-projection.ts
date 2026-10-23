import { footballPosition, nflTeamKey, scoreHistoricalGame } from './advice-math.js';
import type { FootballGame, FootballStatKey, PlayerGameStats } from './advice-types.js';
import type { LeagueConnection } from './domain-types.js';
import {
  buildPropModelLeague,
  defaultPropModelParams,
  fantasyExtraStats,
  predictPropMean,
  propModelStats,
  type PropModelInput,
  type PropModelLeague,
  type PropModelSettings,
  type PropUsageNorms,
} from './prop-model.js';
import { attachSnapShares, propDepth, type DepthEntry } from './prop-usage.js';

export interface UsageInput {
  snaps: Map<string, number>;
  depth: Map<string, DepthEntry[]>;
  /** `season:week:playerId` for players listed Out or Doubtful on that week's injury report. */
  ruledOut?: Set<string>;
  /** Forecast wind at kickoff by game ID (outdoor venues only; issued about 48 hours ahead). */
  windKph?: Map<string, number>;
}

/** Offense loses `windCoefficient` of its projection per 10 km/h of wind above the threshold. */
export interface WeatherParams {
  windThresholdKph: number;
  /** Negative: the share lost per 10 km/h; 0 turns the adjustment off. */
  windCoefficient: number;
}

/** Multiplier for an offensive projection (QB, RB, WR, TE, K) from the game's forecast wind. */
export function windFactor(
  context: ProjectionContext,
  game: FootballGame,
  weather: WeatherParams | undefined,
): number {
  const wind = context.windKph.get(game.id);
  if (!weather?.windCoefficient || wind === undefined) return 1;
  const excess = Math.max(0, wind - weather.windThresholdKph) / 10;
  // Bounded so an extreme forecast cannot erase a projection.
  return Math.max(0.5, 1 + weather.windCoefficient * excess);
}

/** Keys for players listed Out or Doubtful, from nflverse injury report rows. */
export function ruledOutKeys(
  rows: {
    gsisId?: string;
    season: number;
    week: number;
    seasonType?: string;
    reportStatus: string;
  }[],
): Set<string> {
  const keys = new Set<string>();
  for (const row of rows)
    if (
      row.gsisId &&
      row.seasonType !== 'POST' &&
      /^(out|doubtful)$/i.test(row.reportStatus.trim())
    )
      keys.add(`${row.season}:${row.week}:${row.gsisId}`);
  return keys;
}

/** Settings for kicker and D/ST projections, fitted offline like the stat models. */
export interface SpecialTeamsParams {
  /** Games until a past game counts half as much. */
  halfLife: number;
  /** Kickers: exponent on the team's implied points ÷ league average. */
  kickerEnvExponent: number;
  /** D/ST: points added per point the opponent's implied total is below average. */
  defenseOpponentCoefficient: number;
}

type ScoringLeague = Pick<LeagueConnection, 'platform' | 'scoring' | 'positionScoring'>;

const contexts = new WeakMap<object, { usage?: UsageInput; value: ProjectionContext }>();
export interface ProjectionContext {
  league: PropModelLeague;
  /** Regular-season rows by nflverse player ID, with snap shares attached when available. */
  byPlayer: Map<string, PlayerGameStats[]>;
  /** Regular-season rows by `gameId:team`. */
  byTeamGame: Map<string, PlayerGameStats[]>;
  depth: Map<string, DepthEntry[]>;
  ruledOut: Set<string>;
  windKph: Map<string, number>;
}

/** The model league and player histories for one data snapshot, built once and reused. */
export function projectionContext(
  data: { players: PlayerGameStats[]; games: FootballGame[] },
  usage?: UsageInput,
): ProjectionContext {
  const hit = contexts.get(data);
  if (hit && hit.usage === usage) return hit.value;
  const rows = attachSnapShares(
    data.players.filter((r) => r.seasonType === 'REG'),
    usage?.snaps ?? new Map(),
  );
  const byPlayer = new Map<string, PlayerGameStats[]>();
  const byTeamGame = new Map<string, PlayerGameStats[]>();
  for (const row of rows) {
    byPlayer.set(row.playerId, [...(byPlayer.get(row.playerId) ?? []), row]);
    const key = `${row.gameId}:${nflTeamKey(row.team)}`;
    byTeamGame.set(key, [...(byTeamGame.get(key) ?? []), row]);
  }
  const value = {
    league: buildPropModelLeague(rows, data.games),
    byPlayer,
    byTeamGame,
    depth: usage?.depth ?? new Map(),
    ruledOut: usage?.ruledOut ?? new Set<string>(),
    windKph: usage?.windKph ?? new Map<string, number>(),
  };
  contexts.set(data, { ...(usage ? { usage } : {}), value });
  return value;
}

/** The game a team plays in a given week, or undefined on a bye. */
export function teamGame(games: FootballGame[], season: number, week: number, team: string) {
  const key = nflTeamKey(team);
  return games.find(
    (g) =>
      g.season === season &&
      g.week === week &&
      g.seasonType === 'REG' &&
      (nflTeamKey(g.home) === key || nflTeamKey(g.away) === key),
  );
}

/**
 * Share of the team's running-back carries over its last three games (same season) that belonged
 * to other running backs now ruled Out or Doubtful. A back who already missed those games has no
 * share, because the remaining backs' recent stats already reflect his absence.
 */
export function vacatedCarryShare(
  context: ProjectionContext,
  playerId: string,
  team: string,
  game: FootballGame,
): number {
  if (!context.ruledOut.size) return 0;
  const key = nflTeamKey(team);
  const order = (g: FootballGame) => g.season * 100 + g.week;
  const recent = [...context.league.games.values()]
    .filter(
      (g) =>
        g.season === game.season &&
        g.seasonType === 'REG' &&
        order(g) < order(game) &&
        (nflTeamKey(g.home) === key || nflTeamKey(g.away) === key),
    )
    .sort((a, b) => order(b) - order(a))
    .slice(0, 3);
  let total = 0,
    vacated = 0;
  for (const g of recent)
    for (const row of context.byTeamGame.get(`${g.id}:${key}`) ?? []) {
      if (footballPosition(row.position) !== 'RB') continue;
      const carries = row.stats.carries ?? 0;
      total += carries;
      if (
        row.playerId !== playerId &&
        context.ruledOut.has(`${game.season}:${game.week}:${row.playerId}`)
      )
        vacated += carries;
    }
  // Capped so a whole backfield being out cannot multiply a projection without bound.
  return total ? Math.min(0.6, vacated / total) : 0;
}

const rushingStats = [
  'carries',
  'rushing_yards',
  'rushing_tds',
  'rushing_2pt_conversions',
  'rushing_fumbles_lost',
] as const;

/**
 * Expected value of every fantasy-scoring stat for one player in one game, from the fitted stat
 * models (and default settings for rare events). Needs three prior games.
 */
export function projectPlayerStats(
  input: Omit<PropModelInput, 'stat'>,
  context: ProjectionContext,
  settings: PropModelSettings,
  norms?: PropUsageNorms,
): { stats: Partial<Record<FootballStatKey, number>>; sampleGames: number } | undefined {
  const stats: Partial<Record<FootballStatKey, number>> = {};
  let sampleGames = 0;
  for (const stat of propModelStats) {
    const prediction = predictPropMean(
      { ...input, stat },
      context.league,
      { ...defaultPropModelParams, ...settings[stat].params },
      norms,
    );
    stats[stat] = prediction?.mean ?? 0;
    sampleGames = Math.max(sampleGames, prediction?.sampleGames ?? 0);
  }
  if (sampleGames < 3) return undefined;
  for (const stat of fantasyExtraStats)
    stats[stat] =
      predictPropMean({ ...input, stat }, context.league, defaultPropModelParams)?.mean ?? 0;
  return { stats, sampleGames };
}

/**
 * Projected fantasy points for a QB, RB, WR or TE under the league's own scoring: each projected
 * stat times its weight. Undefined when the scoring uses rules the stat model cannot price.
 */
export function projectFantasyPoints(
  scoring: ScoringLeague,
  input: Omit<PropModelInput, 'stat'> & { playerId: string },
  context: ProjectionContext,
  settings: PropModelSettings,
  norms?: PropUsageNorms,
  /** Running backs: exponent on 1 / (1 − vacated carry share); 0 turns the adjustment off. */
  vacatedCarryExponent = 0,
  weather?: WeatherParams,
) {
  const position = footballPosition(input.position);
  if (!['QB', 'RB', 'WR', 'TE'].includes(position)) return undefined;
  const depth = propDepth(
    context.depth.get(input.playerId),
    position,
    input.game,
    input.history,
    context.league.games,
  );
  const projected = projectPlayerStats({ ...input, depth }, context, settings, norms);
  if (!projected) return undefined;
  const vacated =
    position === 'RB' && vacatedCarryExponent
      ? vacatedCarryShare(context, input.playerId, input.team, input.game)
      : 0;
  if (vacated > 0) {
    const factor = (1 / (1 - vacated)) ** vacatedCarryExponent;
    for (const stat of rushingStats) {
      const value = projected.stats[stat];
      if (value !== undefined) projected.stats[stat] = value * factor;
    }
  }
  // Stats the model does not project (first downs, bonuses) leave scoring unsupported, not zero.
  const scored = scoreHistoricalGame(scoring, {
    playerId: input.playerId,
    name: '',
    position,
    team: input.team,
    opponent: '',
    gameId: input.game.id,
    season: input.game.season,
    week: input.game.week,
    seasonType: 'REG',
    stats: projected.stats,
  });
  // Wind scales the scored total rather than each stat, matching how it was fitted.
  const wind = windFactor(context, input.game, weather);
  return scored.points === undefined
    ? undefined
    : {
        points: Math.round(scored.points * wind * 100) / 100,
        stats: projected.stats,
        sampleGames: projected.sampleGames,
        vacatedCarryShare: vacated,
        windFactor: wind,
      };
}

/**
 * Kicker and D/ST projection from their own scored history: a recency-weighted average, then the
 * betting market's view of the game (a kicker's team total; the opponent's total for a defense).
 */
export function projectSpecialTeamsPoints(
  position: string,
  team: string,
  game: FootballGame,
  history: { gameId: string; points: number }[],
  context: ProjectionContext,
  params: SpecialTeamsParams,
  weather?: WeatherParams,
): { points: number; sampleGames: number; windFactor: number } | undefined {
  const pos = footballPosition(position);
  if (pos !== 'K' && pos !== 'DST') return undefined;
  const order = (g?: FootballGame) => (g ? g.season * 100 + g.week : 0);
  const past = history
    .map((h) => ({ ...h, at: order(context.league.games.get(h.gameId)) }))
    .filter((h) => h.at && h.at < order(game))
    .sort((a, b) => b.at - a.at);
  if (past.length < 3) return undefined;
  let total = 0,
    weight = 0;
  past.forEach((h, gamesAgo) => {
    const w = 0.5 ** (gamesAgo / params.halfLife);
    total += w * h.points;
    weight += w;
  });
  let points = total / weight;
  const home = nflTeamKey(game.home) === nflTeamKey(team);
  if (game.totalLine !== undefined && game.spreadLine !== undefined) {
    const favoredBy = home ? game.spreadLine : -game.spreadLine;
    const own = (game.totalLine + favoredBy) / 2;
    const opponent = (game.totalLine - favoredBy) / 2;
    const average = context.league.averageTeamPoints;
    if (pos === 'K' && own > 0) points *= (own / average) ** params.kickerEnvExponent;
    if (pos === 'DST') points += params.defenseOpponentCoefficient * (average - opponent);
  }
  // Defenses showed no wind effect in the backtest; kickers lose like the offense.
  const wind = pos === 'K' ? windFactor(context, game, weather) : 1;
  return {
    points: Math.round(points * wind * 100) / 100,
    sampleGames: past.length,
    windFactor: wind,
  };
}

/** How far a position's results land from its projection, fitted offline (see settings). */
export interface OutcomeSpread {
  /** Error standard deviation = sdIntercept + sdSlope × projected points (at least 1). */
  sdIntercept: number;
  sdSlope: number;
  /** 10th and 90th percentiles of the error in standard deviations; results skew high. */
  low: number;
  high: number;
}

/**
 * A likely range for one player's week: the 10th to 90th percentile of past results around
 * projections like this one. Skill players are floored at zero; D/ST can score below it.
 */
export function projectionRange(
  position: string,
  points: number,
  spreads: Partial<Record<string, OutcomeSpread>>,
): { low: number; high: number; sd: number } | undefined {
  const pos = footballPosition(position);
  const spread = spreads[pos];
  if (!spread || !Number.isFinite(points)) return undefined;
  const sd = Math.max(1, spread.sdIntercept + spread.sdSlope * points);
  const round = (x: number) => Math.round(x * 10) / 10;
  const low = points + spread.low * sd;
  return {
    low: round(pos === 'DST' ? low : Math.max(0, low)),
    high: round(points + spread.high * sd),
    sd,
  };
}

/**
 * Chance one side outscores the other, treating each remaining starter's result as independent
 * with the fitted spread (summed variance scaled up for correlation) and settled points as fixed.
 * Undefined when a remaining starter has no estimate or no fitted spread.
 */
export function matchupWinProbability(
  sides: [
    { settled: number; remaining: { position: string; estimate?: number }[] },
    { settled: number; remaining: { position: string; estimate?: number }[] },
  ],
  spreads: Partial<Record<string, OutcomeSpread>>,
  varianceScale: number,
): number | undefined {
  let mean = 0,
    variance = 0;
  for (const [index, side] of sides.entries()) {
    const sign = index === 0 ? 1 : -1;
    mean += sign * side.settled;
    for (const starter of side.remaining) {
      if (starter.estimate === undefined) return undefined;
      const range = projectionRange(starter.position, starter.estimate, spreads);
      if (!range) return undefined;
      mean += sign * starter.estimate;
      variance += range.sd ** 2;
    }
  }
  if (variance === 0) return mean > 0 ? 1 : mean < 0 ? 0 : 0.5;
  const z = mean / Math.sqrt(varianceScale * variance);
  return Math.round(normalCdf(z) * 1000) / 1000;
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, error below 1e-7). */
function normalCdf(z: number) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}
