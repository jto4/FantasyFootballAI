import { defenseScoreValue } from './defense-scoring.js';
import type { LeagueConnection } from './domain-types.js';
import { weeklyGameWithheldWarning } from './advice-warnings.js';
import { isInactiveFootballStatus } from './player-availability.js';
import {
  espnKickingRules,
  kickingScoreValue,
  sleeperKickingRules,
  yahooKickingRules,
} from './kicking-scoring.js';
import type {
  AdviceConfidence,
  BetEvidence,
  BetTerms,
  FootballDataSnapshot,
  FootballGame,
  LineupEstimate,
  PlayerAdviceEvidence,
  PlayerGameStats,
  FootballStatKey,
} from './advice-types.js';

const offensiveScoring: Record<string, FootballStatKey | 'fumblesLost'> = {
  pass_yd: 'passing_yards',
  pass_td: 'passing_tds',
  pass_int: 'passing_interceptions',
  pass_2pt: 'passing_2pt_conversions',
  pass_fd: 'passing_first_downs',
  rush_yd: 'rushing_yards',
  rush_td: 'rushing_tds',
  rush_2pt: 'rushing_2pt_conversions',
  rush_fd: 'rushing_first_downs',
  rec: 'receptions',
  rec_yd: 'receiving_yards',
  rec_td: 'receiving_tds',
  rec_2pt: 'receiving_2pt_conversions',
  rec_fd: 'receiving_first_downs',
  fum_lost: 'fumblesLost',
};
const yahooScoring: Record<string, FootballStatKey | 'fumblesLost'> = {
  'Passing Yards': 'passing_yards',
  'Pass Yds': 'passing_yards',
  'Passing Touchdowns': 'passing_tds',
  'Pass TD': 'passing_tds',
  'Rushing Yards': 'rushing_yards',
  'Rush Yds': 'rushing_yards',
  'Rushing Touchdowns': 'rushing_tds',
  'Rush TD': 'rushing_tds',
  Receptions: 'receptions',
  Rec: 'receptions',
  'Receiving Yards': 'receiving_yards',
  'Rec Yds': 'receiving_yards',
  'Receiving Touchdowns': 'receiving_tds',
  'Rec TD': 'receiving_tds',
  'Fumbles Lost': 'fumblesLost',
  'Fum Lost': 'fumblesLost',
};
// ESPN league scoring uses numeric stat IDs (the same IDs as ESPN's projection feed).
const espnScoring: Record<string, FootballStatKey | 'fumblesLost'> = {
  '3': 'passing_yards',
  '4': 'passing_tds',
  '19': 'passing_2pt_conversions',
  '20': 'passing_interceptions',
  '24': 'rushing_yards',
  '25': 'rushing_tds',
  '26': 'rushing_2pt_conversions',
  '42': 'receiving_yards',
  '43': 'receiving_tds',
  '44': 'receiving_2pt_conversions',
  '53': 'receptions',
  '72': 'fumblesLost',
};
// ESPN return, defensive and conversion-return scores (fumble-recovery TD, blocked-kick TD,
// kick/punt/interception/fumble return TDs, two-point and one-point returns). Neither public
// projections nor box-score inputs model them, so player estimates leave them out, as with
// team-defense rules. Kicking and team-defense IDs are handled by their own scorers.
const espnNonOffense = new Set(['63', '93', '101', '102', '103', '104', '206', '209']);
// Team-defense and kicking rules do not contribute to QB/RB/WR/TE player scores.
const sleeperNonOffense = new Set([
  ...sleeperKickingRules,
  'sack',
  'int',
  'fum_rec',
  'def_td',
  'safe',
  'blk_kick',
  'def_st_td',
  'def_st_fum_rec',
  'def_st_ff',
  'ff',
  'tkl_loss',
  'tkl',
  'tkl_solo',
  'tkl_ast',
  'qb_hit',
  'pass_def',
  'xpm',
  'xpmiss',
  'fgm',
  'fgmiss',
  'fgm_0_19',
  'fgm_20_29',
  'fgm_30_39',
  'fgm_40_49',
  'fgm_50p',
  'fgm_60p',
  'fgmiss_0_19',
  'fgmiss_20_29',
  'fgmiss_30_39',
  'fgmiss_40_49',
  'fgmiss_50p',
  'pts_allow_0',
  'pts_allow_1_6',
  'pts_allow_7_13',
  'pts_allow_14_20',
  'pts_allow_21_27',
  'pts_allow_28_34',
  'pts_allow_35p',
  'yds_allow_0_99',
  'yds_allow_100_199',
  'yds_allow_200_299',
  'yds_allow_300_349',
  'yds_allow_350_399',
  'yds_allow_400_449',
  'yds_allow_450_499',
  'yds_allow_500_549',
  'yds_allow_550p',
]);
const yahooNonOffense = new Set([
  ...yahooKickingRules,
  'Sack',
  'Sacks',
  'Defensive Interceptions',
  'Fumble Recoveries',
  'Safety',
  'Block Kick',
  'Points Allowed',
  'Field Goals 0-19 Yards',
  'Field Goals 20-29 Yards',
  'Field Goals 30-39 Yards',
  'Field Goals 40-49 Yards',
  'Field Goals 50+ Yards',
  'Point After Attempt Made',
]);

/** Refuse incomplete or unfamiliar scoring instead of substituting standard/PPR points. */
export function scoreHistoricalGame(
  league: Pick<LeagueConnection, 'platform' | 'scoring' | 'positionScoring'>,
  row: PlayerGameStats,
): { points?: number; unsupported: string[]; missing: string[] } {
  const unsupported: string[] = [],
    missing: string[] = [];
  let points = 0,
    rules = 0;
  if (!['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF'].includes(row.position))
    return { unsupported: [row.position], missing };
  const mapping =
    league.platform === 'sleeper'
      ? offensiveScoring
      : league.platform === 'yahoo'
        ? yahooScoring
        : league.platform === 'espn'
          ? espnScoring
          : {};
  const position = footballPosition(row.position);
  // Position overrides replace the base value for that stat only; other base rules still apply.
  const scoring = {
    ...league.scoring,
    ...(position === 'DST' || position === 'K' ? league.positionScoring?.[position] : undefined),
  };
  if (league.platform === 'espn' && position === 'DST') row = espnDefenseRow(row, scoring);
  for (const [key, weight] of Object.entries(scoring)) {
    if (!Number.isFinite(weight)) {
      unsupported.push(key);
      continue;
    }
    if (weight === 0) continue;
    if (footballPosition(row.position) === 'DST') {
      const defense = defenseScoreValue(league.platform, key, row);
      if (defense) {
        rules++;
        missing.push(...defense.missing);
        points += defense.value * weight;
      } else if (!(
        (league.platform === 'sleeper' &&
          (Object.hasOwn(offensiveScoring, key) ||
            sleeperKickingRules.has(key) ||
            ['st_td', 'st_fum_rec', 'st_ff', 'st_tkl_solo'].includes(key))) ||
        (league.platform === 'espn' &&
          (Object.hasOwn(espnScoring, key) || espnKickingRules.has(key) || espnNonOffense.has(key)))
      )) {
        unsupported.push(key);
      }
      continue;
    }
    const kicking = row.position === 'K' ? kickingScoreValue(league.platform, key, row) : undefined;
    if (kicking) {
      rules++;
      missing.push(...kicking.missing);
      points += kicking.value * weight;
      continue;
    }
    if (
      (league.platform === 'sleeper' && sleeperNonOffense.has(key)) ||
      (league.platform === 'yahoo' && yahooNonOffense.has(key)) ||
      (league.platform === 'espn' && espnNonOffense.has(key))
    )
      continue;
    const stat = Object.hasOwn(mapping, key) ? mapping[key] : undefined;
    if (!stat) {
      unsupported.push(key);
      continue;
    }
    rules++;
    const fields: FootballStatKey[] =
      stat === 'fumblesLost'
        ? ['rushing_fumbles_lost', 'receiving_fumbles_lost', 'sack_fumbles_lost']
        : [stat];
    for (const field of fields) {
      const value = row.stats[field];
      if (value === undefined || !Number.isFinite(value)) missing.push(field);
      else points += value * weight;
    }
  }
  if (!rules)
    unsupported.push(
      ['K', 'DST', 'DEF'].includes(row.position)
        ? 'No supported player scoring rules'
        : 'No supported offensive scoring rules',
    );
  return {
    ...(!unsupported.length && !missing.length ? { points } : {}),
    unsupported: [...new Set(unsupported)],
    missing: [...new Set(missing)],
  };
}

/**
 * Comparable form of a player name. Generational suffixes are dropped because sources disagree
 * on them ("Aaron Jones Sr." in leagues, "Aaron Jones" in NFL stats); callers still check team,
 * position and uniqueness before joining.
 */
export function playerNameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[,.]?\s+(jr|sr|ii|iii|iv|v)\.?\s*$/, '')
    .replace(/[^a-z0-9]/g, '');
}

export function footballPosition(position: string | undefined): string {
  const key = position?.toUpperCase() ?? '';
  return key === 'DEF' ? 'DST' : key;
}
export function footballRowSourceIds(row: PlayerGameStats): string[] {
  return row.sourceIds === undefined ? [`stats-${row.season}`] : row.sourceIds;
}
/** Defense identities belong to a team, never a same-named individual or a GSIS ID. */
export function defensePlayerIdentity(player: {
  position?: string;
  nflTeam?: string;
  id: string;
  sleeperId?: string;
}): string | undefined {
  if (footballPosition(player.position) !== 'DST' || !player.nflTeam) return;
  const team = nflTeamKey(player.nflTeam);
  const teams = new Set(
    'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LA LAC LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(
      ' ',
    ),
  );
  if (!teams.has(team)) return;
  for (const id of [player.id, player.sleeperId]) {
    if (id && teams.has(nflTeamKey(id)) && nflTeamKey(id) !== team) return;
  }
  return `dst:${team}`;
}

export function nflTeamKey(team: string): string {
  const normalized = team.trim().toUpperCase();
  return (
    ({ LAR: 'LA', JAC: 'JAX', WSH: 'WAS', LVR: 'LV' } as Record<string, string>)[normalized] ??
    normalized
  );
}

/** A scoreless feed row is not proof that a same-day game is still upcoming. */
export function isUpcomingFootballGame(game: FootballGame, asOf: string): boolean {
  const instant = Date.parse(asOf);
  if (
    !Number.isFinite(instant) ||
    game.seasonType !== 'REG' ||
    !Number.isInteger(game.week) ||
    game.week < 1 ||
    game.week > 18 ||
    game.homeScore !== undefined ||
    game.awayScore !== undefined
  )
    return false;
  if (game.kickoffAt !== undefined) {
    const kickoff = Date.parse(game.kickoffAt);
    return (
      /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(game.kickoffAt) &&
      Number.isFinite(kickoff) &&
      kickoff > instant
    );
  }
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(game.date) &&
    Number.isFinite(Date.parse(game.date)) &&
    new Date(game.date).toISOString().slice(0, 10) === game.date &&
    game.date > asOf.slice(0, 10)
  );
}

/** Only completed games strictly before the target week/day can enter a historical sample. */
export function historicalPlayerGames(
  snapshot: FootballDataSnapshot,
  target: { season: number; week: number; asOf: string },
): PlayerGameStats[] {
  const day = target.asOf.slice(0, 10);
  const games = new Map(
    snapshot.games.filter((game) => completedBefore(game, day)).map((game) => [game.id, game]),
  );
  return snapshot.players.filter((row) => {
    const game = games.get(row.gameId);
    return (
      game &&
      game.season === row.season &&
      game.week === row.week &&
      game.seasonType === 'REG' &&
      game.week <= 18 &&
      ((nflTeamKey(game.home) === nflTeamKey(row.team) &&
        nflTeamKey(game.away) === nflTeamKey(row.opponent)) ||
        (nflTeamKey(game.away) === nflTeamKey(row.team) &&
          nflTeamKey(game.home) === nflTeamKey(row.opponent))) &&
      (row.season < target.season || (row.season === target.season && row.week < target.week)) &&
      row.seasonType === 'REG'
    );
  });
}

const flexibleSlots: Record<string, string[]> = {
  FLEX: ['RB', 'WR', 'TE'],
  FLX: ['RB', 'WR', 'TE'],
  WRT: ['RB', 'WR', 'TE'],
  RECFLEX: ['WR', 'TE'],
  WRRBFLEX: ['RB', 'WR'],
  SUPERFLEX: ['QB', 'RB', 'WR', 'TE'],
  OP: ['QB', 'RB', 'WR', 'TE'],
  WRTQB: ['QB', 'RB', 'WR', 'TE'],
  QBRBWRTE: ['QB', 'RB', 'WR', 'TE'],
};
const reserveSlots = new Set([
  'BN',
  'BE',
  'BENCH',
  'IR',
  'IR+',
  'NA',
  'RES',
  'SUSP',
  'TAXI',
  'PUP',
  'NFI',
]);
export function starterSlots(input: unknown): {
  slots: { label: string; positions: string[] }[];
  warnings: string[];
} {
  if (!Array.isArray(input) || !input.length || input.length > 100)
    return {
      slots: [],
      warnings: ['Starting positions are missing. Refresh the league to calculate a legal lineup.'],
    };
  const slots: { label: string; positions: string[] }[] = [],
    warnings: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') {
      warnings.push('Unrecognized starting position.');
      continue;
    }
    const label = raw
      .trim()
      .toUpperCase()
      .replace(/[\s/_-]/g, '');
    if (reserveSlots.has(label)) continue;
    const positions =
      flexibleSlots[label] ??
      (['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF'].includes(label)
        ? [label === 'DEF' ? 'DST' : label]
        : undefined);
    if (positions) slots.push({ label, positions });
    else warnings.push(`Unsupported starting position: ${raw.slice(0, 40)}.`);
  }
  if (slots.length > 12 || !slots.length)
    warnings.push('Lineup calculations require 1–12 supported starting slots.');
  return { slots, warnings };
}

/**
 * Assign each player once; global matching avoids putting a needed TE in FLEX greedily. `locked`
 * players (starters whose games have begun) must keep a starting spot; their remaining value is
 * unknown, so they count as 0 and only the other slots are optimized around them.
 */
export function optimizeLineup(
  roster: PlayerAdviceEvidence[],
  rawSlots: unknown,
  locked: ReadonlySet<string> = new Set(),
  /** What to maximize per player (a lineup strategy); totals still report projected points. */
  value?: (player: PlayerAdviceEvidence) => number,
): LineupEstimate {
  const { slots, warnings } = starterSlots(rawSlots);
  if (warnings.length) return { complete: false, assignments: [], missingSlots: [], warnings };
  if (roster.length > 100 || new Set(roster.map((player) => player.id)).size !== roster.length)
    return {
      complete: false,
      assignments: [],
      missingSlots: slots.map((slot) => slot.label),
      warnings: ['Roster is too large or contains duplicate player IDs.'],
    };
  type State = { score: number; points: number; assignments: LineupEstimate['assignments'] };
  const choices = new Map<number, State>([[0, { score: 0, points: 0, assignments: [] }]]);
  // Locked players go first so every later choice already accounts for their spots.
  const ordered = [
    ...roster.filter((player) => locked.has(player.id)),
    ...roster.filter((player) => !locked.has(player.id)),
  ];
  const scoreOf = value;
  for (const player of ordered) {
    const isLocked = locked.has(player.id);
    const projected = isLocked ? 0 : player.projectedPoints;
    if (projected === undefined || !Number.isFinite(projected)) continue;
    const before = [...choices.entries()];
    // A locked player cannot be left out, so only states that seat them survive.
    if (isLocked) choices.clear();
    for (const [mask, value] of before) {
      slots.forEach((slot, index) => {
        const bit = 1 << index;
        if (
          mask & bit ||
          !slot.positions.includes(player.position === 'DEF' ? 'DST' : player.position)
        )
          return;
        const next = mask | bit,
          points = value.points + projected,
          score = value.score + (isLocked || !scoreOf ? projected : scoreOf(player));
        if (!choices.has(next) || score > choices.get(next)!.score)
          choices.set(next, {
            score,
            points,
            assignments: [
              ...value.assignments,
              {
                slot: `${slot.label} ${index + 1}`,
                playerId: player.id,
                points: projected,
                ...(isLocked ? { locked: true as const } : {}),
              },
            ],
          });
      });
    }
    // More locked players than fitting spots: keep the earlier states rather than none.
    if (isLocked && !choices.size) for (const [mask, value] of before) choices.set(mask, value);
  }
  const complete = choices.get((1 << slots.length) - 1);
  if (complete)
    return {
      complete: true,
      points: complete.points,
      assignments: complete.assignments,
      missingSlots: [],
      warnings,
    };
  const [bestMask, best] = [...choices.entries()].sort(
    (a, b) => bitCount(b[0]) - bitCount(a[0]) || b[1].score - a[1].score,
  )[0]!;
  return {
    complete: false,
    assignments: best.assignments,
    missingSlots: slots
      .filter((_slot, index) => !(bestMask & (1 << index)))
      .map((slot) => slot.label),
    warnings: [
      'No complete lineup estimate is available. Missing players/projections must not count as zero.',
    ],
  };
}
function bitCount(mask: number) {
  let count = 0;
  for (; mask; mask &= mask - 1) count++;
  return count;
}

/** Weighted evidence score, deliberately separate from outcome probabilities. */
export function adviceConfidence(input: {
  coverage: number;
  fresh: boolean;
  sampleSize: number;
  independentSources: number;
  decisionMargin: number;
  uncertainty: number;
}): AdviceConfidence {
  const bounded = (value: number, max: number) =>
    Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
  const factors = [
    {
      label: 'Relevant player/data coverage',
      score: Math.round(bounded(input.coverage, 1) * 30),
      maximum: 30,
    },
    { label: 'Fresh league and source data', score: input.fresh ? 20 : 0, maximum: 20 },
    {
      label: 'Historical sample',
      score: Math.round(bounded(input.sampleSize / 12, 1) * 20),
      maximum: 20,
    },
    {
      label: 'Independent forecast sources',
      score: Math.round(bounded(input.independentSources / 3, 1) * 15),
      maximum: 15,
    },
    {
      label: 'Decision margin versus variability',
      score: Math.round(
        bounded(Math.abs(input.decisionMargin) / Math.max(1, input.uncertainty * 2), 1) * 15,
      ),
      maximum: 15,
    },
  ];
  const raw = factors.reduce((sum, factor) => sum + factor.score, 0);
  // High numerical separation cannot compensate for stale data or substantial missing coverage.
  const score = Math.min(
    raw,
    input.coverage < 1 ? 49 : 100,
    !input.fresh ? 59 : 100,
    input.sampleSize < 4 ? 59 : 100,
  );
  return {
    score,
    label: score >= 80 ? 'High' : score >= 60 ? 'Moderate' : 'Low',
    meaning:
      'Evidence quality out of 100. This is not a win probability or a calibrated chance of success.',
    factors,
  };
}

export function americanOdds(odds: number): { profitPerUnit: number; breakEvenRate: number } {
  if (!Number.isInteger(odds) || Math.abs(odds) < 100 || Math.abs(odds) > 100_000)
    throw new Error('Enter American odds of -100 or lower, or +100 or higher.');
  const profitPerUnit = odds > 0 ? odds / 100 : 100 / -odds;
  return { profitPerUnit, breakEvenRate: 1 / (1 + profitPerUnit) };
}

export function analyzeBetHistory(
  terms: BetTerms,
  data: FootballDataSnapshot,
  asOf: string,
): BetEvidence {
  const odds = americanOdds(terms.americanOdds),
    opposite =
      terms.oppositeAmericanOdds !== undefined
        ? americanOdds(terms.oppositeAmericanOdds)
        : undefined;
  const game = data.games.find((item) => item.id === terms.gameId);
  if (!game) throw new Error('Choose an available NFL game.');
  if (!isUpcomingFootballGame(game, asOf)) throw new Error('Choose an upcoming, unscored game.');
  if (
    (terms.kind === 'player-prop' || terms.kind === 'total') &&
    !['over', 'under'].includes(terms.side)
  )
    throw new Error('Choose over or under.');
  if (
    (terms.kind === 'spread' || terms.kind === 'moneyline') &&
    !['home', 'away'].includes(terms.side)
  )
    throw new Error('Choose the home or away team.');
  if (
    terms.kind !== 'moneyline' &&
    (terms.line === undefined || !Number.isFinite(terms.line) || Math.abs(terms.line) > 2_000)
  )
    throw new Error('Enter the sportsbook line.');
  const cutoff = game.date < asOf.slice(0, 10) ? game.date : asOf.slice(0, 10);
  let samples: { value: number; sourceIds: string[] }[] = [];
  if (terms.kind === 'player-prop') {
    if (!terms.playerId || !terms.stat) throw new Error('Choose a player and statistic.');
    const earlier = historicalPlayerGames(data, {
      season: game.season,
      week: game.week,
      asOf: `${cutoff}T00:00:00Z`,
    });
    const matched = earlier
      .filter((row) => row.playerId === terms.playerId)
      .sort((a, b) => b.season - a.season || b.week - a.week)
      .slice(0, 12);
    samples = matched.flatMap((row) =>
      row.stats[terms.stat!] !== undefined
        ? [{ value: row.stats[terms.stat!]!, sourceIds: footballRowSourceIds(row) }]
        : [],
    );
  } else {
    const team = terms.side === 'away' ? game.away : game.home;
    const earlier = data.games
      .filter(
        (row) =>
          completedBefore(row, cutoff) &&
          row.seasonType === 'REG' &&
          (terms.kind === 'total'
            ? [game.home, game.away].some((id) => id === row.home || id === row.away)
            : row.home === team || row.away === team),
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, terms.kind === 'total' ? 24 : 12);
    samples = earlier.map((row) => ({
      value:
        terms.kind === 'total'
          ? row.homeScore! + row.awayScore!
          : row.home === team
            ? row.homeScore! - row.awayScore!
            : row.awayScore! - row.homeScore!,
      sourceIds: ['games'],
    }));
  }
  let wins = 0,
    losses = 0,
    pushes = 0;
  for (const sample of samples) {
    const delta =
      terms.kind === 'moneyline'
        ? sample.value
        : terms.kind === 'spread'
          ? sample.value + terms.line!
          : terms.side === 'over'
            ? sample.value - terms.line!
            : terms.line! - sample.value;
    if (delta > 0) wins++;
    else if (delta < 0) losses++;
    else pushes++;
  }
  const settled = wins + losses,
    total = settled + pushes;
  const historicalRate = settled ? wins / settled : undefined;
  const metrics: BetEvidence['metrics'] = [
    {
      id: 'odds-break-even',
      label: 'Break-even rate at your odds',
      value: odds.breakEvenRate * 100,
      unit: '%',
      sourceIds: ['entered-odds'],
      description: 'Required win rate among non-push bets, before any fees.',
    },
    {
      id: 'bet-sample',
      label: 'Historical games in sample',
      value: total,
      unit: 'games',
      sourceIds: [...new Set(samples.flatMap((sample) => sample.sourceIds))],
    },
  ];
  if (opposite)
    metrics.push({
      id: 'odds-no-vig',
      label: 'Two-sided no-vig market baseline',
      value: (100 * odds.breakEvenRate) / (odds.breakEvenRate + opposite.breakEvenRate),
      unit: '%',
      sourceIds: ['entered-odds'],
      description: 'Normalizes the implied probabilities of both entered sides; not a forecast.',
    });
  if (historicalRate !== undefined)
    metrics.push({
      id: 'bet-hit-rate',
      label: 'Historical non-push hit rate',
      value: historicalRate * 100,
      unit: '%',
      sourceIds: [...new Set(samples.flatMap((sample) => sample.sourceIds))],
      sampleSize: settled,
    });
  const historicalRoi = total ? (wins * odds.profitPerUnit - losses) / total : undefined;
  if (historicalRoi !== undefined)
    metrics.push({
      id: 'bet-historical-roi',
      label: 'Historical ROI at entered odds',
      value: historicalRoi * 100,
      unit: '%',
      sourceIds: ['entered-odds', ...new Set(samples.flatMap((sample) => sample.sourceIds))],
      sampleSize: total,
      description:
        'Retrospective sample return per one unit wagered including pushes; not future expected value.',
    });
  return {
    metrics,
    wins,
    losses,
    pushes,
    breakEvenRate: odds.breakEvenRate,
    ...(historicalRate !== undefined
      ? { historicalRate, historicalInterval: wilsonInterval(wins, settled) }
      : {}),
    ...(historicalRoi !== undefined ? { historicalRoi } : {}),
    warnings: [
      'Historical frequencies are not calibrated forecasts. They do not adjust for current role, opponent, injuries, or price movement.',
      'Public schedule lines are reference data, not live sportsbook prices. Analysis uses the odds and line you entered.',
      ...(total < 8 ? ['Too few prior games for a reliable comparison.'] : []),
      ...(pushes ? ['Pushes are refunded and excluded from the hit-rate denominator.'] : []),
    ],
  };
}

/** Wilson 95% interval for the observed binomial sample rate; not a forecast interval. */
export function wilsonInterval(wins: number, total: number): [number, number] {
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(wins) || wins < 0 || wins > total)
    throw new Error('Invalid binomial sample.');
  const z = 1.959963984540054,
    p = wins / total,
    denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
function completedBefore(game: FootballGame, day: string) {
  return game.date < day && game.homeScore !== undefined && game.awayScore !== undefined;
}

/**
 * This week's starters whose games have already begun: their estimates are withheld, and the
 * platform locks them in place, so lineup math must keep them seated rather than replace them.
 */
export function startedStarterIds(
  league: Pick<LeagueConnection, 'matchups'>,
  teamId: string,
  week: number | undefined,
  evidence: Pick<PlayerAdviceEvidence, 'id' | 'warnings'>[],
): Set<string> {
  const starters = new Set(
    (league.matchups ?? [])
      .filter((m) => week === undefined || m.week === week)
      .flatMap((m) => m.teams.filter((t) => t.teamId === teamId).flatMap((t) => t.starters ?? [])),
  );
  return new Set(
    evidence
      .filter((p) => starters.has(p.id) && p.warnings.includes(weeklyGameWithheldWarning))
      .map((p) => p.id),
  );
}

/**
 * nflverse team defense rows give combined defensive and return touchdowns, while ESPN scores each
 * kind separately. When the league weights every kind in a group equally the split does not
 * change the score, so the combined count is credited to one kind; otherwise the split stays
 * unknown. Two-point returns and one-point safeties are not in the data and count as none.
 */
function espnDefenseRow(row: PlayerGameStats, scoring: Record<string, number>): PlayerGameStats {
  const stats = { ...row.stats };
  const equal = (keys: string[]) => new Set(keys.map((k) => scoring[k] ?? 0)).size === 1;
  if (
    stats.dst_interception_return_tds === undefined &&
    stats.dst_touchdowns !== undefined &&
    equal(['103', '104'])
  ) {
    stats.dst_interception_return_tds = stats.dst_touchdowns;
    stats.dst_fumble_return_tds = 0;
  }
  if (
    stats.dst_kickoff_return_tds === undefined &&
    stats.dst_special_teams_touchdowns !== undefined &&
    equal(['101', '102', '93'])
  ) {
    stats.dst_kickoff_return_tds = stats.dst_special_teams_touchdowns;
    stats.dst_punt_return_tds = 0;
    stats.dst_blocked_kick_return_tds = 0;
  }
  stats.dst_two_point_returns ??= 0;
  stats.dst_one_point_safeties ??= 0;
  return { ...row, stats };
}

/**
 * Starters the lineup math must keep seated: those whose games have begun, plus active starters
 * with no estimate. Missing data is never a reason to bench someone; players ruled out or on a
 * bye are not kept, so the optimizer can still replace them.
 */
export function keptStarterIds(
  league: Pick<LeagueConnection, 'matchups'>,
  teamId: string,
  week: number | undefined,
  evidence: Pick<
    PlayerAdviceEvidence,
    'id' | 'warnings' | 'projectedPoints' | 'status' | 'weeklyGameStatus'
  >[],
) {
  const started = startedStarterIds(league, teamId, week, evidence);
  const starters = new Set(
    (league.matchups ?? [])
      .filter((m) => week === undefined || m.week === week)
      .flatMap((m) => m.teams.filter((t) => t.teamId === teamId).flatMap((t) => t.starters ?? [])),
  );
  const unknown = new Set(
    evidence
      .filter(
        (p) =>
          starters.has(p.id) &&
          !started.has(p.id) &&
          p.projectedPoints === undefined &&
          p.weeklyGameStatus !== 'bye' &&
          !isInactiveFootballStatus(p.status),
      )
      .map((p) => p.id),
  );
  return { started, unknown, all: new Set([...started, ...unknown]) };
}
