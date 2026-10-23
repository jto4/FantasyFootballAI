import {
  attachSnapShares,
  buildPropModelLeague,
  nflTeamKey,
  playerNameKey,
  predictProp,
  propDepth,
  propModelSettings,
  propModelStats,
  propUsageNorms,
  type FootballDataSnapshot,
  type FootballGame,
  type PlayerGameStats,
  type PropModelStat,
} from '@sidekick/core';
import type { UsageSnapshot } from '@sidekick/integrations';

type Built = ReturnType<typeof build>;
const cache = new WeakMap<FootballDataSnapshot, { usage?: UsageSnapshot; built: Built }>();

/**
 * The prop model over one loaded data snapshot: snap shares attached to every game row, player
 * histories by name and team, and depth ranks before each game. Shared by the props board and bet
 * analysis so both price a prop the same way. Built once per data and usage snapshot.
 */
export function propModelFor(data: FootballDataSnapshot, usage?: UsageSnapshot): Built {
  const hit = cache.get(data);
  if (hit && hit.usage === usage) return hit.built;
  const built = build(data, usage);
  cache.set(data, { ...(usage ? { usage } : {}), built });
  return built;
}

function build(data: FootballDataSnapshot, usage?: UsageSnapshot) {
  const rows = attachSnapShares(
    data.players.filter((r) => r.seasonType === 'REG'),
    usage?.snaps ?? new Map(),
  );
  const byId = new Map<string, PlayerGameStats[]>();
  const byName = new Map<string, Set<string>>();
  for (const row of rows) {
    byId.set(row.playerId, [...(byId.get(row.playerId) ?? []), row]);
    const key = playerNameKey(row.name);
    byName.set(key, (byName.get(key) ?? new Set()).add(row.playerId));
  }
  const league = buildPropModelLeague(rows, data.games);
  /** Same name on one of this game's teams; the most recent row decides position and team. */
  const findPlayer = (name: string, team: string | undefined, game: FootballGame) => {
    const teams = [team, game.home, game.away].filter(Boolean).map((t) => nflTeamKey(t!));
    const candidates = [...(byName.get(playerNameKey(name)) ?? [])]
      .map((id) => {
        const history = byId.get(id)!;
        return {
          id,
          history,
          latest: [...history].sort((a, b) => b.season - a.season || b.week - a.week)[0]!,
        };
      })
      .filter((c) => teams.includes(nflTeamKey(c.latest.team)));
    if (candidates.length !== 1) return undefined;
    const { id, history, latest } = candidates[0]!;
    return { id, history, position: latest.position, team: latest.team };
  };
  const predict = (input: {
    stat: string;
    playerName: string;
    team: string | undefined;
    game: FootballGame;
    line: number;
    marketWeight?: number;
  }) => {
    if (!(propModelStats as readonly string[]).includes(input.stat)) return undefined;
    const player = findPlayer(input.playerName, input.team, input.game);
    if (!player) return undefined;
    const depth = propDepth(
      usage?.depth.get(player.id),
      player.position,
      input.game,
      player.history,
      league.games,
    );
    return predictProp(
      {
        stat: input.stat as PropModelStat,
        position: player.position,
        team: player.team,
        game: input.game,
        history: player.history,
        line: input.line,
        depth,
        ...(input.marketWeight !== undefined ? { marketWeight: input.marketWeight } : {}),
      },
      league,
      propModelSettings[input.stat as PropModelStat],
      propUsageNorms,
    );
  };
  return { league, findPlayer, predict };
}
