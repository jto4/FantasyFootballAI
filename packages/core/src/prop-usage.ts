import { footballPosition, nflTeamKey, playerNameKey } from './advice-math.js';
import type { FootballGame, PlayerGameStats } from './advice-types.js';

/** One depth-chart listing: dated snapshots (`at`) or a weekly chart (`season` + `week`). */
export interface DepthEntry {
  pos: 'QB' | 'RB' | 'WR' | 'TE';
  rank: number;
  at?: string;
  season?: number;
  week?: number;
}

/** Skill-position label used by depth charts, or undefined for other positions. */
export function depthPosition(label: string | undefined): DepthEntry['pos'] | undefined {
  if (label === 'QB') return 'QB';
  if (label === 'RB' || label === 'HB') return 'RB';
  if (label === 'WR' || label === 'LWR' || label === 'RWR' || label === 'SWR') return 'WR';
  if (label === 'TE') return 'TE';
  return undefined;
}

/**
 * The player's best depth rank at a position before a game: the latest dated snapshot before
 * kickoff in the game's season, or that week's weekly chart. Undefined when not listed.
 */
export function depthRankAsOf(
  entries: DepthEntry[] | undefined,
  position: string,
  game: FootballGame | undefined,
): number | undefined {
  if (!entries?.length || !game) return undefined;
  const cutoff = game.kickoffAt ?? `${game.date}T23:59:59Z`;
  const pos = footballPosition(position);
  const pick = entries.filter((e) =>
    e.pos === pos && e.at
      ? e.at < cutoff && e.at.slice(0, 4) >= String(game.season)
      : e.pos === pos && e.season === game.season && e.week === game.week,
  );
  if (!pick.length) return undefined;
  const dated = pick.filter((e) => e.at);
  if (dated.length) {
    const latest = dated.reduce((a, b) => (a.at! > b.at! ? a : b)).at;
    return Math.min(...dated.filter((e) => e.at === latest).map((e) => e.rank));
  }
  return Math.min(...pick.map((e) => e.rank));
}

/** Attaches snap shares (keyed by name, team and game) to stat rows as usage. */
export function attachSnapShares(
  rows: PlayerGameStats[],
  snaps: Map<string, number>,
): PlayerGameStats[] {
  if (!snaps.size) return rows;
  return rows.map((row) => {
    const snapShare = snaps.get(snapKey(row.name, row.team, row.gameId));
    return snapShare === undefined ? row : { ...row, usage: { ...row.usage, snapShare } };
  });
}
export const snapKey = (name: string, team: string, gameId: string) =>
  `${playerNameKey(name)}:${nflTeamKey(team)}:${gameId}`;

/** Depth ranks the prop model needs: before this game and before the player's previous game. */
export function propDepth(
  entries: DepthEntry[] | undefined,
  position: string,
  game: FootballGame,
  history: PlayerGameStats[],
  games: Map<string, FootballGame>,
) {
  const order = (g: { season: number; week: number }) => g.season * 100 + g.week;
  const previous = history
    .filter((row) => row.seasonType === 'REG' && order(row) < order(game))
    .sort((a, b) => order(b) - order(a))[0];
  const now = depthRankAsOf(entries, position, game);
  const atLastGame = previous
    ? depthRankAsOf(entries, position, games.get(previous.gameId))
    : undefined;
  return {
    ...(now !== undefined ? { now } : {}),
    ...(atLastGame !== undefined ? { atLastGame } : {}),
  };
}
