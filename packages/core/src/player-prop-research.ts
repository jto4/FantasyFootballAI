import {
  footballStatKeys,
  type FootballStatKey,
  type PlayerGameStats,
  type FootballGame,
  type FootballDataSnapshot,
} from './advice-types.js';
import type { RosterPlayer } from './domain-types.js';
import { playerNameKey, footballPosition, nflTeamKey } from './advice-math.js';
const obj = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, max = 500): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= max && !/[\u0000-\u001f\u007f]/.test(x);
const time = (x: unknown): x is string =>
  str(x, 40) && /(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x));
const num = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const https = (x: unknown) => {
  try {
    const u = new URL(String(x));
    return str(x, 2000) && u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
};
export interface PropGameLog {
  playerId: string;
  name: string;
  stat: FootballStatKey;
  asOf: string;
  rows: { gameId: string; season: number; week: number; opponent: string; value: number }[];
  sources: string[];
}
/** Complete earlier games only, exact stable player identity, missing never becomes zero. */
export function buildPropGameLog(
  playerId: string,
  name: string,
  stat: FootballStatKey,
  players: PlayerGameStats[],
  games: FootballGame[],
  asOf: string,
): PropGameLog {
  const seen = new Set<string>();
  const rows = players
    .filter(
      (p) =>
        p.playerId === playerId &&
        playerNameKey(p.name) === playerNameKey(name) &&
        p.seasonType === 'REG',
    )
    .flatMap((p) => {
      const matching = games.filter(
        (g) =>
          g.id === p.gameId && g.season === p.season && g.week === p.week && g.seasonType === 'REG',
      );
      const g = matching.length === 1 ? matching[0] : undefined;
      const value = p.stats[stat];
      if (
        !g?.kickoffAt ||
        Date.parse(g.kickoffAt) + 86400000 > Date.parse(asOf) ||
        !Number.isFinite(g.homeScore) ||
        !Number.isFinite(g.awayScore) ||
        ![g.home, g.away].map(nflTeamKey).includes(nflTeamKey(p.team)) ||
        nflTeamKey(p.opponent) !==
          (nflTeamKey(p.team) === nflTeamKey(g.home) ? nflTeamKey(g.away) : nflTeamKey(g.home)) ||
        !Number.isFinite(value) ||
        seen.has(p.gameId)
      )
        return [];
      // Duplicate player/game rows are ambiguous rather than extra observations.
      if (players.filter((r) => r.playerId === playerId && r.gameId === p.gameId).length !== 1)
        return [];
      seen.add(p.gameId);
      return [
        { gameId: p.gameId, season: p.season, week: p.week, opponent: p.opponent, value: value! },
      ];
    })
    .sort((a, b) => b.season - a.season || b.week - a.week)
    .slice(0, 12)
    .reverse();
  return {
    playerId,
    name,
    stat,
    asOf,
    rows,
    sources: [
      ...new Set(
        rows.map(
          (r) =>
            `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${r.season}.csv`,
        ),
      ),
    ],
  };
}
export function isPropGameLog(x: unknown): x is PropGameLog {
  return (
    obj(x) &&
    str(x.playerId, 256) &&
    str(x.name, 200) &&
    footballStatKeys.includes(x.stat as FootballStatKey) &&
    time(x.asOf) &&
    Array.isArray(x.rows) &&
    x.rows.length <= 12 &&
    x.rows.every(
      (r) =>
        obj(r) &&
        str(r.gameId, 80) &&
        num(r.season, 2010, 2099) &&
        num(r.week, 1, 18) &&
        str(r.opponent, 5) &&
        num(r.value, -100, 1000),
    ) &&
    Array.isArray(x.sources) &&
    x.sources.length <= 3 &&
    x.sources.every(https)
  );
}

/** Exact IDs take precedence. Missing catalog IDs may join only a unique name/position
 * identity with matching current-season team; conflicting IDs never fall back to names. */
export function propHistoryIdentityResolver(data: FootballDataSnapshot) {
  const byName = new Map<string, { ids: Set<string>; teams: Set<string> }>();
  for (const row of data.players) {
    if (row.seasonType !== 'REG') continue;
    const key = playerNameKey(row.name) + ':' + footballPosition(row.position);
    const entry = byName.get(key) ?? { ids: new Set<string>(), teams: new Set<string>() };
    entry.ids.add(row.playerId);
    if (row.season === data.season) entry.teams.add(nflTeamKey(row.team));
    byName.set(key, entry);
  }
  return (player: RosterPlayer): string | undefined => {
    if (player.gsisId) return player.gsisId;
    const entry = byName.get(playerNameKey(player.name) + ':' + footballPosition(player.position));
    return entry?.ids.size === 1 && entry.teams.has(nflTeamKey(player.nflTeam ?? ''))
      ? [...entry.ids][0]
      : undefined;
  };
}
