import type { LeagueConnection, LeagueConnector } from '@sidekick/core';
import {
  asRecord,
  boundedInteger,
  boundedDisplayName,
  boundedId,
  boundedLabel,
  boundedRosterPositions,
  boundedString,
  booleanOrUndefined,
  fetchJson,
  firstRecord,
  numberOrUndefined,
  recordsDeep,
} from './shared.js';

export class YahooConnector implements LeagueConnector {
  platform = 'yahoo' as const;
  constructor(private readonly accessToken?: string) {}
  async fetchLeague(id: string): Promise<LeagueConnection> {
    if (!this.accessToken)
      throw new Error(
        'Yahoo connection needs an owner-authorized OAuth access token saved in Settings.',
      );
    const leagueKey = /^\d+$/.test(id) ? `nfl.l.${id}` : id;
    let raw: unknown;
    try {
      raw = await fetchJson(
        `https://fantasysports.yahooapis.com/fantasy/v2/league/${encodeURIComponent(leagueKey)};out=settings,standings?format=json`,
        { headers: { authorization: `Bearer ${this.accessToken}` } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('(401)'))
        throw new Error('Yahoo rejected the access token (401). Reconnect Yahoo from Settings.');
      if (message.includes('(403)'))
        throw new Error(
          'Yahoo denied access to this league (403). Check that the account is a member and the token has Fantasy Sports access.',
        );
      throw error;
    }
    const data = asRecord(raw);
    const fantasy = asRecord(data?.fantasy_content);
    const leagueResource = fantasy?.league;
    const leagueEntries = Array.isArray(leagueResource) ? leagueResource : [leagueResource];
    const metadata = asRecord(leagueEntries[0]) ?? asRecord(leagueResource);
    const resources = asRecord(leagueEntries[1]) ?? asRecord(leagueResource);
    if (!metadata || typeof metadata.name !== 'string')
      throw new Error('Yahoo league was not found or access was denied.');
    const displayName = boundedDisplayName(metadata.name, `Yahoo League ${id}`);

    const rawSettings = firstRecord(resources?.settings);
    const rawStandings = firstRecord(resources?.standings);
    const teams = yahooTeams(rawStandings);
    const scoring = yahooScoring(rawSettings);
    const currentWeek = numberOrUndefined(metadata.current_week);
    const [rawRosters, rawDraft, matchups] = await Promise.all([
      yahooOptionalResource(
        `league/${encodeURIComponent(leagueKey)}/teams;out=roster`,
        this.accessToken,
      ),
      yahooOptionalResource(
        `league/${encodeURIComponent(leagueKey)}/draftresults`,
        this.accessToken,
      ),
      currentWeek ? yahooCurrentWeekMatchups(leagueKey, currentWeek, this.accessToken) : undefined,
    ]);
    yahooApplyRosters(teams, rawRosters);
    const draft = yahooDraft(rawDraft, leagueKey, teams);
    const seasonComplete = booleanOrUndefined(metadata.is_finished);
    const settings = {
      ...(boundedLabel(rawSettings?.scoring_type ?? metadata.scoring_type, 32)
        ? { scoringType: boundedLabel(rawSettings?.scoring_type ?? metadata.scoring_type, 32) }
        : {}),
      roster_positions: boundedRosterPositions(rawSettings?.roster_positions),
      ...(currentWeek !== undefined ? { currentWeek } : {}),
      ...(boundedInteger(metadata.start_week, 1, 30) !== undefined
        ? { startWeek: boundedInteger(metadata.start_week, 1, 30) }
        : {}),
      ...(boundedInteger(metadata.end_week, 1, 30) !== undefined
        ? { endWeek: boundedInteger(metadata.end_week, 1, 30) }
        : {}),
      ...(boundedInteger(rawSettings?.playoff_start_week, 1, 30) !== undefined
        ? { playoffStartWeek: boundedInteger(rawSettings?.playoff_start_week, 1, 30) }
        : {}),
      ...(seasonComplete === undefined ? {} : { seasonComplete }),
      ...(boundedLabel(rawSettings?.draft_type, 32)
        ? { draftType: boundedLabel(rawSettings?.draft_type, 32) }
        : {}),
    };
    const draftScheduledAt = yahooDraftScheduledAt(rawSettings?.draft_time);
    return {
      id,
      platform: 'yahoo',
      name: displayName,
      displayName,
      season: Number(metadata.season) || undefined,
      teamCount: numberOrUndefined(metadata.num_teams) ?? teams.length,
      scoring,
      settings,
      teams,
      ...(draft ? { draft } : {}),
      ...(draftScheduledAt ? { draftScheduledAt } : {}),
      ...(matchups ? { matchups } : {}),
      connectedAt: new Date().toISOString(),
      ...(teams.length === 0 ? { status: 'limited' as const } : {}),
    };
  }
}

function yahooDraftScheduledAt(value: unknown): string | undefined {
  const seconds = numberOrUndefined(value);
  const earliest = Date.UTC(2000, 0, 1) / 1000;
  const latest = Date.UTC(2100, 0, 1) / 1000;
  if (
    seconds === undefined ||
    !Number.isSafeInteger(seconds) ||
    seconds < earliest ||
    seconds >= latest
  )
    return undefined;
  return new Date(seconds * 1000).toISOString();
}

async function yahooOptionalResource(path: string, accessToken: string): Promise<unknown> {
  try {
    return await fetchJson(`https://fantasysports.yahooapis.com/fantasy/v2/${path}?format=json`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Rosters and draft results are useful additions, but are not required to sync standings.
    return undefined;
  }
}

function yahooApplyRosters(teams: LeagueConnection['teams'], raw: unknown): void {
  for (const container of recordsDeep(raw)) {
    if (container.team === undefined) continue;
    const rows = recordsDeep(container.team);
    const metadata = rows.find(
      (row) => typeof row.team_key === 'string' && row.team_id !== undefined,
    );
    if (!metadata) continue;
    const team = teams.find((candidate) => candidate.id === String(metadata.team_id));
    if (!team) continue;
    const roster = rows.find((row) => row.roster !== undefined)?.roster;
    const players = recordsDeep(roster).flatMap((record) => {
      if (record.player === undefined) return [];
      const playerRows = recordsDeep(record.player);
      const player = playerRows.find(
        (row) => row.player_key !== undefined || row.player_id !== undefined,
      );
      if (!player) return [];
      const playerName = firstRecord(player.name)?.full ?? player.full_name;
      const name = boundedString(playerName, 120);
      const id = boundedString(player.player_key ?? player.player_id, 80);
      if (!name || !id) return [];
      const rosterPosition = boundedString(
        firstRecord(
          playerRows.find((row) => row.selected_position !== undefined)?.selected_position,
        )?.position,
        20,
      );
      const position = boundedString(
        firstRecord(player.primary_position)?.position ?? player.display_position,
        20,
      );
      const nflTeam = boundedString(player.editorial_team_abbr, 8);
      return [
        {
          id,
          name,
          ...(position ? { position } : {}),
          ...(rosterPosition ? { rosterPosition } : {}),
          ...(nflTeam ? { nflTeam } : {}),
        },
      ];
    });
    if (players.length) {
      team.roster = players.slice(0, 100);
      team.rosterPlayerIds = players.slice(0, 100).map((player) => player.id);
      team.rosterSize = players.length;
    }
  }
}

function yahooDraft(
  raw: unknown,
  leagueKey: string,
  teams: LeagueConnection['teams'],
): NonNullable<LeagueConnection['draft']> | undefined {
  const picks = recordsDeep(raw).flatMap((row) => {
    if (row.player_key === undefined || row.round === undefined || row.pick === undefined)
      return [];
    const teamKey = boundedString(row.team_key, 120);
    const teamId = teamKey?.split('.t.').at(-1);
    const player = firstRecord(row.player);
    const playerName = boundedString(firstRecord(player?.name)?.full ?? player?.full_name, 120);
    const id = boundedString(row.player_key, 80);
    const round = boundedInteger(row.round, 1, 100);
    const pickNumber = boundedInteger(row.pick, 1, 1000);
    if (!id || round === undefined || pickNumber === undefined) return [];
    return [
      {
        playerId: id,
        ...(playerName ? { playerName } : {}),
        ...(teamId && teams.some((team) => team.id === teamId) ? { teamId } : {}),
        round,
        pickNumber,
      },
    ];
  });
  if (!picks.length) return undefined;
  picks.sort((a, b) => a.pickNumber - b.pickNumber);
  return { id: `${leagueKey}-draft`, picks: picks.slice(0, 500) };
}

async function yahooCurrentWeekMatchups(
  leagueKey: string,
  week: number,
  accessToken: string,
): Promise<NonNullable<LeagueConnection['matchups']> | undefined> {
  try {
    const raw = await fetchJson(
      `https://fantasysports.yahooapis.com/fantasy/v2/league/${encodeURIComponent(leagueKey)}/scoreboard;week=${week}?format=json`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    const matchups: NonNullable<LeagueConnection['matchups']> = [];
    for (const row of recordsDeep(raw)) {
      const teamCollection = asRecord(row.teams);
      if (!teamCollection) continue;
      const teams = Object.values(teamCollection).flatMap((entry) => {
        const nested = recordsDeep(entry);
        const metadata = nested.find(
          (value) => value.team_key !== undefined && value.team_id !== undefined,
        );
        if (!metadata) return [];
        const scoreData = nested.find((value) => value.team_points !== undefined);
        const points = numberOrUndefined(firstRecord(scoreData?.team_points)?.total);
        return [
          {
            teamId: String(metadata.team_id),
            ...(points !== undefined ? { points } : {}),
          },
        ];
      });
      if (teams.length === 2) matchups.push({ week, teams });
    }
    return matchups.length ? matchups : undefined;
  } catch {
    // Scoreboard data is supplemental; an unavailable week must not break league access.
    return undefined;
  }
}
function yahooTeams(standings: Record<string, unknown> | undefined) {
  const unique = new Map<
    string,
    {
      metadata: Record<string, unknown>;
      standingsData: Record<string, unknown> | undefined;
      manager: Record<string, unknown> | undefined;
    }
  >();
  const teamGroups = recordsDeep(standings).flatMap((container) => {
    if (container.team === undefined) return [];
    const nested = recordsDeep(container.team);
    const metadata = nested.find(
      (row) => typeof row.team_key === 'string' && row.team_id !== undefined,
    );
    if (!metadata) return [];
    const standingsData = nested.find((row) => asRecord(row.team_standings));
    const manager = nested.find((row) => typeof row.nickname === 'string');
    return [{ metadata, standingsData, manager }];
  });
  if (teamGroups.length > 32)
    throw new Error('Yahoo league returned more than 32 teams; refusing oversized league data.');
  for (const group of teamGroups) {
    const teamId = boundedId(group.metadata.team_id, 40);
    const teamKey = boundedId(group.metadata.team_key, 128);
    if (!teamId || !teamKey) continue;
    unique.set(teamKey, group);
  }
  return [...unique.values()].map(({ metadata, standingsData, manager }) => {
    const result = firstRecord(standingsData?.team_standings);
    const outcome = firstRecord(result?.outcome);
    const owner = boundedLabel(manager?.nickname);
    return {
      id: boundedId(metadata.team_id, 40)!,
      name: boundedDisplayName(metadata.name, `Team ${boundedId(metadata.team_id, 40)}`),
      ...(owner ? { owner } : {}),
      wins: numberOrUndefined(outcome?.wins),
      losses: numberOrUndefined(outcome?.losses),
      pointsFor: numberOrUndefined(result?.points_for),
    };
  });
}
function yahooScoring(settings: Record<string, unknown> | undefined): Record<string, number> {
  if (!settings) return {};
  const names = new Map<string, string>();
  for (const row of recordsDeep(settings.stat_categories)) {
    if (row.stat_id !== undefined) {
      const id = boundedId(row.stat_id, 40);
      const name = boundedLabel(row.display_name ?? row.name, 120);
      if (id) names.set(id, name ?? id);
    }
  }
  const scoring: Record<string, number> = {};
  for (const row of recordsDeep(settings.stat_modifiers)) {
    const value = numberOrUndefined(row.value);
    const id = boundedId(row.stat_id, 40);
    if (id && value !== undefined) {
      scoring[names.get(id) ?? id] = value;
    }
  }
  return scoring;
}
