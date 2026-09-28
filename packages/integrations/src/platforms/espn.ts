import { isValidEspnSeason, type LeagueConnection, type LeagueConnector } from '@sidekick/core';
import {
  asRecord,
  boundedId,
  boundedInteger,
  boundedDisplayName,
  boundedLabel,
  boundedString,
  booleanOrUndefined,
  fetchJson,
  numberOrUndefined,
} from './shared.js';

const positions: Record<number, string> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'DST',
};
const lineupSlots: Record<number, string> = {
  0: 'QB',
  2: 'RB',
  4: 'WR',
  6: 'TE',
  16: 'DST',
  17: 'K',
  20: 'BENCH',
  21: 'IR',
  23: 'FLEX',
  24: 'OP',
};

export class EspnConnector implements LeagueConnector {
  platform = 'espn' as const;
  constructor(
    private readonly sessionCookie?: string,
    private readonly seasonOverride?: number,
  ) {}
  async fetchLeague(id: string): Promise<LeagueConnection> {
    // Use cookies supplied by the owner; never attempt to obtain or bypass their authenticated session.
    const season = this.seasonOverride ?? new Date().getFullYear();
    if (!isValidEspnSeason(season))
      throw new Error('Choose an ESPN fantasy season between 2000 and 2099.');
    const raw = await fetchJson(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${encodeURIComponent(id)}?view=mTeam&view=mSettings&view=mMatchupScore`,
      this.sessionCookie ? { headers: { cookie: this.sessionCookie } } : undefined,
    );
    const data = asRecord(raw);
    if (!data || !Array.isArray(data.teams) || data.teams.length === 0)
      throw new Error(
        'ESPN league unavailable or returned no teams. Private leagues need an owner-authorized session configured in Settings.',
      );
    if (data.teams.length > 32)
      throw new Error('ESPN league returned more than 32 teams; refusing oversized league data.');
    const settings = asRecord(data.settings) ?? {};
    const displayName = boundedDisplayName(settings.name ?? data.name, `ESPN League ${id}`);
    const status = asRecord(data.status);
    const responseSeason = boundedInteger(data.seasonId, 2000, 2099);
    const currentWeek = boundedInteger(status?.currentMatchupPeriod, 1, 30);
    const seasonComplete = booleanOrUndefined(status?.isExpired);
    const scheduleSettings = asRecord(settings.scheduleSettings);
    const scoringSettings = asRecord(settings.scoringSettings);
    const rosterPositions = espnRosterPositions(settings);
    const scoringType = boundedString(scoringSettings?.scoringType, 32)?.toUpperCase();
    const regularMatchupPeriods = boundedInteger(scheduleSettings?.matchupPeriodCount, 1, 30);
    const playoffTeams = boundedInteger(scheduleSettings?.playoffTeamCount, 2, 64);
    // ESPN's league endpoint is undocumented; keep this estimate gated on explicit H2H
    // format, regular-season period count, and playoff team count, and label it as derived.
    const inferredPlayoffStartWeek =
      scoringType?.startsWith('H2H') && regularMatchupPeriods && playoffTeams
        ? regularMatchupPeriods + 1
        : undefined;
    const supplemental = await espnSupplementalData(id, season, currentWeek, this.sessionCookie);
    const scoringItems = Array.isArray(asRecord(settings.scoringSettings)?.scoringItems)
      ? (asRecord(settings.scoringSettings)!.scoringItems as unknown[])
      : [];
    const scoring = Object.fromEntries(
      scoringItems
        .map((item) => {
          const row = asRecord(item) ?? {};
          const statId = boundedId(row.statId, 40);
          return [statId, numberOrUndefined(row.points)];
        })
        .filter(
          (entry): entry is [string, number] =>
            typeof entry[0] === 'string' && entry[1] !== undefined,
        ),
    ) as Record<string, number>;
    const teams = data.teams.map((entry, index) => {
      const team = asRecord(entry) ?? {};
      const teamId = boundedId(team.id, 40) ?? String(index);
      const owner = boundedLabel(team.location, 120) ?? boundedLabel(team.nickname, 120);
      return {
        id: teamId,
        name: boundedDisplayName(team.name, `Team ${index + 1}`),
        ...(owner ? { owner } : {}),
        wins: numberOrUndefined(
          asRecord(team.record)?.overall && asRecord(asRecord(team.record)!.overall)?.wins,
        ),
        losses: numberOrUndefined(asRecord(asRecord(team.record)?.overall)?.losses),
        pointsFor: numberOrUndefined(asRecord(asRecord(team.record)?.overall)?.pointsFor),
      };
    });
    const rosterTeams = Array.isArray(supplemental?.teams) ? supplemental.teams : [];
    espnApplyRosters(teams, rosterTeams);
    const draft = espnDraft(supplemental?.draftDetail, season, id, teams);
    const draftScheduledAt = espnDraftScheduledAt(asRecord(settings.draftSettings)?.date);
    const matchups = espnCurrentWeekMatchups(data.schedule, currentWeek);
    return {
      id,
      platform: 'espn',
      name: displayName,
      displayName,
      season: responseSeason ?? season,
      teamCount: teams.length,
      scoring,
      settings: {
        ...(scoringType ? { scoringType } : {}),
        ...(currentWeek !== undefined ? { currentWeek } : {}),
        ...(seasonComplete !== undefined ? { seasonComplete } : {}),
        ...(rosterPositions ? { roster_positions: rosterPositions } : {}),
        ...(inferredPlayoffStartWeek !== undefined
          ? {
              playoffStartWeek: inferredPlayoffStartWeek,
              playoffStartWeekSource: 'derived',
            }
          : {}),
      },
      teams,
      ...(draft ? { draft } : {}),
      ...(draftScheduledAt ? { draftScheduledAt } : {}),
      ...(matchups ? { matchups } : {}),
      connectedAt: new Date().toISOString(),
    };
  }
}

function espnRosterPositions(settings: Record<string, unknown>): string[] | undefined {
  const rosterSettings = asRecord(settings.rosterSettings);
  const counts = asRecord(rosterSettings?.lineupSlotCounts);
  if (!counts) return undefined;
  const slots: string[] = [];
  for (const [rawId, rawCount] of Object.entries(counts)) {
    const id = Number(rawId);
    const count = boundedInteger(rawCount, 0, 100);
    if (count === undefined) return undefined;
    if (count === 0) continue;
    const name = lineupSlots[id];
    // Unknown active slots make lineup analysis incomplete; do not expose a partial roster format.
    if (!name) return undefined;
    slots.push(...Array.from({ length: count }, () => name));
    if (slots.length > 100) return undefined;
  }
  return slots.length ? slots : undefined;
}

function espnDraftScheduledAt(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const normalized = new Date(timestamp);
  const year = normalized.getUTCFullYear();
  if (year < 2000 || year >= 2100 || normalized.toISOString().slice(0, 10) !== value.slice(0, 10))
    return undefined;
  return normalized.toISOString();
}

async function espnSupplementalData(
  leagueId: string,
  season: number,
  currentWeek: number | undefined,
  sessionCookie: string | undefined,
): Promise<Record<string, unknown> | undefined> {
  const scoringPeriod = currentWeek ?? 1;
  try {
    const raw = await fetchJson(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${encodeURIComponent(leagueId)}?view=mRoster&view=mDraftDetail&scoringPeriodId=${scoringPeriod}`,
      sessionCookie ? { headers: { cookie: sessionCookie } } : undefined,
    );
    return asRecord(raw);
  } catch {
    // Roster and draft detail are supplemental; core league access remains useful without them.
    return undefined;
  }
}

function espnCurrentWeekMatchups(
  rawSchedule: unknown,
  currentWeek: number | undefined,
): NonNullable<LeagueConnection['matchups']> | undefined {
  if (!Array.isArray(rawSchedule) || currentWeek === undefined) return undefined;
  const matchups = rawSchedule.flatMap((entry) => {
    const row = asRecord(entry);
    if (!row || numberOrUndefined(row.matchupPeriodId) !== currentWeek) return [];
    const home = asRecord(row.home);
    const away = asRecord(row.away);
    const homeId = numberOrUndefined(home?.teamId);
    const awayId = numberOrUndefined(away?.teamId);
    if (homeId === undefined || awayId === undefined) return [];
    const homePoints = numberOrUndefined(home?.totalPointsLive ?? home?.totalPoints);
    const awayPoints = numberOrUndefined(away?.totalPointsLive ?? away?.totalPoints);
    return [
      {
        week: currentWeek,
        teams: [
          { teamId: String(homeId), ...(homePoints !== undefined ? { points: homePoints } : {}) },
          { teamId: String(awayId), ...(awayPoints !== undefined ? { points: awayPoints } : {}) },
        ],
      },
    ];
  });
  return matchups.length ? matchups : undefined;
}

function espnApplyRosters(teams: LeagueConnection['teams'], rawTeams: unknown[]): void {
  for (const rawTeam of rawTeams) {
    const teamData = asRecord(rawTeam);
    const team = teams.find((candidate) => candidate.id === String(teamData?.id));
    const roster = asRecord(teamData?.roster);
    if (!team || !Array.isArray(roster?.entries)) continue;
    const players = roster.entries.flatMap((entry) => {
      const row = asRecord(entry);
      const pool = asRecord(row?.playerPoolEntry);
      const player = asRecord(pool?.player);
      const id = boundedId(row?.playerId ?? player?.id, 40);
      const name = boundedString(player?.fullName, 120);
      if (!id || !name) return [];
      const positionId = boundedInteger(player?.defaultPositionId, 1, 30);
      const lineupSlot = boundedInteger(row?.lineupSlotId, 0, 100);
      const rosterPosition = lineupSlot === undefined ? undefined : lineupSlots[lineupSlot];
      const status = boundedString(player?.injuryStatus ?? row?.status, 32);
      return [
        {
          id,
          name,
          ...(positionId && positions[positionId] ? { position: positions[positionId] } : {}),
          ...(rosterPosition ? { rosterPosition } : {}),
          ...(status ? { status } : {}),
        },
      ];
    });
    if (!players.length) continue;
    team.roster = players.slice(0, 100);
    team.rosterPlayerIds = players.slice(0, 100).map((player) => player.id);
    team.rosterSize = players.length;
  }
}

function espnDraft(
  raw: unknown,
  season: number,
  leagueId: string,
  teams: LeagueConnection['teams'],
): NonNullable<LeagueConnection['draft']> | undefined {
  const data = asRecord(raw);
  if (!data || !Array.isArray(data.picks)) return undefined;
  const players = new Map(
    teams.flatMap((team) => (team.roster ?? []).map((player) => [player.id, player] as const)),
  );
  const picks = data.picks.slice(0, 500).flatMap((entry) => {
    const row = asRecord(entry);
    const playerId = boundedId(row?.playerId, 40);
    const pickNumber = boundedInteger(row?.overallPickNumber, 1, 1000);
    if (!row || !playerId || pickNumber === undefined) return [];
    const teamId = boundedId(row.teamId, 40);
    const player = players.get(playerId);
    const round = boundedInteger(row.roundId, 1, 100);
    const draftSlot = boundedInteger(row.roundPickNumber, 1, 100);
    return [
      {
        playerId,
        ...(player?.name ? { playerName: player.name } : {}),
        ...(teamId && teams.some((team) => team.id === teamId) ? { teamId } : {}),
        ...(round !== undefined ? { round } : {}),
        pickNumber,
        ...(draftSlot !== undefined ? { draftSlot } : {}),
        ...(player?.position ? { position: player.position } : {}),
      },
    ];
  });
  if (!picks.length) return undefined;
  const status =
    data.inProgress === true ? 'in_progress' : data.drafted === true ? 'complete' : undefined;
  return {
    id: `espn-${leagueId}-${season}`,
    season,
    ...(status ? { status } : {}),
    picks,
  };
}
