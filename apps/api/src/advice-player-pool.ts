import {
  footballPosition,
  nflTeamKey,
  playerNameKey,
  propHistoryIdentityResolver,
  type FootballDataSnapshot,
  type LeagueConnection,
  type RosterPlayer,
} from '@sidekick/core';

export function playerPool(
  league: LeagueConnection | undefined,
  data: FootballDataSnapshot,
  catalog: Map<string, RosterPlayer>,
  betting: boolean,
): RosterPlayer[] {
  const pool = new Map<string, RosterPlayer>();
  const resolvePropIdentity = betting ? propHistoryIdentityResolver(data) : undefined;
  const roster = betting ? [] : (league?.teams.flatMap((team) => team.roster ?? []) ?? []);
  for (const [sleeperId, player] of catalog) {
    if (
      !player.nflTeam ||
      !['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST'].includes(player.position ?? '')
    )
      continue;
    const propIdentity = resolvePropIdentity?.(player);
    const platformId = betting
      ? propIdentity
      : league?.platform === 'sleeper'
        ? sleeperId
        : league?.platform === 'espn'
          ? player.espnId
          : player.yahooId;
    const id = platformId ?? (player.gsisId ? `nfl:${player.gsisId}` : `sleeper:${sleeperId}`);
    pool.set(id, {
      ...player,
      ...(propIdentity ? { gsisId: propIdentity } : {}),
      id,
      sleeperId,
      ...(player.injuryStatus ? { status: player.injuryStatus } : {}),
    });
  }
  for (const player of roster) {
    const matches = [...pool.values()].filter((item) =>
      footballPosition(player.position) === 'DST' && player.nflTeam
        ? footballPosition(item.position) === 'DST' &&
          nflTeamKey(item.nflTeam ?? '') === nflTeamKey(player.nflTeam)
        : playerNameKey(item.name) === playerNameKey(player.name) &&
          (!player.position ||
            footballPosition(item.position) === footballPosition(player.position)),
    );
    const direct = pool.get(player.id);
    const matched =
      direct && matches.includes(direct) ? direct : matches.length === 1 ? matches[0] : undefined;
    if (matched && matched.id !== player.id) pool.delete(matched.id);
    pool.set(player.id, {
      ...matched,
      ...player,
      ...(matched?.sleeperId ? { sleeperId: matched.sleeperId } : {}),
      ...(matched?.injuryStatus ? { status: matched.injuryStatus } : {}),
    });
  }
  if (!catalog.size) {
    for (const row of data.players.filter((row) => row.season === data.season)) {
      if (
        ![...pool.values()].some((player) =>
          footballPosition(row.position) === 'DST'
            ? footballPosition(player.position) === 'DST' &&
              nflTeamKey(player.nflTeam ?? '') === nflTeamKey(row.team)
            : playerNameKey(player.name) === playerNameKey(row.name),
        )
      )
        pool.set(row.playerId, {
          id: row.playerId,
          name: row.name,
          position: row.position,
          nflTeam: row.team,
          ...(footballPosition(row.position) !== 'DST' ? { gsisId: row.playerId } : {}),
        });
    }
  }
  return [...pool.values()].slice(0, 2_000);
}
