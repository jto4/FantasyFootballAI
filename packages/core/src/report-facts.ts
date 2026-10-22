import type { LeagueConnection, PlayerProjection } from './domain-types.js';
import { leagueInsights } from './league-insights.js';
import { playoffOdds } from './playoff-odds.js';

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * Deterministic season facts for report writing: standings with power-rank movement, luck,
 * streaks and best/worst weeks; league superlatives; playoff odds; and this week's matchups with
 * projected totals when every starter has a weekly projection. Reports get material for detailed
 * banter without the AI computing or inventing numbers.
 */
export function reportFacts(league: LeagueConnection, projections: PlayerProjection[] = []) {
  const insights = leagueInsights(league);
  const odds = playoffOdds(league);
  const chance = new Map(odds?.teams.map((t) => [t.teamId, t.playoffChance]) ?? []);
  const name = (id: string) => league.teams.find((t) => t.id === id)?.name ?? id;
  const standings = (insights?.teams ?? [])
    .map((team) => {
      const ranks = team.rankByWeek;
      const now = ranks[ranks.length - 1]?.rank,
        before = ranks[ranks.length - 2]?.rank;
      const results = team.weekly.map((w) => w.result);
      let streak = 0;
      for (let i = results.length - 1; i >= 0 && results[i] === results[results.length - 1]; i--)
        streak++;
      const sorted = [...team.weekly].sort((a, b) => b.points - a.points);
      return {
        team: team.name,
        record: `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ''}`,
        pointsFor: round(team.pointsFor),
        pointsAgainst: round(team.pointsAgainst),
        allPlayRecord: `${team.allPlayWins}-${team.allPlayLosses}`,
        /** Positive: more wins than scoring earned (lucky schedule); negative: unlucky. */
        luckWins: round(team.luck),
        ...(now !== undefined ? { powerRank: now } : {}),
        ...(now !== undefined && before !== undefined ? { powerRankChange: before - now } : {}),
        ...(results.length ? { streak: `${results[results.length - 1]}${streak}` } : {}),
        ...(team.weekly.length
          ? { lastWeekPoints: round(team.weekly[team.weekly.length - 1]!.points) }
          : {}),
        ...(sorted[0]
          ? { bestWeek: { week: sorted[0].week, points: round(sorted[0].points) } }
          : {}),
        ...(sorted.length
          ? {
              worstWeek: {
                week: sorted[sorted.length - 1]!.week,
                points: round(sorted[sorted.length - 1]!.points),
              },
            }
          : {}),
        ...(chance.has(team.id)
          ? { playoffChancePercent: Math.round(chance.get(team.id)! * 100) }
          : {}),
        wins: team.wins + team.ties / 2,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
    .map(({ wins: _wins, ...row }) => row);
  const games = (league.weeklyScores ?? []).map((g) => ({
    week: g.week,
    a: { team: name(g.teams[0]!.teamId), points: g.teams[0]!.points },
    b: { team: name(g.teams[1]!.teamId), points: g.teams[1]!.points },
    margin: Math.abs(g.teams[0]!.points - g.teams[1]!.points),
  }));
  const scores = games.flatMap((g) => [
    { week: g.week, ...g.a },
    { week: g.week, ...g.b },
  ]);
  const byPoints = [...scores].sort((x, y) => y.points - x.points);
  const byMargin = [...games].sort((x, y) => x.margin - y.margin);
  const describe = (g: (typeof games)[number]) => ({
    week: g.week,
    result: `${g.a.team} ${round(g.a.points)} – ${g.b.team} ${round(g.b.points)}`,
    margin: round(g.margin),
  });
  // This week's projected totals: only when every listed starter has a weekly projection.
  const week = league.matchups?.[0]?.week;
  const weekly = new Map(
    projections
      .filter((p) => p.leagueId === league.id && p.week === week && p.playerId)
      .map((p) => [p.playerId!, p.projectedPoints]),
  );
  const projected = (starters?: string[]) =>
    starters?.length && starters.every((id) => weekly.has(id))
      ? round(starters.reduce((s, id) => s + weekly.get(id)!, 0))
      : undefined;
  const thisWeek = (league.matchups ?? []).map((m) => {
    const [a, b] = m.teams;
    const pa = projected(a?.starters),
      pb = projected(b?.starters);
    return {
      week: m.week,
      home: name(a?.teamId ?? ''),
      away: name(b?.teamId ?? ''),
      ...(pa !== undefined ? { homeProjected: pa } : {}),
      ...(pb !== undefined ? { awayProjected: pb } : {}),
      ...(pa !== undefined && pb !== undefined
        ? {
            favorite: pa >= pb ? name(a!.teamId) : name(b!.teamId),
            margin: round(Math.abs(pa - pb)),
          }
        : {}),
    };
  });
  return {
    completedWeeks: insights?.weeks.length ?? 0,
    standings,
    superlatives: byPoints.length
      ? {
          highestScore: {
            week: byPoints[0]!.week,
            team: byPoints[0]!.team,
            points: round(byPoints[0]!.points),
          },
          lowestScore: {
            week: byPoints[byPoints.length - 1]!.week,
            team: byPoints[byPoints.length - 1]!.team,
            points: round(byPoints[byPoints.length - 1]!.points),
          },
          closestGame: describe(byMargin[0]!),
          biggestBlowout: describe(byMargin[byMargin.length - 1]!),
        }
      : undefined,
    playoffOdds: odds
      ? {
          spots: odds.playoffSpots,
          remainingWeeks: odds.remainingWeeks,
          scheduleKnown: odds.scheduleKnown,
          method:
            'Simulated rest of season from each team’s scoring so far; an estimate, not a guarantee.',
        }
      : undefined,
    thisWeek,
  };
}
