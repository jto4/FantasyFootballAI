import type { LeagueConnection, LeagueConnector, RosterPlayer } from '@sidekick/core';
import { normalizeScoring } from '@sidekick/core';
import { readBoundedJson } from '../http.js';
import {
  asRecord,
  boundedInteger,
  boundedDisplayName,
  boundedId,
  boundedLabel,
  boundedRosterPositions,
  boundedString,
  fetchJson,
  numberOrUndefined,
  validIds,
} from './shared.js';

const sleeperPlayerCatalogTtlMs = 24 * 60 * 60 * 1_000;
const sleeperPlayerCatalogMaxBytes = 20_000_000;

/** Sleeper asks clients to cache this large reference dataset and fetch it at most daily. */
export class SleeperPlayerCatalog {
  private loadedAt = 0;
  private retryAfter = 0;
  private players = new Map<string, RosterPlayer>();
  private inFlight: Promise<Map<string, RosterPlayer>> | undefined;

  constructor(private readonly now: () => number = Date.now) {}

  async get(): Promise<Map<string, RosterPlayer>> {
    if (this.players.size && this.now() - this.loadedAt < sleeperPlayerCatalogTtlMs)
      return this.players;
    if (this.now() < this.retryAfter) return this.players;
    if (!this.inFlight) {
      this.inFlight = this.fetchPlayers().finally(() => {
        this.inFlight = undefined;
      });
    }
    try {
      return await this.inFlight;
    } catch (error) {
      // A previously loaded catalog remains useful during a transient outage.
      this.retryAfter = this.now() + 60_000;
      if (this.players.size) {
        return this.players;
      }
      throw error;
    }
  }

  private async fetchPlayers(): Promise<Map<string, RosterPlayer>> {
    const response = await fetch('https://api.sleeper.app/v1/players/nfl', {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Sleeper player catalog request failed (${response.status})`);
    const raw = asRecord(await readBoundedJson(response, sleeperPlayerCatalogMaxBytes));
    if (!raw) throw new Error('Sleeper player catalog response was invalid.');
    const players = new Map<string, RosterPlayer>();
    for (const [id, item] of Object.entries(raw).slice(0, 25_000)) {
      const player = asRecord(item);
      if (!player) continue;
      const firstName = boundedString(player.first_name, 80);
      const lastName = boundedString(player.last_name, 80);
      const name =
        boundedString(player.full_name, 120) || [firstName, lastName].filter(Boolean).join(' ');
      if (!name) continue;
      const position = boundedString(player.position, 12);
      const nflTeam = boundedString(player.team, 8);
      const status = boundedString(player.status, 32);
      players.set(id, {
        id,
        name,
        ...(position ? { position } : {}),
        ...(nflTeam ? { nflTeam } : {}),
        ...(status ? { status } : {}),
      });
    }
    if (players.size === 0) throw new Error('Sleeper player catalog contained no usable players.');
    this.players = players;
    this.loadedAt = this.now();
    this.retryAfter = 0;
    return players;
  }
}

const sharedSleeperPlayerCatalog = new SleeperPlayerCatalog();

export class SleeperConnector implements LeagueConnector {
  platform = 'sleeper' as const;
  async fetchLeague(id: string): Promise<LeagueConnection> {
    const [rawLeague, rawRosters, rawUsers] = await Promise.all([
      fetchJson(`https://api.sleeper.app/v1/league/${encodeURIComponent(id)}`),
      fetchJson(`https://api.sleeper.app/v1/league/${encodeURIComponent(id)}/rosters`),
      fetchJson(`https://api.sleeper.app/v1/league/${encodeURIComponent(id)}/users`),
    ]);
    const league = asRecord(rawLeague);
    if (!league || typeof league.name !== 'string')
      throw new Error('Sleeper league was not found or is inaccessible.');
    const displayName = boundedDisplayName(league.name, `Sleeper League ${id}`);
    const rawSettings = asRecord(league.settings) ?? {};
    const rawSeasonStatus = boundedString(league.status, 24)?.toLowerCase();
    const seasonStatus =
      rawSeasonStatus &&
      ['pre_draft', 'drafting', 'in_season', 'post_season', 'complete', 'archived'].includes(
        rawSeasonStatus,
      )
        ? rawSeasonStatus
        : undefined;
    const rosters = Array.isArray(rawRosters) ? rawRosters : [];
    const users = Array.isArray(rawUsers) ? rawUsers : [];
    if (rosters.length > 32 || users.length > 256)
      throw new Error('Sleeper league returned oversized roster or manager data.');
    const userById = new Map(
      users.map((user) => {
        const value = asRecord(user);
        return [
          boundedId(value?.user_id, 128) ?? '',
          boundedLabel(value?.display_name ?? value?.username),
        ] as const;
      }),
    );
    const rosterRows = rosters.map((entry, index) => {
      const roster = asRecord(entry) ?? {};
      const ownerId = boundedId(roster.owner_id, 128) ?? '';
      const manager = boundedLabel(userById.get(ownerId));
      const rosterId = boundedId(roster.roster_id, 40) ?? String(index);
      const record = asRecord(roster.settings) ?? {};
      const rosterPlayerIds = validIds(roster.players);
      const pointsWhole = numberOrUndefined(record.fpts);
      const pointsFraction = boundedInteger(record.fpts_decimal, 0, 99) ?? 0;
      return {
        id: rosterId,
        name: manager ?? `Team ${index + 1}`,
        owner: manager ?? 'Manager',
        wins: numberOrUndefined(record.wins),
        losses: numberOrUndefined(record.losses),
        ...(pointsWhole !== undefined ? { pointsFor: pointsWhole + pointsFraction / 100 } : {}),
        rosterSize: rosterPlayerIds.length || undefined,
        ...(rosterPlayerIds.length ? { rosterPlayerIds } : {}),
      };
    });
    const playerCatalogPromise = sharedSleeperPlayerCatalog.get().catch(() => undefined);
    const [playerCatalog, weeklyMatchups, draft] = await Promise.all([
      playerCatalogPromise,
      sleeperCurrentWeekMatchups(id, Number(league.season) || undefined),
      sleeperLeagueDraft(
        id,
        boundedString(league.draft_id, 128),
        Number(league.season) || undefined,
        playerCatalogPromise,
      ),
    ]);
    const teams = rosterRows.map((team) => ({
      ...team,
      ...(playerCatalog && team.rosterPlayerIds
        ? {
            roster: team.rosterPlayerIds.flatMap((playerId) => {
              const player = playerCatalog!.get(playerId);
              return player ? [player] : [];
            }),
          }
        : {}),
    }));
    const scoring = normalizeScoring(asRecord(league.scoring_settings) ?? {});
    return {
      id,
      platform: 'sleeper',
      name: displayName,
      displayName,
      season: Number(league.season) || undefined,
      teamCount: Number(league.total_rosters) || teams.length,
      scoring,
      settings: {
        roster_positions: boundedRosterPositions(league.roster_positions),
        ...(boundedInteger(rawSettings.playoff_week_start, 1, 30) !== undefined
          ? { playoff_week_start: boundedInteger(rawSettings.playoff_week_start, 1, 30) }
          : {}),
        ...(boundedInteger(rawSettings.playoff_teams, 2, 32) !== undefined
          ? { playoff_teams: boundedInteger(rawSettings.playoff_teams, 2, 32) }
          : {}),
        ...(seasonStatus ? { seasonStatus } : {}),
        ...(weeklyMatchups ? { currentWeek: weeklyMatchups.week } : {}),
      },
      teams,
      ...(draft ? { draft } : {}),
      ...(weeklyMatchups ? { matchups: weeklyMatchups.matchups } : {}),
      connectedAt: new Date().toISOString(),
    };
  }
}

async function sleeperLeagueDraft(
  leagueId: string,
  draftIdHint: string | undefined,
  leagueSeason: number | undefined,
  playerCatalogPromise: Promise<Map<string, RosterPlayer> | undefined>,
): Promise<LeagueConnection['draft']> {
  try {
    let draftId = draftIdHint;
    let metadata: Record<string, unknown> | undefined;
    if (!draftId) {
      const drafts = await fetchJson(
        `https://api.sleeper.app/v1/league/${encodeURIComponent(leagueId)}/drafts`,
      );
      if (!Array.isArray(drafts)) return undefined;
      const candidate = drafts
        .map(asRecord)
        .filter((item): item is Record<string, unknown> => !!item)
        .find((item) => {
          const season = numberOrUndefined(item.season);
          return (
            typeof item.draft_id === 'string' &&
            (!leagueSeason || season === undefined || season === leagueSeason)
          );
        });
      draftId = boundedString(candidate?.draft_id, 128);
      metadata = candidate;
    }
    if (!draftId) return undefined;

    const [draftDetails, rawPicks, playerCatalog] = await Promise.all([
      fetchJson(`https://api.sleeper.app/v1/draft/${encodeURIComponent(draftId)}`).catch(
        () => undefined,
      ),
      fetchJson(`https://api.sleeper.app/v1/draft/${encodeURIComponent(draftId)}/picks`),
      playerCatalogPromise,
    ]);
    const details = asRecord(draftDetails) ?? metadata;
    const responseLeagueId = boundedString(details?.league_id, 128);
    if (responseLeagueId && responseLeagueId !== leagueId) return undefined;
    const season = numberOrUndefined(details?.season);
    if (leagueSeason && season && season !== leagueSeason) return undefined;
    if (!Array.isArray(rawPicks)) return undefined;
    const picks = rawPicks.slice(0, 500).flatMap((entry) => {
      const row = asRecord(entry);
      const playerId = boundedString(row?.player_id, 40);
      if (!row || !playerId) return [];
      const pickMetadata = asRecord(row.metadata);
      const fromCatalog = playerCatalog?.get(playerId);
      const metadataName = [
        boundedString(pickMetadata?.first_name, 80),
        boundedString(pickMetadata?.last_name, 80),
      ]
        .filter(Boolean)
        .join(' ');
      const playerName = fromCatalog?.name || metadataName || undefined;
      const teamId = boundedString(row.roster_id, 40);
      const round = boundedInteger(row.round, 1, 100);
      const pickNumber = boundedInteger(row.pick_no, 1, 1_000);
      const draftSlot = boundedInteger(row.draft_slot, 1, 100);
      const position = boundedString(pickMetadata?.position, 12) || fromCatalog?.position;
      const nflTeam = boundedString(pickMetadata?.team, 8) || fromCatalog?.nflTeam;
      return [
        {
          playerId,
          ...(playerName ? { playerName } : {}),
          ...(teamId ? { teamId } : {}),
          ...(round ? { round } : {}),
          ...(pickNumber ? { pickNumber } : {}),
          ...(draftSlot ? { draftSlot } : {}),
          ...(position ? { position } : {}),
          ...(nflTeam ? { nflTeam } : {}),
          ...(typeof row.is_keeper === 'boolean' ? { isKeeper: row.is_keeper } : {}),
        },
      ];
    });
    const status = boundedString(details?.status, 32);
    const startTime = numberOrUndefined(details?.start_time);
    const scheduledAt =
      startTime !== undefined &&
      Number.isSafeInteger(startTime) &&
      startTime >= Date.UTC(2000, 0, 1) &&
      startTime < Date.UTC(2100, 0, 1)
        ? new Date(startTime).toISOString()
        : undefined;
    if (!picks.length && !scheduledAt && !status) return undefined;
    return {
      id: draftId,
      ...(status ? { status } : {}),
      ...(season ? { season } : {}),
      ...(scheduledAt ? { scheduledAt } : {}),
      picks,
    };
  } catch {
    // Draft history is supplemental; incomplete or unavailable draft data must not block league sync.
    return undefined;
  }
}

async function sleeperCurrentWeekMatchups(
  leagueId: string,
  leagueSeason?: number,
): Promise<{ week: number; matchups: NonNullable<LeagueConnection['matchups']> } | undefined> {
  try {
    const state = asRecord(await fetchJson('https://api.sleeper.app/v1/state/nfl'));
    const season = numberOrUndefined(state?.season);
    const week = numberOrUndefined(state?.display_week) ?? numberOrUndefined(state?.week);
    // Avoid attaching this season's games to a prior-year or future-dated league.
    if (!week || !season || (leagueSeason && season !== leagueSeason)) return undefined;
    const raw = await fetchJson(
      `https://api.sleeper.app/v1/league/${encodeURIComponent(leagueId)}/matchups/${week}`,
    );
    if (!Array.isArray(raw)) return undefined;
    const byMatchup = new Map<string, NonNullable<LeagueConnection['matchups']>[number]['teams']>();
    for (const entry of raw) {
      const row = asRecord(entry);
      if (!row || row.matchup_id === null || row.matchup_id === undefined) continue;
      const key = String(row.matchup_id);
      const teams = byMatchup.get(key) ?? [];
      const rosterId = numberOrUndefined(row.roster_id);
      if (rosterId === undefined) continue;
      const points = numberOrUndefined(row.points);
      teams.push({
        teamId: String(rosterId),
        ...(points !== undefined ? { points } : {}),
        ...(Array.isArray(row.players)
          ? {
              playerIds: row.players
                .filter(
                  (player): player is string | number =>
                    typeof player === 'string' || typeof player === 'number',
                )
                .map(String),
            }
          : {}),
        ...(Array.isArray(row.starters)
          ? {
              // Preserve invalid/empty slots so reports do not mistake a partial lineup for a full one.
              starters: row.starters.map((player) =>
                typeof player === 'string' || typeof player === 'number' ? String(player) : '',
              ),
            }
          : {}),
      });
      byMatchup.set(key, teams);
    }
    return {
      week,
      matchups: [...byMatchup.values()]
        .filter((teams) => teams.length === 2)
        .map((teams) => ({ week, teams })),
    };
  } catch {
    // Matchup data is supplemental; retain the league connection when this endpoint is unavailable.
    return undefined;
  }
}
