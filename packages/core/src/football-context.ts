import type { LeagueConnection, RosterPlayer } from './domain-types.js';
import type {
  AdviceMetric,
  FootballDataSnapshot,
  FootballGame,
  FootballStatKey,
  PlayerAdviceEvidence,
  PlayerGameStats,
} from './advice-types.js';
import {
  historicalPlayerGames,
  footballPosition,
  footballRowSourceIds,
  defensePlayerIdentity,
  nflTeamKey,
  playerNameKey,
  scoreHistoricalGame,
} from './advice-math.js';
import { mean } from './player-evidence.js';

type Target = { season: number; week: number; asOf: string; stat?: FootballStatKey };
type Context = Pick<PlayerAdviceEvidence, 'metrics' | 'warnings' | 'matchup'>;
const production: Record<string, FootballStatKey[]> = {
  QB: ['passing_yards', 'passing_tds'],
  RB: ['rushing_yards', 'receiving_yards'],
  WR: ['receiving_yards', 'receptions'],
  TE: ['receiving_yards', 'receptions'],
  K: ['fg_made', 'pat_made'],
  DST: ['dst_sacks', 'dst_interceptions'],
};
const workload: Record<string, FootballStatKey[]> = {
  QB: ['attempts'],
  RB: ['carries', 'targets'],
  WR: ['targets'],
  TE: ['targets'],
  K: ['fg_att', 'pat_att'],
};

/** Descriptive pregame evidence, not a hidden multiplier on imported projections. */
export function buildFootballContext(
  data: FootballDataSnapshot,
  target: Target,
  players: RosterPlayer[],
  league?: LeagueConnection,
  selectedGame?: FootballGame,
) {
  const day = target.asOf.slice(0, 10);
  const before = (game: FootballGame) =>
    game.seasonType === 'REG' &&
    game.week <= 18 &&
    game.season >= target.season - 1 &&
    (game.season < target.season || (game.season === target.season && game.week < target.week)) &&
    game.date < day &&
    game.homeScore !== undefined &&
    game.awayScore !== undefined;
  const games = data.games.filter(before).sort((a, b) => b.date.localeCompare(a.date));
  const history = historicalPlayerGames(data, target).filter(
    (row) => row.season >= target.season - 1,
  );
  const byName = new Map<string, PlayerGameStats[]>();
  const byTeamGame = new Map<string, PlayerGameStats[]>();
  const byDefensePosition = new Map<string, Map<string, PlayerGameStats[]>>();
  for (const row of history) {
    append(byName, playerNameKey(row.name), row);
    append(byTeamGame, `${nflTeamKey(row.team)}:${row.gameId}`, row);
    const key = `${nflTeamKey(row.opponent)}:${row.position}`;
    const groups = byDefensePosition.get(key) ?? new Map<string, PlayerGameStats[]>();
    append(groups, row.gameId, row);
    byDefensePosition.set(key, groups);
  }
  const gameById = new Map(data.games.map((game) => [game.id, game]));
  const groupCache = new Map<string, PlayerGameStats[][]>();
  const groupsFor = (defense: string, position: string) => {
    const key = `${defense}:${position}`;
    const cached = groupCache.get(key);
    if (cached) return cached;
    const groups = [...(byDefensePosition.get(key)?.values() ?? [])]
      .sort((a, b) =>
        gameById.get(b[0]!.gameId)!.date.localeCompare(gameById.get(a[0]!.gameId)!.date),
      )
      .slice(0, 8);
    groupCache.set(key, groups);
    return groups;
  };
  const referenceCache = new Map<string, { value: number; rows: PlayerGameStats[] }[]>();
  const referenceFor = (position: string, stat: FootballStatKey) => {
    const key = `${position}:${stat}`;
    const cached = referenceCache.get(key);
    if (cached) return cached;
    const samples = [...byDefensePosition.keys()]
      .filter((key) => key.endsWith(`:${position}`))
      .flatMap((key) => groupsFor(key.split(':')[0]!, position))
      .flatMap((rows) => {
        const value = sumStat(rows, stat);
        return value === undefined ? [] : [{ value, rows }];
      });
    referenceCache.set(key, samples);
    return samples;
  };
  const metrics = new Map<string, AdviceMetric>();
  const warnings = new Set<string>();
  const playerContext = new Map<string, Context>();
  const relevantGames = new Map<string, FootballGame>();
  if (
    selectedGame &&
    selectedGame.season === target.season &&
    selectedGame.week === target.week &&
    selectedGame.seasonType === 'REG' &&
    selectedGame.date >= day &&
    selectedGame.homeScore === undefined &&
    selectedGame.awayScore === undefined
  )
    relevantGames.set(selectedGame.id, selectedGame);
  for (const player of players) {
    const team = nflTeamKey(player.nflTeam ?? '');
    const position = footballPosition(player.position);
    const context: Context = { metrics: [], warnings: [] };
    playerContext.set(player.id, context);
    const matches = data.games.filter(
      (game) =>
        game.season === target.season &&
        game.week === target.week &&
        game.seasonType === 'REG' &&
        [game.home, game.away].map(nflTeamKey).includes(team),
    );
    const game = matches.length === 1 ? matches[0] : undefined;
    if (game && game.date >= day && game.homeScore === undefined && game.awayScore === undefined) {
      context.matchup = {
        gameId: game.id,
        opponent: nflTeamKey(nflTeamKey(game.home) === team ? game.away : game.home),
        home: nflTeamKey(game.home) === team,
        date: game.date,
      };
      relevantGames.set(game.id, game);
    } else
      context.warnings.push(
        'No unique upcoming unplayed NFL game was matched; opponent context is unavailable.',
      );
    const named = (
      position === 'DST'
        ? history.filter((r) => r.playerId === defensePlayerIdentity(player))
        : (byName.get(playerNameKey(player.name)) ?? [])
    ).filter((row) => !position || row.position === position);
    const exact = named.filter((row) => row.playerId === (player.gsisId ?? player.id));
    const identities = new Set(named.map((row) => row.playerId));
    const matched = player.gsisId
      ? exact
      : exact.length
        ? exact
        : identities.size === 1
          ? named
          : [];
    if (player.gsisId && named.length && !exact.length)
      context.warnings.push(
        'The supplied GSIS identity conflicts with the named history; player workload statistics were not joined.',
      );
    const counts = new Map<string, number>();
    for (const row of matched) counts.set(row.gameId, (counts.get(row.gameId) ?? 0) + 1);
    const rows = matched
      .filter((row) => counts.get(row.gameId) === 1)
      .sort((a, b) => b.season - a.season || b.week - a.week)
      .slice(0, 12);
    if ([...counts.values()].some((count) => count > 1))
      context.warnings.push(
        'Duplicate player-game records were excluded from player workload comparisons.',
      );
    if (identities.size > 1 && !exact.length)
      context.warnings.push('Ambiguous NFL identity; player workload history was not joined.');
    const currentTeam = rows.filter((row) => nflTeamKey(row.team) === team);
    for (const key of [
      ...new Set([...(production[position] ?? []), ...(target.stat ? [target.stat] : [])]),
    ]) {
      const samples = rows.filter((row) => row.stats[key] !== undefined);
      if (samples.length)
        context.metrics.push(
          make(
            `${player.id}:history-${key}`,
            `Prior played-game ${statLabel(key)} average`,
            mean(samples.map((row) => row.stats[key]!)),
            statUnit(key),
            samples,
            'Up to twelve matched prior appearances, excluding target-week/future games. Prior-team games may be included; missed games are not zeroes.',
          ),
        );
    }
    if (rows.some((row) => nflTeamKey(row.team) !== team))
      context.warnings.push(
        'Recent player history spans teams; workload comparisons use the current NFL team only.',
      );
    for (const key of workload[position] ?? []) {
      const recent = currentTeam.slice(0, 2),
        previous = currentTeam.slice(2, 6);
      if (recent.length >= 2 && recent.every((row) => row.stats[key] !== undefined)) {
        const value = mean(recent.map((row) => row.stats[key]!));
        context.metrics.push(
          make(
            `${player.id}:recent-${key}`,
            `Recent role: ${statLabel(key)} per played game`,
            value,
            statUnit(key),
            recent,
          ),
        );
        if (previous.length >= 2 && previous.every((row) => row.stats[key] !== undefined))
          context.metrics.push(
            make(
              `${player.id}:change-${key}`,
              `Role change: recent versus preceding games (${statLabel(key)})`,
              value - mean(previous.map((row) => row.stats[key]!)),
              statUnit(key),
              [...recent, ...previous],
              'Most recent two current-team appearances versus up to four preceding appearances. Descriptive change, not a role forecast.',
            ),
          );
        if (key === 'targets' || key === 'carries') {
          const groups = recent.map((row) => byTeamGame.get(`${team}:${row.gameId}`) ?? []);
          const sums = groups.map((group) => sumStat(group, key));
          if (sums.every((value) => value !== undefined && value > 0)) {
            const total = sums.reduce<number>((sum, value) => sum + value!, 0);
            context.metrics.push(
              make(
                `${player.id}:recorded-${key}-share`,
                `Share of recorded team ${key} in recent games`,
                (recent.reduce((sum, row) => sum + row.stats[key]!, 0) / total) * 100,
                '%',
                groups.flat(),
                'Share of recorded totals in the same two played games. Missing/unattributed players and missed games are not reconstructed; not snap share or a future role estimate.',
              ),
            );
          } else
            context.warnings.push(
              `Recorded team ${key} totals are incomplete or zero; workload share was not calculated.`,
            );
        }
      }
    }
    if (!context.matchup || !production[position]) continue;
    const defense = context.matchup.opponent;
    const groups = groupsFor(defense, position);
    for (const key of production[position]!) {
      const samples = groups.flatMap((rows) => {
        const value = sumStat(rows, key);
        return value === undefined ? [] : [{ value, rows }];
      });
      if (samples.length < 4) {
        context.warnings.push(
          `Too few complete ${defense} opponent-position games for a ${key} comparison.`,
        );
        continue;
      }
      const value = mean(samples.map((sample) => sample.value));
      context.metrics.push(
        make(
          `${player.id}:opponent-${key}`,
          `${defense} versus ${position}: total ${statLabel(key)} per game`,
          value,
          statUnit(key),
          samples.flatMap((sample) => sample.rows),
          'Totals for all opposing players at this position in up to eight prior games. Not an individual projection or a schedule-adjusted defensive rating.',
          samples.length,
        ),
      );
      const leagueSamples = referenceFor(position, key);
      if (leagueSamples.length >= 16) {
        const average = mean(leagueSamples.map((sample) => sample.value));
        const id = `nfl-position:${position}:${key}`;
        metrics.set(
          id,
          make(
            id,
            `${position}: recorded NFL position ${statLabel(key)} average`,
            average,
            statUnit(key),
            leagueSamples.flatMap((sample) => sample.rows),
            'Comparable recorded position totals per defense/game, up to eight games per defense across current and prior seasons. Sample coverage may differ by defense.',
            leagueSamples.length,
          ),
        );
        if (key === production[position]![0])
          context.metrics.push(
            make(
              `${player.id}:opponent-vs-average`,
              `${defense} versus ${position}: difference from recorded NFL ${statLabel(key)} average`,
              value - average,
              statUnit(key),
              [
                ...samples.flatMap((sample) => sample.rows),
                ...leagueSamples.flatMap((sample) => sample.rows),
              ],
              'Descriptive opponent-position difference, not an adjustment to a player projection.',
              samples.length,
            ),
          );
      } else
        warnings.add(
          'Recorded NFL position comparison pools are too small; no league-average defensive comparison was inferred.',
        );
    }
    if (league) {
      const samples = groups.flatMap((rows) => {
        if (new Set(rows.map((row) => row.playerId)).size !== rows.length) return [];
        const points = rows.map((row) => scoreHistoricalGame(league, row).points);
        return points.every((value) => value !== undefined)
          ? [{ value: points.reduce<number>((sum, value) => sum + value!, 0), rows }]
          : [];
      });
      if (samples.length >= 4)
        context.metrics.push(
          make(
            `${player.id}:opponent-position-points`,
            `${defense} versus ${position}: total league scoring per game`,
            mean(samples.map((sample) => sample.value)),
            'position points/game',
            samples.flatMap((sample) => sample.rows),
            'Combined recorded scoring for all opposing players at this position under supported league rules; includes any credited non-offensive scores. Not this player’s projection.',
            samples.length,
          ),
        );
    }
  }
  for (const game of relevantGames.values()) {
    for (const [field, label, unit] of [
      ['totalLine', 'Public reference total', 'points'],
      ['spreadLine', 'Public reference home-minus-away line', 'points'],
    ] as const)
      if (game[field] !== undefined)
        metrics.set(`nfl-game:${game.id}:${field}`, {
          id: `nfl-game:${game.id}:${field}`,
          label: `${game.away} at ${game.home}: ${label}`,
          value: game[field],
          unit,
          sourceIds: ['games'],
          description:
            'Schedule reference, not current sportsbook odds. Positive home-minus-away line means home favored; it is not the selected team’s handicap.',
        });
    for (const team of [game.home, game.away].map(nflTeamKey)) {
      const sample = games
        .filter((game) => [game.home, game.away].map(nflTeamKey).includes(team))
        .slice(0, 8);
      if (!sample.length) {
        warnings.add(`${team}: no complete prior team score sample is available.`);
        continue;
      }
      const values = sample.map((game) =>
        nflTeamKey(game.home) === team
          ? { scored: game.homeScore!, conceded: game.awayScore! }
          : { scored: game.awayScore!, conceded: game.homeScore! },
      );
      for (const [suffix, label, value, unit] of [
        ['sample', 'Prior team score sample', sample.length, 'games'],
        [
          'points-for',
          'Prior points scored per game',
          mean(values.map((row) => row.scored)),
          'points/game',
        ],
        [
          'points-against',
          'Prior points conceded per game',
          mean(values.map((row) => row.conceded)),
          'points/game',
        ],
        [
          'margin',
          'Prior score margin per game',
          mean(values.map((row) => row.scored - row.conceded)),
          'points/game',
        ],
      ] as const) {
        const id = `nfl-team:${target.season}:${team}:${suffix}`;
        metrics.set(id, {
          id,
          label: `${team}: ${label}`,
          value,
          unit,
          sourceIds: ['games'],
          sampleSize: sample.length,
          description:
            'Up to eight completed prior regular-season games, current and prior seasons. Descriptive scores, not opponent-adjusted strength or a future score forecast.',
        });
      }
    }
  }
  return { players: playerContext, metrics: [...metrics.values()], warnings: [...warnings] };
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const rows = map.get(key) ?? [];
  rows.push(value);
  map.set(key, rows);
}
function sumStat(rows: PlayerGameStats[], key: FootballStatKey): number | undefined {
  if (
    !rows.length ||
    rows.some((row) => row.stats[key] === undefined) ||
    new Set(rows.map((row) => row.playerId)).size !== rows.length
  )
    return undefined;
  return rows.reduce((sum, row) => sum + row.stats[key]!, 0);
}
function make(
  id: string,
  label: string,
  value: number,
  unit: string,
  rows: PlayerGameStats[],
  description?: string,
  sampleSize?: number,
): AdviceMetric {
  return {
    id,
    label,
    value,
    unit,
    sourceIds: [...new Set([...rows.flatMap(footballRowSourceIds), 'games'])],
    sampleSize: sampleSize ?? new Set(rows.map((row) => row.gameId)).size,
    ...(description ? { description } : {}),
  };
}
const statLabel = (key: FootballStatKey) =>
  (
    ({
      fg_made: 'field goals made',
      pat_made: 'extra points made',
      fg_att: 'field-goal attempts',
      pat_att: 'extra-point attempts',
    }) as Partial<Record<FootballStatKey, string>>
  )[key] ?? key.replace(/_tds$/, ' touchdowns').replaceAll('_', ' ');
const statUnit = (key: FootballStatKey) =>
  key.endsWith('_yards')
    ? 'yards/game'
    : key.endsWith('_tds')
      ? 'touchdowns/game'
      : `${statLabel(key)}/game`;
