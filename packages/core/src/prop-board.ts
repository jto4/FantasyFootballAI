import { nflTeamKey, playerNameKey } from './advice-math.js';
import type { FootballGame, FootballStatKey, PlayerGameStats } from './advice-types.js';
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
  /** The app's projected average for this stat this week. */
  projection?: number;
  /** The projected typical game: the model's median, where over and under are a coin flip. */
  typicalGame?: number;
  /** Typical game minus line. */
  gap?: number;
  /** This season's completed games, oldest first. */
  recent: number[];
  overGames: number;
  average?: number;
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

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Joins published prop lines with the app's own stat projection and this season's game log. Leans
 * come from the prop model's line-anchored chance; each is tracked and graded so its record, not
 * its confidence, decides whether it deserves attention.
 */
export function buildPropBoard(input: {
  lines: PropLine[];
  games: FootballGame[];
  stats: PlayerGameStats[];
  week: number;
  rosters?: { teamName: string; players: { name: string; nflTeam?: string; espnId?: string }[] }[];
  /** Owner's minimum edge over break-even (a fraction, e.g. 0.03) before a lean is shown. */
  minEdge?: number;
  /** Prop model for one line; undefined when the player lacks history. */
  predict?: (
    line: PropLine,
    game: FootballGame,
    team: string | undefined,
  ) => { mean: number; median: number; overChance: number; sampleGames: number } | undefined;
}): PropBoardRow[] {
  const season = input.games[0]?.season;
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
    // Sportsbook lines rarely name the team, so it comes from whichever of the game's teams the
    // player has a game log with.
    const team = [line.team, game.home, game.away]
      .filter((t): t is string => Boolean(t))
      .map(nflTeamKey)
      .find((t) => logs.has(`${playerNameKey(line.playerName)}:${t}`));
    const log = (team && logs.get(`${playerNameKey(line.playerName)}:${team}`)) || [];
    const recent = [...log]
      .sort((a, b) => a.week - b.week)
      .map((row) => row.stats[line.stat])
      .filter((v): v is number => v !== undefined && Number.isFinite(v));
    const predicted = input.predict?.(line, game, team);
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
        ...(predicted
          ? {
              projection: round(predicted.mean),
              typicalGame: round(predicted.median),
              gap: round(predicted.median - line.line),
            }
          : {}),
        recent,
        overGames: recent.filter((v) => v > line.line).length,
        ...(recent.length
          ? { average: round(recent.reduce((a, b) => a + b, 0) / recent.length) }
          : {}),
        // TD and interception lines are usually priced far from −110, so without a real price
        // there is no honest break-even to beat.
        ...(model &&
        !(
          ['passing_tds', 'passing_interceptions'].includes(line.stat) &&
          (model.side === 'over' ? line.overOdds : line.underOdds) === undefined
        )
          ? model.edge > Math.max(0, input.minEdge ?? 0)
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

/** Lines from the owner's chosen sportsbooks (case-insensitive); all lines when none are chosen. */
export function preferredBookLines<T extends { sportsbook: string }>(
  lines: T[],
  books: string[] | undefined,
): T[] {
  if (!books?.length) return lines;
  const wanted = books.map((book) => book.toLowerCase().replace(/[^a-z0-9]/g, ''));
  return lines.filter((line) => {
    const name = line.sportsbook.toLowerCase().replace(/[^a-z0-9]/g, '');
    return wanted.some((book) => name.includes(book) || book.includes(name));
  });
}
