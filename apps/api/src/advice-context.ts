import type { AdviceRequest, LeagueConnection } from '@sidekick/core';

type Team = LeagueConnection['teams'][number];

/** A team's roster and recorded starters for the advice prompt. */
export function rosterContext(
  league: LeagueConnection | undefined,
  team: Team | undefined,
  week: number,
) {
  return team
    ? {
        teamId: team.id,
        playerIds: team.rosterPlayerIds ?? team.roster?.map((player) => player.id) ?? [],
        recordedStarters: {
          week,
          playerIds: [
            ...new Set(
              league?.matchups
                ?.filter((matchup) => matchup.week === week)
                .flatMap((matchup) =>
                  matchup.teams
                    .filter((side) => side.teamId === team.id)
                    .flatMap((side) => side.starters ?? []),
                ) ?? [],
            ),
          ],
          scope: 'Saved starter identities, not verified platform slot assignments.',
        },
        complete: Boolean(team.roster && team.rosterSize === team.roster.length),
        sourceId: 'league-snapshot',
      }
    : null;
}

/** Saved picks and eligibility notes for draft planning and review; null for other modes. */
export function draftContext(
  league: LeagueConnection | undefined,
  request: Pick<AdviceRequest, 'mode' | 'teamId'>,
  candidateIds: string[],
) {
  const savedPicks = league?.draft?.picks.filter((pick) => pick.teamId === request.teamId) ?? [];
  return league && ['draft-plan', 'draft-review'].includes(request.mode)
    ? {
        purpose:
          request.mode === 'draft-plan'
            ? 'conditional candidate planning comparison'
            : 'review saved draft picks',
        savedDraftStatus: league.draft?.status ?? null,
        savedDraftSeason: league.draft?.season ?? null,
        selectedTeamPicks: savedPicks.map((pick) => ({
          playerId: pick.playerId,
          round: pick.round,
          pickNumber: pick.pickNumber,
          isKeeper: pick.isKeeper,
        })),
        candidateIds,
        eligibility:
          request.mode === 'draft-plan'
            ? {
                checkedAgainstSavedRosters:
                  league.teams.length === league.teamCount &&
                  league.teams.every(
                    (team) => team.roster && team.rosterSize === team.roster.length,
                  ),
                checkedAgainstSavedPickLog: Boolean(league.draft),
                snapshotAt: league.lastSyncedAt ?? null,
                limitation:
                  'Candidates exclude players recorded as rostered or picked. The snapshot cannot guarantee live availability or availability at a later pick.',
              }
            : null,
      }
    : null;
}
