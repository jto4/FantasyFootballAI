import type { LeagueConnection } from './domain-types.js';

export interface TeamWeek {
  week: number;
  points: number;
  opponentPoints: number;
  result: 'W' | 'L' | 'T';
}

export interface TeamInsight {
  id: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Record if the team had played every other team every week. */
  allPlayWins: number;
  allPlayLosses: number;
  allPlayTies: number;
  /** Wins expected from weekly scoring alone: the all-play win share times games played. */
  expectedWins: number;
  /** Actual wins (ties count half) minus expected wins; positive means a kind schedule. */
  luck: number;
  weekly: TeamWeek[];
}

export interface WeekSummary {
  week: number;
  median: number;
  low: number;
  high: number;
}

export interface LeagueInsights {
  weeks: WeekSummary[];
  teams: TeamInsight[];
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/**
 * Season history derived only from completed weekly head-to-head scores, so records, points
 * and all-play figures are mutually consistent. Returns undefined without any history.
 */
export function leagueInsights(
  league: Pick<LeagueConnection, 'teams' | 'weeklyScores'>,
): LeagueInsights | undefined {
  const known = new Set(league.teams.map((team) => team.id));
  const games = (league.weeklyScores ?? []).filter(
    (game) =>
      game.teams.length === 2 &&
      game.teams.every((side) => known.has(side.teamId) && Number.isFinite(side.points)) &&
      game.teams[0]!.teamId !== game.teams[1]!.teamId,
  );
  if (!games.length) return undefined;
  const weekly = new Map<string, TeamWeek[]>();
  const byWeek = new Map<number, Map<string, number>>();
  for (const game of games) {
    const scores = byWeek.get(game.week) ?? new Map<string, number>();
    for (const [index, side] of game.teams.entries()) {
      const opponent = game.teams[1 - index]!;
      // A team appearing twice in one week is malformed; keep its first game only.
      if (scores.has(side.teamId)) continue;
      scores.set(side.teamId, side.points);
      const result =
        side.points > opponent.points ? 'W' : side.points < opponent.points ? 'L' : 'T';
      weekly.set(side.teamId, [
        ...(weekly.get(side.teamId) ?? []),
        { week: game.week, points: side.points, opponentPoints: opponent.points, result },
      ]);
    }
    byWeek.set(game.week, scores);
  }
  const weeks = [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, scores]) => {
      const values = [...scores.values()];
      return { week, median: median(values), low: Math.min(...values), high: Math.max(...values) };
    });
  const teams = league.teams
    .filter((team) => weekly.has(team.id))
    .map((team) => {
      const rows = weekly.get(team.id)!.sort((a, b) => a.week - b.week);
      let allPlayWins = 0,
        allPlayLosses = 0,
        allPlayTies = 0,
        expectedWins = 0;
      for (const row of rows) {
        const others = [...byWeek.get(row.week)!.entries()].filter(([id]) => id !== team.id);
        if (!others.length) continue;
        const beaten = others.filter(([, points]) => row.points > points).length;
        const tied = others.filter(([, points]) => row.points === points).length;
        allPlayWins += beaten;
        allPlayTies += tied;
        allPlayLosses += others.length - beaten - tied;
        expectedWins += (beaten + tied / 2) / others.length;
      }
      const wins = rows.filter((row) => row.result === 'W').length;
      const ties = rows.filter((row) => row.result === 'T').length;
      return {
        id: team.id,
        name: team.name,
        games: rows.length,
        wins,
        losses: rows.length - wins - ties,
        ties,
        pointsFor: rows.reduce((sum, row) => sum + row.points, 0),
        pointsAgainst: rows.reduce((sum, row) => sum + row.opponentPoints, 0),
        allPlayWins,
        allPlayLosses,
        allPlayTies,
        expectedWins,
        luck: wins + ties / 2 - expectedWins,
        weekly: rows,
      };
    });
  return { weeks, teams };
}
