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

// ESPN's public NFL team directory IDs; unknown IDs remain unmapped.
const nflTeams: Record<string, string> = {
  '1': 'ATL',
  '2': 'BUF',
  '3': 'CHI',
  '4': 'CIN',
  '5': 'CLE',
  '6': 'DAL',
  '7': 'DEN',
  '8': 'DET',
  '9': 'GB',
  '10': 'TEN',
  '11': 'IND',
  '12': 'KC',
  '13': 'LV',
  '14': 'LAR',
  '15': 'MIA',
  '16': 'MIN',
  '17': 'NE',
  '18': 'NO',
  '19': 'NYG',
  '20': 'NYJ',
  '21': 'PHI',
  '22': 'ARI',
  '23': 'PIT',
  '24': 'LAC',
  '25': 'SF',
  '26': 'SEA',
  '27': 'TB',
  '28': 'WAS',
  '29': 'CAR',
  '30': 'JAX',
  '33': 'BAL',
  '34': 'HOU',
};
const positions: Record<number, string> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'DST',
};
const availabilityLabels: Record<string, string> = {
  NORMAL: 'Normal',
  ACTIVE: 'Active',
  QUESTIONABLE: 'Questionable',
  DOUBTFUL: 'Doubtful',
  OUT: 'Out',
  INJURY_RESERVE: 'Injured Reserve',
  SUSPENSION: 'Suspended',
  SUSPENDED: 'Suspended',
  DAY_TO_DAY: 'Day to day',
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
    const currentWeek = boundedInteger(
      asRecord(asRecord(raw)?.status)?.currentScoringPeriod ??
        asRecord(asRecord(raw)?.status)?.currentMatchupPeriod,
      1,
      30,
    );
    const supplemental = await espnSupplementalData(id, season, currentWeek, this.sessionCookie);
    return normalizeEspnLeague(raw, id, season, supplemental);
  }
}

/** Shared allowlist normalization for direct reads and owner-exported browser data. */
export function normalizeEspnLeague(
  raw: unknown,
  id: string,
  season: number,
  supplementalInput?: unknown,
): LeagueConnection {
  const data = asRecord(raw);
  if (!data || !Array.isArray(data.teams) || data.teams.length === 0)
    throw new Error(
      'ESPN league unavailable or returned no teams. Private leagues need an owner-authorized session configured in Settings.',
    );
  if (data.teams.length > 32)
    throw new Error('ESPN league returned more than 32 teams; refusing oversized league data.');
  if (
    (data.id !== undefined && String(data.id) !== id) ||
    (data.seasonId !== undefined && data.seasonId !== season)
  )
    throw new Error('ESPN league identity does not match the requested league/season.');
  const settings = asRecord(data.settings) ?? {};
  const displayName = boundedDisplayName(settings.name ?? data.name, `ESPN League ${id}`);
  const status = asRecord(data.status);
  const responseSeason = boundedInteger(data.seasonId, 2000, 2099);
  const matchupPeriod = boundedInteger(status?.currentMatchupPeriod, 1, 30);
  const currentWeek = boundedInteger(
    status?.currentScoringPeriod ?? status?.currentMatchupPeriod,
    1,
    30,
  );
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
  const supplemental = asRecord(supplementalInput);
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
  // ESPN keeps D/ST (lineup slot 16) and kicker (slot 17) values in per-slot overrides; the base
  // points are often 0 for those stats.
  const positionScoring: NonNullable<LeagueConnection['positionScoring']> = {};
  for (const item of scoringItems) {
    const row = asRecord(item) ?? {};
    const statId = boundedId(row.statId, 40);
    const overrides = asRecord(row.pointsOverrides);
    if (!statId || !overrides) continue;
    for (const [slot, position] of [
      ['16', 'DST'],
      ['17', 'K'],
    ] as const) {
      const points = numberOrUndefined(overrides[slot]);
      if (points !== undefined) (positionScoring[position] ??= {})[statId] = points;
    }
  }
  // FAAB: the league's budget and what each team has spent (absent in non-FAAB leagues).
  const waiverBudget = boundedInteger(
    asRecord(settings.acquisitionSettings)?.acquisitionBudget,
    1,
    100_000,
  );
  const faab = (team: Record<string, unknown>) => {
    const spent = boundedInteger(
      asRecord(team.transactionCounter)?.acquisitionBudgetSpent,
      0,
      100_000,
    );
    return waiverBudget && spent !== undefined
      ? { faabRemaining: Math.max(0, waiverBudget - spent) }
      : {};
  };
  const teams: LeagueConnection['teams'] = data.teams.map((entry, index) => {
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
      ...faab(team),
    };
  });
  const rosterTeams = Array.isArray(supplemental?.teams) ? supplemental.teams : [];
  espnApplyRosters(teams, rosterTeams);
  const draft = espnDraft(supplemental?.draftDetail, season, id, teams);
  const draftScheduledAt = espnDraftScheduledAt(asRecord(settings.draftSettings)?.date);
  const weeklyScores = espnWeeklyScores(data.schedule, matchupPeriod, regularMatchupPeriods);
  const upcomingSchedule = espnUpcomingSchedule(
    data.schedule,
    matchupPeriod,
    regularMatchupPeriods,
  );
  const matchups = espnCurrentWeekMatchups(data.schedule, matchupPeriod)?.map((m) => ({
    ...m,
    week: currentWeek ?? m.week,
    teams: m.teams.map((t) => {
      const roster = teams.find((team) => team.id === t.teamId)?.roster;
      return {
        ...t,
        ...(roster?.length && roster.every((p) => p.rosterPosition)
          ? {
              starters: roster
                .filter((p) => !['BENCH', 'IR'].includes(p.rosterPosition!))
                .map((p) => p.id),
            }
          : {}),
      };
    }),
  }));
  return {
    id,
    platform: 'espn',
    name: displayName,
    displayName,
    season: responseSeason ?? season,
    teamCount: teams.length,
    scoring,
    ...(Object.keys(positionScoring).length ? { positionScoring } : {}),
    settings: {
      ...(scoringType ? { scoringType } : {}),
      ...(currentWeek !== undefined ? { currentWeek } : {}),
      ...(seasonComplete !== undefined ? { seasonComplete } : {}),
      ...(rosterPositions ? { roster_positions: rosterPositions } : {}),
      ...espnFormat(asRecord(settings.draftSettings), rosterPositions),
      ...(waiverBudget ? { waiverBudget } : {}),
      ...(regularMatchupPeriods ? { regularSeasonWeeks: regularMatchupPeriods } : {}),
      ...(playoffTeams ? { playoffTeams } : {}),
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
    ...(weeklyScores.length ? { weeklyScores } : {}),
    ...(upcomingSchedule.length ? { upcomingSchedule } : {}),
    connectedAt: new Date().toISOString(),
  };
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

/**
 * Final scores for regular-season matchup periods before the current one. Only decided games
 * count (ESPN marks unplayed ones UNDECIDED), and live totals are never used.
 */
function espnWeeklyScores(
  rawSchedule: unknown,
  currentPeriod: number | undefined,
  regularPeriods: number | undefined,
): NonNullable<LeagueConnection['weeklyScores']> {
  if (!Array.isArray(rawSchedule) || currentPeriod === undefined) return [];
  return rawSchedule.slice(0, 1000).flatMap((entry) => {
    const row = asRecord(entry);
    const period = numberOrUndefined(row?.matchupPeriodId);
    if (
      !row ||
      period === undefined ||
      !Number.isInteger(period) ||
      period < 1 ||
      period >= currentPeriod ||
      (regularPeriods !== undefined && period > regularPeriods) ||
      !['HOME', 'AWAY', 'TIE'].includes(String(row.winner))
    )
      return [];
    const home = asRecord(row.home);
    const away = asRecord(row.away);
    const homeId = numberOrUndefined(home?.teamId);
    const awayId = numberOrUndefined(away?.teamId);
    const homePoints = numberOrUndefined(home?.totalPoints);
    const awayPoints = numberOrUndefined(away?.totalPoints);
    if (
      homeId === undefined ||
      awayId === undefined ||
      homePoints === undefined ||
      awayPoints === undefined ||
      Math.abs(homePoints) > 1_000_000 ||
      Math.abs(awayPoints) > 1_000_000
    )
      return [];
    return [
      {
        week: period,
        teams: [
          { teamId: String(homeId), points: homePoints },
          { teamId: String(awayId), points: awayPoints },
        ],
      },
    ];
  });
}

/** Regular-season pairings from the current matchup period on; scores are not needed. */
function espnUpcomingSchedule(
  rawSchedule: unknown,
  currentPeriod: number | undefined,
  regularPeriods: number | undefined,
): NonNullable<LeagueConnection['upcomingSchedule']> {
  if (!Array.isArray(rawSchedule) || currentPeriod === undefined || regularPeriods === undefined)
    return [];
  return rawSchedule.slice(0, 1000).flatMap((entry) => {
    const row = asRecord(entry);
    const period = numberOrUndefined(row?.matchupPeriodId);
    const home = numberOrUndefined(asRecord(row?.home)?.teamId);
    const away = numberOrUndefined(asRecord(row?.away)?.teamId);
    if (
      period === undefined ||
      !Number.isInteger(period) ||
      period < currentPeriod ||
      period > regularPeriods ||
      home === undefined ||
      away === undefined ||
      home === away
    )
      return [];
    return [{ week: period, teamIds: [String(home), String(away)] as [string, string] }];
  });
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
          ...(nflTeams[String(player?.proTeamId)]
            ? { nflTeam: nflTeams[String(player?.proTeamId)]! }
            : {}),
          ...(status ? { status: availabilityLabels[status] ?? status } : {}),
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

/**
 * ESPN has no league type: a keeper count marks a keeper league, and keeping (nearly) the
 * whole roster marks a dynasty league.
 */
export function espnFormat(
  draftSettings: Record<string, unknown> | undefined,
  rosterPositions: string[] | undefined,
) {
  const keepers = boundedInteger(draftSettings?.keeperCount, 0, 50) ?? 0;
  if (!keepers) return { leagueFormat: 'redraft' };
  const rosterSize = (rosterPositions ?? []).filter((slot) => !/^IR$/i.test(slot)).length;
  return {
    leagueFormat: rosterSize && keepers >= rosterSize - 2 ? 'dynasty' : 'keeper',
    maxKeepers: keepers,
  };
}
