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
  return scored.points === undefined
    ? undefined
    : {
        points: Math.round(scored.points * 100) / 100,
        stats: projected.stats,
        sampleGames: projected.sampleGames,
        vacatedCarryShare: vacated,
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
): { points: number; sampleGames: number } | undefined {
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
  return { points: Math.round(points * 100) / 100, sampleGames: past.length };
}
