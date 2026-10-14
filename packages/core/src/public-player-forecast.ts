import type { LeagueConnection, RosterPlayer } from './domain-types.js';
import type {
  FootballDataSnapshot,
  FootballGame,
  FootballStatKey,
  PublicPlayerForecast,
} from './advice-types.js';
import {
  footballPosition,
  footballRowSourceIds,
  isUpcomingFootballGame,
  nflTeamKey,
  playerNameKey,
  scoreHistoricalGame,
} from './advice-math.js';

export interface PublicFantasyEstimate {
  points: number;
  futurePoints: number;
  recordedPoints: number;
  futureGames: number;
  issuedWeek: number;
  stats: Partial<Record<FootballStatKey, number>>;
  sourceIds: string[];
  forecastSourceIds: string[];
}
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

function forecastName(name: string) {
  const match = name.trim().match(/(?:\s|,)+(jr\.?|sr\.?|ii|iii|iv|v)\.?$/i);
  return {
    key: playerNameKey(match ? name.trim().slice(0, match.index) : name),
    suffix: match?.[1]?.toLowerCase().replace(/\./g, ''),
  };
}
function sameForecastName(first: string, second: string) {
  if (playerNameKey(first) === playerNameKey(second)) return true;
  const a = forecastName(first),
    b = forecastName(second);
  // A publisher can append a suffix absent from a catalog. Different explicit
  // suffixes still identify different people and must never be merged.
  return !!a.key && a.key === b.key && !(a.suffix && b.suffix);
}

/** Score expectations separately from observed history. No aggregate prorating, missing-game
 * zeroes, rookie-cohort forecasts, or retrieval-date claims about publisher update times. */
export function preparePublicPlayerForecast(
  league: LeagueConnection,
  data: FootballDataSnapshot,
  target: { season: number; week: number; asOf: string },
) {
  const instant = Date.parse(target.asOf);
  const freshSources = new Set(
    data.sources
      .filter((source) => {
        const age = instant - Date.parse(source.retrievedAt ?? '');
        return (
          source.status === 'available' && Number.isFinite(age) && age >= 0 && age <= 48 * 3600000
        );
      })
      .map((source) => source.id),
  );
  const byId = new Map<string, PublicPlayerForecast[]>();
  const names = new Map<string, Set<string>>();
  const suffixNames = new Map<string, Set<string>>();
  for (const row of data.playerForecasts ?? []) {
    const values = byId.get(row.espnId) ?? [];
    values.push(row);
    byId.set(row.espnId, values);
    const key = `${playerNameKey(row.name)}:${footballPosition(row.position)}`;
    const ids = names.get(key) ?? new Set<string>();
    ids.add(row.espnId);
    names.set(key, ids);
    const suffixKey = `${forecastName(row.name).key}:${footballPosition(row.position)}`;
    const variants = suffixNames.get(suffixKey) ?? new Set<string>();
    variants.add(row.espnId);
    suffixNames.set(suffixKey, variants);
  }
  const schedules = new Map<string, FootballGame[]>();
  const gameIds = new Map<string, number>();
  for (const game of data.games) {
    gameIds.set(game.id, (gameIds.get(game.id) ?? 0) + 1);
    if (game.season !== target.season || game.seasonType !== 'REG') continue;
    for (const team of new Set([nflTeamKey(game.home), nflTeamKey(game.away)])) {
      const values = schedules.get(team) ?? [];
      values.push(game);
      schedules.set(team, values);
    }
  }
  return (
    player: RosterPlayer,
    scope: 'week' | 'season' | 'remaining-season',
    throughWeek = 18,
  ): PublicFantasyEstimate | undefined => {
    if (
      target.season !== data.season ||
      !Number.isFinite(instant) ||
      !Number.isInteger(target.week) ||
      target.week < 1 ||
      target.week > 18 ||
      !freshSources.has('games') ||
      !player.nflTeam ||
      !Number.isInteger(throughWeek) ||
      throughWeek < target.week ||
      throughWeek > 18
    )
      return;
    const position = footballPosition(player.position),
      team = nflTeamKey(player.nflTeam);
    if (!['QB', 'RB', 'WR', 'TE'].includes(position)) return;
    const exactIds = names.get(`${playerNameKey(player.name)}:${position}`);
    const variantIds = suffixNames.get(`${forecastName(player.name).key}:${position}`);
    const matchingIds = forecastName(player.name).suffix ? (exactIds ?? variantIds) : variantIds;
    // An explicit provider identity must agree; never repair conflicts with name fallback.
    const id = player.espnId ?? (matchingIds?.size === 1 ? [...matchingIds][0] : undefined);
    const all = id ? byId.get(id) : undefined;
    if (
      !all?.length ||
      all.some(
        (row) =>
          !sameForecastName(row.name, player.name) ||
          footballPosition(row.position) !== position ||
          nflTeamKey(row.team) !== team ||
          row.season !== target.season,
      )
    )
      return;
    const schedule = schedules.get(team) ?? [];
    const window = schedule.filter(
      (game) =>
        game.week >= (scope === 'season' ? 1 : target.week) &&
        game.week <= (scope === 'week' ? target.week : throughWeek),
    );
    if (
      !window.length ||
      (scope === 'week'
        ? window.length !== 1
        : schedule.length !== 17 || new Set(schedule.map((game) => game.week)).size !== 17)
    )
      return;
    if (
      (scope === 'week' ? window : schedule).some(
        (game) =>
          gameIds.get(game.id) !== 1 ||
          !Number.isInteger(game.week) ||
          game.week < 1 ||
          game.week > 18 ||
          !validDate(game.date) ||
          nflTeamKey(game.home) === nflTeamKey(game.away),
      )
    )
      return;
    const future: FootballGame[] = [],
      completed: FootballGame[] = [];
    for (const game of window) {
      if (isUpcomingFootballGame(game, target.asOf)) {
        future.push(game);
        continue;
      }
      if (scope === 'week') return;
      const started =
        Number.isFinite(Date.parse(game.kickoffAt ?? '')) && Date.parse(game.kickoffAt!) <= instant;
      if (scope === 'remaining-season' && started) continue;
      if (
        game.date < target.asOf.slice(0, 10) &&
        game.homeScore !== undefined &&
        game.awayScore !== undefined
      ) {
        if (scope === 'season') completed.push(game);
        continue;
      }
      // Unknown timing or incomplete recorded production cannot be valued as zero.
      return;
    }
    if (!future.length) return;
    const forecastSourceIds = new Set<string>(),
      sourceIds = new Set<string>(['games']);
    const stats: Partial<Record<FootballStatKey, number>> = {};
    let futurePoints = 0,
      recordedPoints = 0,
      issuedWeek = 0;
    for (const game of future) {
      const rows = all.filter((row) => row.week === game.week);
      if (rows.length !== 1) return;
      const forecast = rows[0]!;
      if (
        !freshSources.has(forecast.sourceId) ||
        !new RegExp(`^espn-forecasts-${target.season}-(?:0|100|200|300|400)$`).test(
          forecast.sourceId,
        ) ||
        !Number.isInteger(forecast.issuedWeek) ||
        forecast.issuedWeek < 0 ||
        forecast.issuedWeek > game.week
      )
        return;
      const scored = scoreHistoricalGame(league, {
        playerId: id!,
        name: player.name,
        position,
        team,
        opponent: nflTeamKey(game.home) === team ? game.away : game.home,
        gameId: game.id,
        season: target.season,
        week: game.week,
        seasonType: 'REG',
        stats: forecast.stats,
      });
      if (scored.points === undefined || !Number.isFinite(scored.points)) return;
      futurePoints += scored.points;
      issuedWeek = Math.max(issuedWeek, forecast.issuedWeek);
      forecastSourceIds.add(forecast.sourceId);
      sourceIds.add(forecast.sourceId);
      for (const [key, value] of Object.entries(forecast.stats)) {
        if (!Number.isFinite(value)) return;
        const statKey = key as FootballStatKey;
        stats[statKey] = (stats[statKey] ?? 0) + value;
      }
    }
    if (completed.length) {
      const named = data.players.filter(
        (row) =>
          row.season === target.season &&
          row.seasonType === 'REG' &&
          footballPosition(row.position) === position &&
          playerNameKey(row.name) === playerNameKey(player.name),
      );
      const ids = new Set(named.map((row) => row.playerId));
      const gsis = player.gsisId ?? (ids.size === 1 ? [...ids][0] : undefined);
      if (!gsis) return;
      for (const game of completed) {
        const rows = named.filter(
          (row) =>
            row.playerId === gsis &&
            row.gameId === game.id &&
            row.week === game.week &&
            nflTeamKey(row.team) === team &&
            nflTeamKey(row.opponent) ===
              (nflTeamKey(game.home) === team ? nflTeamKey(game.away) : nflTeamKey(game.home)),
        );
        if (rows.length !== 1) return;
        const provenance = footballRowSourceIds(rows[0]!);
        if (!provenance.length || provenance.some((source) => !freshSources.has(source))) return;
        const score = scoreHistoricalGame(league, rows[0]!);
        if (score.points === undefined || !Number.isFinite(score.points)) return;
        recordedPoints += score.points;
        provenance.forEach((source) => sourceIds.add(source));
      }
    }
    return {
      points: futurePoints + recordedPoints,
      futurePoints,
      recordedPoints,
      futureGames: future.length,
      issuedWeek,
      stats,
      sourceIds: [...sourceIds],
      forecastSourceIds: [...forecastSourceIds],
    };
  };
}
