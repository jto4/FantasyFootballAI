import { asList, asObject } from './untrusted.js';
import type { FootballStatKey } from './advice-types.js';
import { americanOdds, nflTeamKey } from './advice-math.js';

/**
 * A published player-prop line. ESPN's public feed carries the line but no price, so `overOdds`
 * and `underOdds` are present only when a priced source (The Odds API) supplied them.
 */
export interface PropLine {
  id: string;
  gameId: string;
  playerName: string;
  team?: string;
  stat: FootballStatKey;
  line: number;
  overOdds?: number;
  underOdds?: number;
  sportsbook: string;
  source: 'espn' | 'odds-api';
  observedAt: string;
}

/** One sportsbook's price for a game market, used to compare books for the same bet. */
export interface BookLine {
  sportsbook: string;
  kind: 'moneyline' | 'spread' | 'total';
  side: 'home' | 'away' | 'over' | 'under';
  line?: number;
  americanOdds: number;
  observedAt: string;
}

// Full-game player totals only. Milestones, scorer markets and partial-game lines have no
// single over/under line the bet model can evaluate.
export const espnPropStats: Readonly<Record<string, FootballStatKey>> = {
  'Total Passing Yards (incl. overtime)': 'passing_yards',
  'Total Pass Completions (incl. overtime)': 'completions',
  'Total Passing Attempts (incl. overtime)': 'attempts',
  'Total Passing Touchdowns (incl. overtime)': 'passing_tds',
  'Total Passing Interceptions (incl. overtime)': 'passing_interceptions',
  'Total Rushing Yards (incl. overtime)': 'rushing_yards',
  'Total Carries (incl. overtime)': 'carries',
  'Total Receiving Yards (incl. overtime)': 'receiving_yards',
  'Total Receptions (incl. overtime)': 'receptions',
};

export const oddsApiPropMarkets: Readonly<Record<string, FootballStatKey>> = {
  player_pass_yds: 'passing_yards',
  player_pass_completions: 'completions',
  player_pass_attempts: 'attempts',
  player_pass_tds: 'passing_tds',
  player_pass_interceptions: 'passing_interceptions',
  player_rush_yds: 'rushing_yards',
  player_rush_attempts: 'carries',
  player_reception_yds: 'receiving_yards',
  player_receptions: 'receptions',
};

const text = (x: unknown, max = 80) =>
  typeof x === 'string' && x.trim() && x.length <= max ? x.trim() : undefined;
const propLine = (x: unknown) =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1000 && Number.isInteger(x * 2)
    ? x
    : undefined;
const price = (x: unknown) =>
  typeof x === 'number' && Number.isInteger(x) && Math.abs(x) >= 100 && Math.abs(x) <= 100_000
    ? x
    : undefined;

export function isPropLine(value: unknown): value is PropLine {
  const v = asObject(value);
  return (
    typeof v.id === 'string' &&
    v.id.length <= 200 &&
    typeof v.gameId === 'string' &&
    text(v.playerName) !== undefined &&
    (v.team === undefined || text(v.team, 8) !== undefined) &&
    Object.values(espnPropStats).includes(v.stat as FootballStatKey) &&
    propLine(v.line) !== undefined &&
    (v.overOdds === undefined || price(v.overOdds) !== undefined) &&
    (v.underOdds === undefined || price(v.underOdds) !== undefined) &&
    text(v.sportsbook) !== undefined &&
    (v.source === 'espn' || v.source === 'odds-api') &&
    typeof v.observedAt === 'string' &&
    Number.isFinite(Date.parse(v.observedAt))
  );
}

/** ESPN athlete ids referenced by a propBets page, read from each item's `$ref`. */
export function espnPropAthleteIds(items: unknown[]): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    const ref = asObject(asObject(item).athlete).$ref;
    const id =
      typeof ref === 'string' ? /\/athletes\/(\d{1,10})(?:\?|$)/.exec(ref)?.[1] : undefined;
    if (id && espnPropStats[String(asObject(asObject(item).type).name)]) ids.add(id);
  }
  return [...ids];
}

/**
 * ESPN lists the over and under of a line as two identical, unpriced rows; they collapse to one.
 * Rows whose athlete name could not be resolved are dropped rather than guessed.
 */
export function parseEspnPropBets(
  items: unknown[],
  names: ReadonlyMap<string, { name: string; team?: string }>,
  context: { gameId: string; sportsbook: string; observedAt: string },
): PropLine[] {
  const seen = new Map<string, PropLine>();
  for (const item of items) {
    const row = asObject(item),
      stat = espnPropStats[String(asObject(row.type).name)],
      line = propLine(asObject(asObject(row.current).target).value),
      ref = asObject(row.athlete).$ref,
      athleteId =
        typeof ref === 'string' ? /\/athletes\/(\d{1,10})(?:\?|$)/.exec(ref)?.[1] : undefined,
      person = athleteId ? names.get(athleteId) : undefined;
    if (!stat || line === undefined || !person) continue;
    const id = `espn:${context.gameId}:${athleteId}:${stat}:${line}`;
    if (seen.has(id)) continue;
    seen.set(id, {
      id,
      gameId: context.gameId,
      playerName: person.name,
      ...(person.team ? { team: person.team } : {}),
      stat,
      line,
      sportsbook: context.sportsbook,
      source: 'espn',
      observedAt: context.observedAt,
    });
  }
  return [...seen.values()];
}

/** Over/under pairs from The Odds API event odds; a line needs both sides at one book to be kept. */
export function parseOddsApiProps(
  value: unknown,
  context: { gameId: string; observedAt: string },
): PropLine[] {
  const lines: PropLine[] = [];
  for (const bookmaker of asList(asObject(value).bookmakers).slice(0, 40)) {
    const book = asObject(bookmaker),
      sportsbook = text(book.title);
    if (!sportsbook) continue;
    for (const market of asList(book.markets).slice(0, 40)) {
      const m = asObject(market),
        stat = oddsApiPropMarkets[String(m.key)];
      if (!stat) continue;
      const pairs = new Map<
        string,
        { player: string; line: number; over?: number; under?: number }
      >();
      for (const outcome of asList(m.outcomes).slice(0, 400)) {
        const o = asObject(outcome),
          player = text(o.description),
          line = propLine(o.point),
          odds = price(o.price),
          side = o.name === 'Over' ? 'over' : o.name === 'Under' ? 'under' : undefined;
        if (!player || line === undefined || odds === undefined || !side) continue;
        const key = `${player}:${line}`;
        const pair = pairs.get(key) ?? { player, line };
        pair[side] = odds;
        pairs.set(key, pair);
      }
      for (const pair of pairs.values())
        if (pair.over !== undefined && pair.under !== undefined)
          lines.push({
            id: `odds-api:${context.gameId}:${sportsbook}:${pair.player}:${stat}:${pair.line}`,
            gameId: context.gameId,
            playerName: pair.player,
            stat,
            line: pair.line,
            overOdds: pair.over,
            underOdds: pair.under,
            sportsbook,
            source: 'odds-api',
            observedAt: context.observedAt,
          });
    }
  }
  return lines;
}

/** Moneyline, spread and total prices per book, with team names mapped to the game's sides. */
export function parseOddsApiLines(
  value: unknown,
  teams: { home: string; away: string; homeName: string; awayName: string },
  observedAt: string,
): BookLine[] {
  const v = asObject(value);
  if (v.home_team !== teams.homeName || v.away_team !== teams.awayName) return [];
  const rows: BookLine[] = [];
  for (const bookmaker of asList(v.bookmakers).slice(0, 40)) {
    const book = asObject(bookmaker),
      sportsbook = text(book.title);
    if (!sportsbook) continue;
    for (const market of asList(book.markets)) {
      const m = asObject(market),
        kind =
          m.key === 'h2h'
            ? 'moneyline'
            : m.key === 'spreads'
              ? 'spread'
              : m.key === 'totals'
                ? 'total'
                : undefined;
      if (!kind) continue;
      for (const outcome of asList(m.outcomes).slice(0, 4)) {
        const o = asObject(outcome),
          odds = price(o.price),
          side =
            kind === 'total'
              ? o.name === 'Over'
                ? 'over'
                : o.name === 'Under'
                  ? 'under'
                  : undefined
              : o.name === teams.homeName
                ? 'home'
                : o.name === teams.awayName
                  ? 'away'
                  : undefined,
          point = typeof o.point === 'number' && Number.isFinite(o.point) ? o.point : undefined;
        if (odds === undefined || !side || (kind !== 'moneyline' && point === undefined)) continue;
        rows.push({
          sportsbook,
          kind,
          side,
          ...(kind === 'moneyline' ? {} : { line: point! }),
          americanOdds: odds,
          observedAt,
        });
      }
    }
  }
  return rows;
}

/** Probability of one side with the bookmaker's margin removed from a two-way price. */
export function noVigProbability(odds: number, oppositeOdds: number): number {
  const a = americanOdds(odds).breakEvenRate,
    b = americanOdds(oppositeOdds).breakEvenRate;
  return a / (a + b);
}

/** American odds that exactly match a probability (no margin). */
export function fairAmericanOdds(probability: number): number {
  if (!(probability > 0 && probability < 1))
    throw new Error('Probability must be between 0 and 1.');
  return probability >= 0.5
    ? -Math.round((probability / (1 - probability)) * 100)
    : Math.round(((1 - probability) / probability) * 100);
}

/**
 * Closing line value in probability points: how much better the price taken was than the
 * no-vig closing price. Positive means the bet beat the close.
 */
export function closingLineValue(
  takenOdds: number,
  closing: { odds: number; oppositeOdds: number },
): number {
  return (
    noVigProbability(closing.odds, closing.oppositeOdds) - americanOdds(takenOdds).breakEvenRate
  );
}

/** Same team abbreviations across feeds, so a book's game can be matched to the schedule. */
export function sameMatchup(
  a: { home: string; away: string },
  b: { home: string; away: string },
): boolean {
  return nflTeamKey(a.home) === nflTeamKey(b.home) && nflTeamKey(a.away) === nflTeamKey(b.away);
}
