import { nflTeamKey, playerNameKey } from './advice-math.js';
import type {
  FootballGame,
  FootballStatKey,
  PlayerGameStats,
  PublicPlayerForecast,
} from './advice-types.js';
import type { PropLine } from './prop-lines.js';

export type PropLeanStrength = 'slight' | 'moderate' | 'strong';
export interface PropLean {
  side: 'over' | 'under';
  strength: PropLeanStrength;
  /**
   * With the prop model: its chance for the side minus the break-even rate. Without it: the
   * projection gap divided by the player's usual game-to-game swing.
   */
  score: number;
}
export interface PropBoardRow {
  id: string;
  gameId: string;
  matchup: string;
  kickoffAt?: string;
  playerName: string;
  espnId?: string;
  team?: string;
  stat: FootballStatKey;
  line: number;
  sportsbook: string;
  overOdds?: number;
  underOdds?: number;
  /** ESPN's projection for this stat this week. */
  projection?: number;
  /** ESPN's projection adjusted to a typical game (see propMedianRatio). */
  typicalGame?: number;
  /** Typical game minus line. */
  gap?: number;
  /** This season's completed games, oldest first. */
  recent: number[];
  overGames: number;
  average?: number;
  /** Typical game-to-game spread used to size the lean. */
  spread?: number;
  lean?: PropLean;
  /** Fantasy team in the active league that rosters this player. */
  fantasyTeam?: string;
  /** The prop model's view, when it has enough history for this player and stat. */
  model?: PropRowModel;
}

export interface PropRowModel {
  /** Expected value. */
  mean: number;
  /** The model's coin-flip line. */
  median: number;
  /** Chance of finishing over this line. */
  overChance: number;
  /** Past games behind the estimate. */
  sampleGames: number;
  /** Where the center came from: ESPN alone, a tested ESPN/model blend, or the model alone. */
  source: 'blend' | 'espn' | 'model';
  /** Chance needed to profit at the side's price (−110 when no price is shown). */
  breakEven: number;
  /** Model chance minus break-even for its preferred side; positive means a model pick. */
  edge: number;
  side: 'over' | 'under';
}

/** Break-even win rate for American odds. */
export const breakEvenRate = (odds: number) =>
  odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);

/**
 * Game-to-game spread as a share of the average, measured as the median across 2025 regular-season
 * players with eight or more games. Used as the prior for each player's own spread.
 */
export const propSpreadRatio: Partial<Record<FootballStatKey, number>> = {
  passing_yards: 0.34,
  completions: 0.3,
  attempts: 0.3,
  passing_tds: 0.85,
  passing_interceptions: 1.13,
  rushing_yards: 0.61,
  carries: 0.55,
  receiving_yards: 0.7,
  receptions: 0.57,
};
const priorWeight = 4;

function standardDeviation(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1));
}

/**
 * Typical-game (median) to average ratios measured across 2025 regular-season games for players
 * with five or more games. Yardage and volume stats run below their average in most games, so an
 * average projection compared directly with a line leans over far too often.
 */
export const propMedianRatio: Partial<Record<FootballStatKey, number>> = {
  passing_yards: 1,
  completions: 1,
  attempts: 1,
  rushing_yards: 0.93,
  receiving_yards: 0.87,
  receptions: 0.92,
  carries: 0.92,
  passing_tds: 0.88,
  passing_interceptions: 0.9,
};

/** Lean from the projected typical game versus the line; none when the gap is small. */
export function propLean(
  stat: FootballStatKey,
  line: number,
  projection: number,
  recent: number[],
): { lean?: PropLean; spread: number; median: number } {
  const median = projection * (propMedianRatio[stat] ?? 1);
  const center = Math.max(median, line, stat.endsWith('_yards') ? 10 : 0.5);
  const prior = (propSpreadRatio[stat] ?? 0.6) * center;
  // A player's own spread counts more as games accumulate; four games weigh as much as the prior.
  const spread =
    recent.length >= 3
      ? Math.sqrt(
          (recent.length * standardDeviation(recent) ** 2 + priorWeight * prior ** 2) /
            (recent.length + priorWeight),
        )
      : prior;
  const score = (median - line) / spread;
  const size = Math.abs(score);
  if (size < 0.15) return { spread, median };
  return {
    spread,
    median,
    lean: {
      side: score > 0 ? 'over' : 'under',
      strength: size >= 0.5 ? 'strong' : size >= 0.3 ? 'moderate' : 'slight',
      score: Math.round(score * 100) / 100,
    },
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Joins published prop lines with ESPN's weekly stat projection and this season's game log. The
 * lean is a transparent comparison, not a calibrated probability: it is tracked and graded so its
 * record, not its confidence, decides whether it deserves attention.
 */
export function buildPropBoard(input: {
  lines: PropLine[];
  games: FootballGame[];
  forecasts: PublicPlayerForecast[];
  stats: PlayerGameStats[];
  week: number;
  rosters?: { teamName: string; players: { name: string; nflTeam?: string; espnId?: string }[] }[];
  /** Prop model for one line; undefined when the player lacks history. */
  predict?: (
    line: PropLine,
    game: FootballGame,
    team: string | undefined,
    espnProjection: number | undefined,
  ) =>
    | {
        mean: number;
        median: number;
        overChance: number;
        sampleGames: number;
        source: 'blend' | 'espn' | 'model';
      }
    | undefined;
}): PropBoardRow[] {
  const season = input.games[0]?.season;
  const forecastById = new Map(
    input.forecasts.filter((f) => f.week === input.week).map((f) => [f.espnId, f]),
  );
  const logs = new Map<string, PlayerGameStats[]>();
  for (const row of input.stats) {
    if (row.season !== season || row.week >= input.week || row.seasonType !== 'REG') continue;
    const key = `${playerNameKey(row.name)}:${nflTeamKey(row.team)}`;
    logs.set(key, [...(logs.get(key) ?? []), row]);
  }
  const owners = new Map<string, string>();
  for (const roster of input.rosters ?? [])
    for (const player of roster.players) {
      if (player.espnId) owners.set(`id:${player.espnId}`, roster.teamName);
      owners.set(`name:${playerNameKey(player.name)}`, roster.teamName);
    }
  return input.lines.flatMap((line) => {
    const game = input.games.find((g) => g.id === line.gameId);
    if (!game) return [];
    const espnId = /^espn:[^:]+:(\d{1,12}):/.exec(line.id)?.[1];
    const forecast = espnId ? forecastById.get(espnId) : undefined;
    const team =
      (forecast?.team && nflTeamKey(forecast.team)) ||
      (line.team ? nflTeamKey(line.team) : undefined);
    const log =
      (team && logs.get(`${playerNameKey(line.playerName)}:${team}`)) ||
      [game.home, game.away]
        .map((t) => logs.get(`${playerNameKey(line.playerName)}:${nflTeamKey(t)}`))
        .find(Boolean) ||
      [];
    const recent = [...log]
      .sort((a, b) => a.week - b.week)
      .map((row) => row.stats[line.stat])
      .filter((v): v is number => v !== undefined && Number.isFinite(v));
    const projection = forecast?.stats[line.stat];
    const lean =
      projection !== undefined ? propLean(line.stat, line.line, projection, recent) : undefined;
    const predicted = input.predict?.(line, game, team, projection);
    let model: PropRowModel | undefined;
    if (predicted) {
      const side = predicted.overChance >= 0.5 ? 'over' : 'under';
      const odds = side === 'over' ? line.overOdds : line.underOdds;
      const breakEven = breakEvenRate(odds ?? -110);
      const chance = side === 'over' ? predicted.overChance : 1 - predicted.overChance;
      model = {
        mean: round(predicted.mean),
        median: round(predicted.median),
        overChance: Math.round(predicted.overChance * 1000) / 1000,
        sampleGames: predicted.sampleGames,
        source: predicted.source,
        breakEven: Math.round(breakEven * 1000) / 1000,
        edge: Math.round((chance - breakEven) * 1000) / 1000,
        side,
      };
    }
    const fantasyTeam =
      (espnId && owners.get(`id:${espnId}`)) ||
      owners.get(`name:${playerNameKey(line.playerName)}`);
    return [
      {
        id: line.id,
        gameId: line.gameId,
        matchup: `${game.away} at ${game.home}`,
        ...(game.kickoffAt ? { kickoffAt: game.kickoffAt } : {}),
        playerName: line.playerName,
        ...(espnId ? { espnId } : {}),
        ...(team ? { team } : {}),
        stat: line.stat,
        line: line.line,
        sportsbook: line.sportsbook,
        ...(line.overOdds !== undefined ? { overOdds: line.overOdds } : {}),
        ...(line.underOdds !== undefined ? { underOdds: line.underOdds } : {}),
        ...(projection !== undefined && lean
          ? {
              projection: round(projection),
              typicalGame: round(lean.median),
              gap: round(lean.median - line.line),
            }
          : {}),
        recent,
        overGames: recent.filter((v) => v > line.line).length,
        ...(recent.length
          ? { average: round(recent.reduce((a, b) => a + b, 0) / recent.length) }
          : {}),
        ...(lean ? { spread: round(lean.spread) } : {}),
        // TD and interception lines are usually priced far from −110, so without a real price
        // there is no honest break-even to beat.
        ...(model &&
        !(
          ['passing_tds', 'passing_interceptions'].includes(line.stat) &&
          (model.side === 'over' ? line.overOdds : line.underOdds) === undefined
        )
          ? model.edge > 0
            ? {
                lean: {
                  side: model.side,
                  strength:
                    model.edge >= 0.06 ? 'strong' : model.edge >= 0.03 ? 'moderate' : 'slight',
                  score: model.edge,
                } satisfies PropLean,
              }
            : {}
          : {}),
        ...(fantasyTeam ? { fantasyTeam } : {}),
        ...(model ? { model } : {}),
      } satisfies PropBoardRow,
    ];
  });
}

export interface PropLeanRecord {
  key: string;
  gameId: string;
  kickoffAt?: string;
  playerName: string;
  team?: string;
  stat: FootballStatKey;
  line: number;
  side: 'over' | 'under';
  strength: PropLeanStrength;
  projection: number;
  /** The model's chance of the over at the saved line, when the model priced it. */
  overChance?: number;
  /** The model's expected value, kept so the market weight can be refit from results. */
  modelMean?: number;
  observedAt: string;
  result?: { actual: number; outcome: 'win' | 'loss' | 'push'; gradedAt: string };
}

/** Grades a saved lean once that game's stats exist; a player with no stat line stays ungraded. */
export function gradePropLean(
  record: PropLeanRecord,
  stats: PlayerGameStats[],
  now: string,
): PropLeanRecord['result'] | undefined {
  if (record.result) return record.result;
  const row = stats.find(
    (s) =>
      s.gameId === record.gameId &&
      playerNameKey(s.name) === playerNameKey(record.playerName) &&
      (!record.team || nflTeamKey(s.team) === record.team),
  );
  const actual = row?.stats[record.stat];
  if (actual === undefined || !Number.isFinite(actual)) return undefined;
  const outcome =
    actual === record.line
      ? 'push'
      : actual > record.line === (record.side === 'over')
        ? 'win'
        : 'loss';
  return { actual, outcome, gradedAt: now };
}

/** Win-loss record by strength, against the 52.4% needed to profit at −110. */
export function summarizePropLeans(records: PropLeanRecord[]) {
  const tally = (rows: PropLeanRecord[]) => {
    const wins = rows.filter((r) => r.result?.outcome === 'win').length;
    const losses = rows.filter((r) => r.result?.outcome === 'loss').length;
    const pushes = rows.filter((r) => r.result?.outcome === 'push').length;
    return {
      wins,
      losses,
      pushes,
      ...(wins + losses ? { winRate: Math.round((wins / (wins + losses)) * 1000) / 1000 } : {}),
    };
  };
  // Only leans the prop model priced count; earlier gap-based leans used a different method.
  records = records.filter((r) => r.overChance !== undefined);
  const graded = records.filter((r) => r.result);
  // Brier score of the model's over chance on decided props; 0.25 is a coin flip.
  const priced = graded.filter((r) => r.overChance !== undefined && r.result!.outcome !== 'push');
  const brier = priced.length
    ? priced.reduce((sum, r) => {
        const over = (r.result!.outcome === 'win') === (r.side === 'over') ? 1 : 0;
        return sum + (r.overChance! - over) ** 2;
      }, 0) / priced.length
    : undefined;
  return {
    pending: records.length - graded.length,
    ...(brier !== undefined
      ? { brier: Math.round(brier * 1000) / 1000, pricedGames: priced.length }
      : {}),
    breakEven: 0.524,
    overall: tally(graded),
    byStrength: Object.fromEntries(
      (['strong', 'moderate', 'slight'] as const).map((s) => [
        s,
        tally(graded.filter((r) => r.strength === s)),
      ]),
    ) as Record<PropLeanStrength, ReturnType<typeof tally>>,
  };
}
