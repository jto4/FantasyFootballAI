import type { LeagueConnection, ReportVisuals } from './domain-types.js';
import { boundedSettingInteger } from './league-status.js';

/** Freeze bounded, minimal numeric evidence before generating the report narrative. */
export function reportVisuals(league: LeagueConnection): ReportVisuals {
  const currentWeek = boundedSettingInteger(league.settings.currentWeek);
  const matchups = (league.matchups ?? []).filter(
    (matchup) => Number.isInteger(matchup.week) && matchup.week >= 1 && matchup.week <= 30,
  );
  const matchupWeek =
    currentWeek ?? matchups.reduce((week, matchup) => Math.max(week, matchup.week), 0);
  const metric = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000
      ? value
      : undefined;
  return {
    ...(typeof league.season === 'number' &&
    Number.isInteger(league.season) &&
    league.season >= 2000 &&
    league.season <= 2099
      ? { season: league.season }
      : {}),
    teamCount: league.teamCount,
    ...(currentWeek !== undefined && currentWeek <= 30 ? { currentWeek } : {}),
    teams: league.teams.slice(0, 64).map((team) => ({
      id: team.id,
      name: team.name,
      ...(metric(team.pointsFor) !== undefined ? { pointsFor: team.pointsFor } : {}),
      ...(Number.isInteger(team.wins) && team.wins! >= 0 && team.wins! <= 10_000
        ? { wins: team.wins }
        : {}),
      ...(Number.isInteger(team.losses) && team.losses! >= 0 && team.losses! <= 10_000
        ? { losses: team.losses }
        : {}),
    })),
    matchups: matchups
      .filter((matchup) => matchup.week === matchupWeek)
      .slice(0, 32)
      .map((matchup) => ({
        week: matchup.week,
        teams: matchup.teams.slice(0, 2).map((side) => ({
          teamId: side.teamId,
          ...(metric(side.points) !== undefined ? { points: side.points } : {}),
        })),
      })),
  };
}
