import {
  footballStatKeys,
  kickingStatKeys,
  defenseStatKeys,
  type FootballDataSnapshot,
  type FootballGame,
  type PlayerGameStats,
  type PlayerMarketActivity,
} from '@sidekick/core';
import { readBoundedJson, readBoundedText } from './http.js';
import { csvRecords } from './football-csv.js';
import { PublicTeamDefenseData } from './team-defense-data.js';
import { nflDraftPicksUrl, parseNFLDraftPicks } from './nfl-draft-data.js';

const releaseRoot = 'https://github.com/nflverse/nflverse-data/releases/download';
const ttlMs = 6 * 60 * 60 * 1_000;
const retryMs = 5 * 60 * 1_000;

export function playerStatsUrl(season: number): string {
  validateSeason(season);
  return `${releaseRoot}/stats_player/stats_player_week_${season}.csv`;
}
export const footballScheduleUrl = `${releaseRoot}/schedules/games.csv`;

/** Fixed public endpoints only. One cache serves advice requests without polling or keys. */
export class PublicFootballData {
  private cache = new Map<
    number,
    { loadedAt: number; retryAfter: number; data: FootballDataSnapshot }
  >();
  private inFlight = new Map<number, Promise<FootballDataSnapshot>>();
  private readonly defenses: PublicTeamDefenseData;
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {
    this.defenses = new PublicTeamDefenseData(fetcher, now);
  }

  async get(season: number): Promise<FootballDataSnapshot> {
    validateSeason(season);
    const cached = this.cache.get(season);
    if (cached && (this.now() < cached.retryAfter || this.now() - cached.loadedAt < ttlMs))
      return cached.data;
    const running = this.inFlight.get(season);
    if (running) return running;
    const task = this.load(season, cached?.data.games)
      .then((fresh) => {
        const failed =
          fresh.refreshFailed || fresh.sources.some((source) => source.status === 'unavailable');
        delete fresh.refreshFailed;
        // Preserve evidence dates when a source is down rather than relabel old values as fresh.
        if (cached) {
          for (const source of fresh.sources.filter((item) => item.status === 'unavailable')) {
            const previous = cached.data.sources.find(
              (item) => item.id === source.id && item.status === 'available',
            );
            if (
              !previous ||
              source.id.startsWith('dst-') ||
              source.id.startsWith('espn-forecasts-')
            )
              continue;
            if (source.id.startsWith('stats-')) {
              const year = Number(source.id.slice(6));
              fresh.players.push(
                ...cached.data.players.filter((row) => row.season === year && !row.sourceIds),
              );
            } else if (source.id === 'games') fresh.games = cached.data.games;
            else if (source.id === 'nfl-draft-picks' && cached.data.draftPicks)
              fresh.draftPicks = cached.data.draftPicks;
            else if (source.id === 'market-add' || source.id === 'market-drop') {
              const key = source.id === 'market-add' ? 'adds' : 'drops';
              for (const activity of cached.data.market) {
                if (activity[key] === undefined) continue;
                let target = fresh.market.find((item) => item.sleeperId === activity.sleeperId);
                if (!target) {
                  target = { sleeperId: activity.sleeperId, lookbackHours: 24 };
                  fresh.market.push(target);
                }
                target[key] = activity[key];
              }
            }
            Object.assign(source, previous);
            fresh.warnings.push(
              `${source.name} could not refresh; cached values retain their original date.`,
            );
          }
        }
        this.cache.delete(season);
        this.cache.set(season, {
          loadedAt: failed ? this.now() - ttlMs : this.now(),
          retryAfter: failed ? this.now() + retryMs : 0,
          data: fresh,
        });
        while (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value!);
        return fresh;
      })
      .finally(() => this.inFlight.delete(season));
    this.inFlight.set(season, task);
    return task;
  }
  /** Explicit result checks use freshly retrieved observed stats after final-event verification. */
  async outcomes(season: number, finalGames: FootballGame[] = []): Promise<FootballDataSnapshot> {
    validateSeason(season);
    const url = playerStatsUrl(season);
    const response = await this.fetcher(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { accept: 'text/csv' },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Observed player outcomes are unavailable.');
    }
    const players = parsePlayerGameStats(await readBoundedText(response, 12_000_000), season);
    const observedAt = new Date(this.now()).toISOString();
    const defense = finalGames.length ? await this.defenses.get(season, finalGames) : undefined;
    return {
      season,
      players: [...players, ...(defense?.players ?? [])],
      games: finalGames,
      market: [],
      warnings: defense?.warnings ?? [],
      sources: [
        {
          id: `stats-${season}`,
          name: `nflverse observed player outcomes ${season}`,
          url,
          status: 'available',
          retrievedAt: observedAt,
        },
        ...(defense?.sources ?? []),
      ],
    };
  }

  private async load(
    season: number,
    cachedGames?: FootballGame[],
  ): Promise<FootballDataSnapshot & { refreshFailed?: boolean }> {
    const years = [season, season - 1, season - 2].filter((year) => year >= 2010);
    const resources = [
      ...years.map((year) => ({
        id: `stats-${year}`,
        name: `nflverse weekly player stats ${year}`,
        url: playerStatsUrl(year),
        kind: 'stats',
        year,
      })),
      {
        id: 'nfl-draft-picks',
        name: 'nflverse NFL draft picks (via Pro Football Reference)',
        url: nflDraftPicksUrl,
        kind: 'draft-picks',
        year: season,
      },
      {
        id: 'games',
        name: 'nflverse schedules and results',
        url: footballScheduleUrl,
        kind: 'games',
        year: season,
      },
      ...(['add', 'drop'] as const).map((kind) => ({
        id: `market-${kind}`,
        name: `Sleeper ${kind} activity (24 hours)`,
        url: `https://api.sleeper.app/v1/players/nfl/trending/${kind}?lookback_hours=24&limit=100`,
        kind,
        year: season,
      })),
    ];
    const result: FootballDataSnapshot = {
      season,
      players: [],
      games: [],
      market: [],
      sources: [],
      warnings: [],
    };
    const loaded = await Promise.allSettled(
      resources.map(async (resource) => {
        const response = await this.fetcher(resource.url, {
          signal: AbortSignal.timeout(20_000),
          headers: {
            accept:
              resource.kind === 'add' || resource.kind === 'drop' ? 'application/json' : 'text/csv',
          },
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error('Public football data is unavailable.');
        }
        if (resource.kind === 'add' || resource.kind === 'drop')
          return {
            market: parsePlayerMarket(await readBoundedJson(response, 100_000), resource.kind),
          };
        const csv = await readBoundedText(
          response,
          resource.kind === 'games' || resource.kind === 'draft-picks' ? 6_000_000 : 12_000_000,
        );
        return resource.kind === 'draft-picks'
          ? { draftPicks: parseNFLDraftPicks(csv, season) }
          : resource.kind === 'games'
            ? { games: parseFootballGames(csv) }
            : { players: parsePlayerGameStats(csv, resource.year) };
      }),
    );
    loaded.forEach((item, index) => {
      const resource = resources[index]!;
      result.sources.push({
        id: resource.id,
        name: resource.name,
        url: resource.url,
        status: item.status === 'fulfilled' ? 'available' : 'unavailable',
        ...(item.status === 'fulfilled' ? { retrievedAt: new Date(this.now()).toISOString() } : {}),
      });
      if (item.status === 'rejected') {
        result.warnings.push(`${resource.name} is unavailable; no values were invented.`);
        return;
      }
      if (item.value.players) result.players.push(...item.value.players);
      if (item.value.games) result.games = item.value.games;
      if (item.value.draftPicks) result.draftPicks = item.value.draftPicks;
      for (const activity of item.value.market ?? []) {
        const existing = result.market.find((row) => row.sleeperId === activity.sleeperId);
        if (existing) Object.assign(existing, activity);
        else result.market.push(activity);
      }
    });
    const defense = await this.defenses.get(
      season,
      result.games.length ? result.games : (cachedGames ?? []),
    );
    result.players.push(...defense.players);
    result.sources.push(...defense.sources);
    result.warnings.push(...defense.warnings);
    // The app makes its own projections; ESPN forecasts are only a research benchmark now.
    return { ...result, refreshFailed: defense.refreshFailed };
  }
}

export function parsePlayerGameStats(csv: string, season: number): PlayerGameStats[] {
  validateSeason(season);
  const records = csvRecords(csv, [
    'player_id',
    'player_display_name',
    'position',
    'season',
    'week',
    'season_type',
    'game_id',
    'team',
    'opponent_team',
    // Older snapshots can omit these newly used volume columns; missing stays unknown.
    ...footballStatKeys.filter(
      (key) =>
        key !== 'attempts' &&
        key !== 'completions' &&
        !kickingFields.has(key) &&
        !defenseFields.has(key),
    ),
  ]);
  const result: PlayerGameStats[] = [];
  const seen = new Set<string>();
  for (const row of records) {
    // nflverse includes unattributed team events with no player identity. They cannot
    // support player advice, so exclude them rather than joining blank identities.
    if (!row.player_id && !row.player_display_name && !row.position) continue;
    if (integer(row.season, 2010, 2099) !== season)
      throw new Error('Player stats season did not match the requested source.');
    if (row.season_type !== 'REG' && row.season_type !== 'POST')
      throw new Error('Unknown player stats season type.');
    const playerId = label(row.player_id, 40),
      gameId = label(row.game_id, 80);
    const identity = `${playerId}:${gameId}`;
    if (seen.has(identity)) throw new Error('Player stats contained duplicate player/game rows.');
    seen.add(identity);
    const stats: PlayerGameStats['stats'] = {};
    for (const key of footballStatKeys.filter((key) => !defenseFields.has(key))) {
      const value = optionalNumber(row[key], key.endsWith('_yards') ? -1_000 : 0, 2_000);
      if (
        value !== undefined &&
        kickingFields.has(key) &&
        (!Number.isInteger(value) || value > (key === 'fg_made_distance' ? 2_000 : 20))
      )
        throw new Error('Kicking statistics contained an invalid count.');
      if (value !== undefined) stats[key] = value;
    }
    for (const prefix of ['fg', 'pat'] as const) {
      const attempted = stats[`${prefix}_att`];
      const outcomes = [
        stats[`${prefix}_made`],
        stats[`${prefix}_missed`],
        stats[`${prefix}_blocked`],
      ];
      if (
        attempted !== undefined &&
        outcomes.every((value) => value !== undefined) &&
        outcomes.reduce<number>((sum, value) => sum + value!, 0) !== attempted
      )
        throw new Error('Kicking outcomes did not match their attempt count.');
    }
    const blockedFieldGoalDistances = kickDistances(row.fg_blocked_list, stats.fg_blocked);
    const madeFieldGoalDistances = kickDistances(row.fg_made_list, stats.fg_made);
    if (
      madeFieldGoalDistances &&
      stats.fg_made_distance !== undefined &&
      madeFieldGoalDistances.reduce((sum, distance) => sum + distance, 0) !== stats.fg_made_distance
    )
      throw new Error('Kicking distances did not match their total.');
    result.push({
      playerId,
      gameId,
      season,
      name: label(row.player_display_name, 120),
      position: label(row.position, 12),
      team: label(row.team, 8),
      opponent: label(row.opponent_team, 8),
      week: integer(row.week, 1, 30),
      seasonType: row.season_type,
      stats,
      ...(blockedFieldGoalDistances ? { blockedFieldGoalDistances } : {}),
      ...(madeFieldGoalDistances ? { madeFieldGoalDistances } : {}),
      ...usageFrom(row),
    });
  }
  if (!result.length) throw new Error('Player stats contained no usable rows.');
  return result;
}

/** Optional opportunity columns; absent or invalid values stay unknown rather than zero. */
function usageFrom(row: Record<string, string | undefined>) {
  const read = (value: string | undefined, min: number, max: number) => {
    try {
      return optionalNumber(value, min, max);
    } catch {
      return undefined;
    }
  };
  const targetShare = read(row.target_share, 0, 1);
  const receivingAirYards = read(row.receiving_air_yards, -300, 2_000);
  const usage = {
    ...(targetShare !== undefined ? { targetShare } : {}),
    ...(receivingAirYards !== undefined ? { receivingAirYards } : {}),
  };
  return Object.keys(usage).length ? { usage } : {};
}
const kickingFields = new Set<string>(kickingStatKeys);
const defenseFields = new Set<string>(defenseStatKeys);
function kickDistances(raw: string | undefined, count: number | undefined): number[] | undefined {
  if (raw === undefined || raw === 'NA' || raw === '') return count === 0 ? [] : undefined;
  // Current CSVs use semicolons; the provider dictionary also documents commas.
  if (raw.length > 160 || !/^\d{1,3}(?:[;,]\d{1,3}){0,19}$/.test(raw))
    throw new Error('Kicking distances contained an invalid list.');
  const distances = raw.split(/[;,]/).map(Number);
  if (distances.some((distance) => distance < 1 || distance > 100))
    throw new Error('Kicking distances were out of range.');
  if (count !== undefined && distances.length !== count)
    throw new Error('Kicking distances did not match their count.');
  return distances;
}

export function parseFootballGames(csv: string): FootballGame[] {
  const records = csvRecords(csv, [
    'game_id',
    'season',
    'week',
    'game_type',
    'gameday',
    'home_team',
    'away_team',
    'home_score',
    'away_score',
    'spread_line',
    'total_line',
  ]);
  if (!records.length) throw new Error('Schedule contained no games.');
  const seen = new Set<string>();
  return records.map((row) => {
    const id = label(row.game_id, 80);
    if (seen.has(id)) throw new Error('Schedule contained duplicate games.');
    seen.add(id);
    const date = label(row.gameday, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error('Schedule contained an invalid date.');
    const game: FootballGame = {
      id,
      season: integer(row.season, 1990, 2099),
      week: integer(row.week, 1, 30),
      seasonType: label(row.game_type, 8),
      date,
      home: label(row.home_team, 8),
      away: label(row.away_team, 8),
    };
    for (const [source, output] of [
      ['stadium_id', 'stadiumId'],
      ['stadium', 'stadiumName'],
      ['home_qb_name', 'homeQuarterbackName'],
      ['away_qb_name', 'awayQuarterbackName'],
    ] as const) {
      if (row[source] && row[source] !== 'NA')
        game[output] = label(row[source], output === 'stadiumId' ? 20 : 120);
    }
    for (const [source, output] of [
      ['home_qb_id', 'homeQuarterbackId'],
      ['away_qb_id', 'awayQuarterbackId'],
    ] as const) {
      if (row[source] && row[source] !== 'NA') {
        if (!/^\d{2}-\d{7}$/.test(row[source]))
          throw new Error('Invalid archived quarterback identity.');
        game[output] = row[source];
      }
    }
    const kickoffAt = nflverseKickoff(date, row.gametime);
    if (kickoffAt) game.kickoffAt = kickoffAt;
    if (row.location && row.location !== 'NA') {
      if (!['Home', 'Neutral'].includes(row.location)) throw new Error('Invalid schedule venue.');
      game.neutralSite = row.location === 'Neutral';
    }
    if (row.espn && row.espn !== 'NA') {
      if (!/^\d{9}$/.test(row.espn)) throw new Error('Invalid schedule ESPN identity.');
      game.espnId = row.espn;
    }
    for (const [field, output, min, max] of [
      ['home_score', 'homeScore', 0, 100],
      ['away_score', 'awayScore', 0, 100],
      ['spread_line', 'spreadLine', -100, 100],
      ['total_line', 'totalLine', 0, 200],
    ] as const) {
      const value = optionalNumber(row[field], min, max);
      if (value !== undefined) game[output] = value;
    }
    const archived: NonNullable<FootballGame['archivedOdds']> = {};
    for (const [field, key] of [
      ['home_moneyline', 'homeMoneyline'],
      ['away_moneyline', 'awayMoneyline'],
      ['home_spread_odds', 'homeSpreadOdds'],
      ['away_spread_odds', 'awaySpreadOdds'],
      ['over_odds', 'overOdds'],
      ['under_odds', 'underOdds'],
    ] as const) {
      const value = optionalNumber(row[field], -100000, 100000);
      if (value !== undefined && Number.isInteger(value) && Math.abs(value) >= 100)
        archived[key] = value;
    }
    if (Object.keys(archived).length) game.archivedOdds = archived;
    return game;
  });
}

const kickoffFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
/** nflverse documents gametime in Eastern time, including international games. */
export function nflverseKickoff(day: string, time: string | undefined): string | undefined {
  if (
    !time ||
    !/^\d{2}:\d{2}$/.test(time) ||
    Number(time.slice(0, 2)) > 23 ||
    Number(time.slice(3)) > 59
  )
    return;
  const local = Date.parse(`${day}T${time}:00Z`);
  if (!Number.isFinite(local) || new Date(local).toISOString().slice(0, 10) !== day) return;
  const wall = (instant: number) => {
    const p = Object.fromEntries(
      kickoffFormat.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
    );
    return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  };
  let instant = local;
  for (let i = 0; i < 3; i++) instant += local - wall(instant);
  if (
    wall(instant) !== local ||
    wall(instant - 3_600_000) === local ||
    wall(instant + 3_600_000) === local
  )
    return;
  return new Date(instant).toISOString();
}

export function parsePlayerMarket(input: unknown, kind: 'add' | 'drop'): PlayerMarketActivity[] {
  if (!Array.isArray(input) || input.length > 100)
    throw new Error('Invalid Sleeper market activity.');
  const seen = new Set<string>();
  return input.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid Sleeper market activity row.');
    const id = label(row.player_id, 40);
    if (
      seen.has(id) ||
      typeof row.count !== 'number' ||
      !Number.isSafeInteger(row.count) ||
      row.count < 0 ||
      row.count > 100_000_000
    )
      throw new Error('Invalid Sleeper market activity count.');
    seen.add(id);
    return { sleeperId: id, lookbackHours: 24, [kind === 'add' ? 'adds' : 'drops']: row.count };
  });
}

function validateSeason(season: number) {
  if (!Number.isInteger(season) || season < 2010 || season > 2099)
    throw new Error('Choose a football data season between 2010 and 2099.');
}
function label(input: unknown, limit: number): string {
  if (
    typeof input !== 'string' ||
    !input.trim() ||
    input.length > limit ||
    /[\u0000-\u001f\u007f]/.test(input)
  )
    throw new Error('Invalid public football data label.');
  return input.trim();
}
function optionalNumber(input: unknown, min: number, max: number): number | undefined {
  if (input === '' || input === 'NA' || input === undefined) return undefined;
  if (typeof input !== 'string' || !/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(input.trim()))
    throw new Error('Invalid public football numeric value.');
  const value = Number(input);
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error('Public football numeric value exceeded bounds.');
  return value;
}
function integer(input: unknown, min: number, max: number): number {
  const value = optionalNumber(input, min, max);
  if (value === undefined || !Number.isInteger(value))
    throw new Error('Invalid public football integer.');
  return value;
}
