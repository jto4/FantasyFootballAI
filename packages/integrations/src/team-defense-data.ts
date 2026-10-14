import {
  nflTeamKey,
  type FootballGame,
  type FootballDataSource,
  type FootballStatKey,
  type PlayerGameStats,
} from '@sidekick/core';
import { csvRecords } from './football-csv.js';
import { readBoundedJson, readBoundedText } from './http.js';
import {
  defenseSummaryUrl,
  parseOffensiveFumbleProof,
  type OffensiveFumbleProof,
} from './defense-offense-proof.js';

const teams = new Set(
  'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LA LAC LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(
    ' ',
  ),
);
const ttl = 6 * 3600000;
const retry = 5 * 60000;
const events: Record<string, FootballStatKey> = {
  sack: 'dst_sacks',
  int: 'dst_interceptions',
  fum_rec: 'dst_fumble_recoveries',
  def_td: 'dst_touchdowns',
  def_st_td: 'dst_special_teams_touchdowns',
  def_st_fum_rec: 'dst_special_teams_fumble_recoveries',
  ff: 'dst_forced_fumbles',
  def_st_ff: 'dst_special_teams_forced_fumbles',
  safe: 'dst_safeties',
  blk_kick: 'dst_blocked_kicks',
  pts_allow: 'dst_points_allowed',
  yds_allow: 'dst_yards_allowed',
};
const zeroFields = [
  'def_sacks',
  'def_interceptions',
  'def_safeties',
  'def_fumbles_forced',
  'fumble_recovery_opp',
  'def_tds',
  'special_teams_tds',
  'fumble_recovery_tds',
  'def_punt_blocks',
  'def_pat_blocks',
  'def_fg_blocks',
] as const;
type TeamTotals = {
  team: string;
  opponent: string;
  gameId: string;
  week: number;
  stats: Partial<Record<(typeof zeroFields)[number], number>>;
};
type Cached = { value: unknown; source: FootballDataSource; loadedAt: number; retryAfter: number };

export function teamStatsUrl(season: number) {
  validSeason(season);
  return `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${season}.csv`;
}
export function defenseStatsUrl(season: number, week: number) {
  validSeason(season);
  if (!Number.isInteger(week) || week < 1 || week > 18) throw new Error('Invalid defense week.');
  return `https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular&position[]=DEF`;
}
function validSeason(season: number) {
  if (!Number.isInteger(season) || season < 2010 || season > 2099)
    throw new Error('Invalid defense season.');
}
function teamKey(input: unknown): string {
  if (typeof input !== 'string' || input.length > 8) throw new Error('Invalid defense team.');
  const team = nflTeamKey(input);
  if (!teams.has(team)) throw new Error('Unknown defense team.');
  return team;
}
function count(input: unknown, max = 100): number {
  if (typeof input !== 'number' || !Number.isInteger(input) || input < 0 || input > max)
    throw new Error('Invalid defense statistic.');
  return input;
}

export function parseTeamDefenseTotals(csv: string, season: number): TeamTotals[] {
  validSeason(season);
  const rows = csvRecords(csv, [
    'season',
    'week',
    'season_type',
    'team',
    'opponent_team',
    'game_id',
    ...zeroFields,
  ]);
  if (rows.length > 600) throw new Error('Too many defense totals.');
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (row.season !== String(season)) throw new Error('Defense totals season mismatch.');
    if (row.season_type === 'POST') return [];
    if (row.season_type !== 'REG') throw new Error('Unknown defense season type.');
    const team = teamKey(row.team),
      opponent = teamKey(row.opponent_team),
      week = count(Number(row.week), 18);
    if (
      !week ||
      team === opponent ||
      !row.game_id ||
      row.game_id.length > 80 ||
      /[\u0000-\u001f\u007f]/.test(row.game_id)
    )
      throw new Error('Invalid defense totals identity.');
    const id = `${team}:${week}`;
    if (seen.has(id)) throw new Error('Duplicate defense totals.');
    seen.add(id);
    const stats: TeamTotals['stats'] = {};
    for (const key of zeroFields) {
      const raw = row[key];
      if (raw === '' || raw === 'NA') continue;
      if (!raw || !/^\d+(?:\.0+)?$/.test(raw)) throw new Error('Invalid defense total.');
      stats[key] = count(Number(raw));
    }
    return [{ team, opponent, week, gameId: row.game_id, stats }];
  });
}

/** Sparse vendor fields are unknown. Only independent zero totals or an exhaustive
 * partition with a known other component can prove a missing event was zero. */
export function parseTeamDefenseStats(
  input: unknown,
  season: number,
  week: number,
  games: FootballGame[],
  totals: TeamTotals[],
  asOf: string,
  offensiveProofs: OffensiveFumbleProof[] = [],
): PlayerGameStats[] {
  validSeason(season);
  defenseStatsUrl(season, week);
  if (!Array.isArray(input) || input.length > 32) throw new Error('Invalid defense response.');
  const seen = new Set<string>();
  return input.flatMap((raw) => {
    if (
      !raw ||
      typeof raw !== 'object' ||
      !raw.stats ||
      typeof raw.stats !== 'object' ||
      Array.isArray(raw.stats) ||
      Object.keys(raw.stats).length > 150
    )
      throw new Error('Invalid defense record.');
    if (
      raw.season !== String(season) ||
      raw.week !== week ||
      raw.season_type !== 'regular' ||
      raw.sport !== 'nfl' ||
      raw.category !== 'stat' ||
      raw.player?.position !== 'DEF'
    )
      throw new Error('Defense record scope mismatch.');
    const team = teamKey(raw.team);
    if (teamKey(raw.player_id) !== team || teamKey(raw.player.team) !== team || seen.has(team))
      throw new Error('Conflicting or duplicate defense identity.');
    seen.add(team);
    // Bye records have no appearance and no stats. They are not scoreless games.
    if (Object.keys(raw.stats).length === 0 && raw.stats.gp === undefined) return [];
    if (raw.stats.gp !== 1) throw new Error('Defense appearance is not a single played game.');
    const opponent = teamKey(raw.opponent);
    if (
      opponent === team ||
      typeof raw.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) ||
      !Number.isFinite(Date.parse(raw.date)) ||
      new Date(raw.date).toISOString().slice(0, 10) !== raw.date
    )
      throw new Error('Invalid defense game date.');
    const matched = games.filter(
      (g) =>
        g.season === season &&
        g.week === week &&
        g.seasonType === 'REG' &&
        g.date === raw.date &&
        ((nflTeamKey(g.home) === team && nflTeamKey(g.away) === opponent) ||
          (nflTeamKey(g.away) === team && nflTeamKey(g.home) === opponent)),
    );
    if (
      matched.length !== 1 ||
      matched[0]!.homeScore === undefined ||
      matched[0]!.awayScore === undefined ||
      raw.date >= asOf.slice(0, 10)
    )
      return [];
    const gameId = matched[0]!.id;
    const stats: PlayerGameStats['stats'] = {};
    for (const [key, field] of Object.entries(events)) {
      if (Object.hasOwn(raw.stats, key))
        stats[field] = count(
          raw.stats[key],
          key === 'yds_allow' ? 2000 : key === 'pts_allow' ? 150 : 100,
        );
    }
    if (raw.stats.pts_allow_0 === 1) {
      if (stats.dst_points_allowed !== undefined && stats.dst_points_allowed !== 0)
        throw new Error('Conflicting defense points allowed.');
      stats.dst_points_allowed = 0;
    }
    const independent = totals.filter(
      (r) => r.team === team && r.opponent === opponent && r.week === week && r.gameId === gameId,
    );
    let provedZero = false;
    let offensiveProofSource: string | undefined;
    if (independent.length === 1) {
      const total = independent[0]!.stats;
      const matchingProofs = offensiveProofs.filter((p) => p.gameId === gameId && p.team === team);
      const proof = matchingProofs.length === 1 ? matchingProofs[0] : undefined;
      const offensiveExhaustion =
        proof &&
        matched[0]!.espnId !== undefined &&
        proof.sourceId === `dst-offense-${matched[0]!.espnId}` &&
        Number.isInteger(proof.touchdowns) &&
        proof.touchdowns > 0 &&
        proof.touchdowns === total.fumble_recovery_tds;
      const fumbleTouchdowns = offensiveExhaustion ? 0 : total.fumble_recovery_tds;
      const prove = (field: FootballStatKey, knownZero: boolean) => {
        if (stats[field] === undefined && knownZero) {
          stats[field] = 0;
          provedZero = true;
          if (
            offensiveExhaustion &&
            (field === 'dst_touchdowns' || field === 'dst_special_teams_touchdowns')
          )
            offensiveProofSource = proof.sourceId;
        }
      };
      prove('dst_sacks', total.def_sacks === 0);
      prove('dst_interceptions', total.def_interceptions === 0);
      prove('dst_safeties', total.def_safeties === 0);
      prove(
        'dst_blocked_kicks',
        ['def_punt_blocks', 'def_pat_blocks', 'def_fg_blocks'].every(
          (k) => total[k as keyof typeof total] === 0,
        ),
      );
      const touchdownsConsistent =
        total.def_tds !== undefined &&
        total.special_teams_tds !== undefined &&
        total.fumble_recovery_tds !== undefined &&
        total.def_tds + total.special_teams_tds + (fumbleTouchdowns ?? 0) >=
          (stats.dst_touchdowns ?? 0) + (stats.dst_special_teams_touchdowns ?? 0);
      prove(
        'dst_touchdowns',
        touchdownsConsistent &&
          total.def_tds === 0 &&
          (fumbleTouchdowns === 0 ||
            (total.special_teams_tds !== undefined &&
              stats.dst_special_teams_touchdowns !== undefined &&
              stats.dst_special_teams_touchdowns - total.special_teams_tds === fumbleTouchdowns)),
      );

      prove(
        'dst_special_teams_touchdowns',
        touchdownsConsistent &&
          total.special_teams_tds === 0 &&
          (fumbleTouchdowns === 0 ||
            (total.def_tds !== undefined &&
              stats.dst_touchdowns !== undefined &&
              stats.dst_touchdowns - total.def_tds === fumbleTouchdowns)),
      );
      const recoveriesConsistent =
        total.fumble_recovery_opp !== undefined &&
        total.fumble_recovery_opp >=
          (stats.dst_fumble_recoveries ?? 0) + (stats.dst_special_teams_fumble_recoveries ?? 0);
      const forcedConsistent =
        total.def_fumbles_forced !== undefined &&
        total.def_fumbles_forced >=
          (stats.dst_forced_fumbles ?? 0) + (stats.dst_special_teams_forced_fumbles ?? 0);
      prove(
        'dst_fumble_recoveries',
        recoveriesConsistent &&
          (total.fumble_recovery_opp === 0 ||
            (stats.dst_special_teams_fumble_recoveries !== undefined &&
              total.fumble_recovery_opp === stats.dst_special_teams_fumble_recoveries)),
      );
      prove(
        'dst_special_teams_fumble_recoveries',
        recoveriesConsistent &&
          (total.fumble_recovery_opp === 0 ||
            (stats.dst_fumble_recoveries !== undefined &&
              total.fumble_recovery_opp === stats.dst_fumble_recoveries)),
      );
      // The team total counts forced fumbles across both units, unlike the split vendor counters.
      prove(
        'dst_forced_fumbles',
        forcedConsistent &&
          (total.def_fumbles_forced === 0 ||
            (stats.dst_special_teams_forced_fumbles !== undefined &&
              total.def_fumbles_forced === stats.dst_special_teams_forced_fumbles)),
      );
      prove(
        'dst_special_teams_forced_fumbles',
        forcedConsistent &&
          (total.def_fumbles_forced === 0 ||
            (stats.dst_forced_fumbles !== undefined &&
              total.def_fumbles_forced === stats.dst_forced_fumbles)),
      );
    }
    return [
      {
        playerId: `dst:${team}`,
        name: `${team} team defense`,
        position: 'DST',
        team,
        opponent,
        gameId,
        season,
        week,
        seasonType: 'REG' as const,
        stats,
        sourceIds: [
          `dst-${season}-${week}`,
          ...(provedZero ? [`dst-totals-${season}`] : []),
          ...(offensiveProofSource ? [offensiveProofSource] : []),
        ],
      },
    ];
  });
}

/** Fixed keyless URLs, at most four concurrent week reads and bounded per-resource caching. */
export class PublicTeamDefenseData {
  private cache = new Map<string, Cached>();
  private requests = 0;
  private pending = new Set<() => void>();
  private running = new Map<
    string,
    Promise<{ entry?: Cached; source: FootballDataSource; failed: boolean }>
  >();
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {}

  private async acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted || this.pending.size >= 224)
      throw new Error('Defense read budget exhausted.');
    await new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal.removeEventListener('abort', abort);
        this.requests++;
        resolve();
      };
      const abort = () => {
        this.pending.delete(grant);
        reject(new Error('Defense read budget exhausted.'));
      };
      if (this.requests < 4) grant();
      else {
        this.pending.add(grant);
        signal.addEventListener('abort', abort, { once: true });
      }
    });
    return () => {
      this.requests--;
      const next = this.pending.values().next().value;
      if (next) {
        this.pending.delete(next);
        next();
      }
    };
  }

  private async read<T>(
    source: FootballDataSource,
    parser: (response: Response) => Promise<T>,
    budget: AbortSignal,
  ) {
    const url = source.url!,
      previous = this.cache.get(url),
      now = this.now();
    if (previous && (now < previous.retryAfter || now - previous.loadedAt < ttl))
      return { entry: previous, source: previous.source, failed: now < previous.retryAfter };
    const active = this.running.get(url);
    if (active) return active;
    const task = (async () => {
      let release: (() => void) | undefined;
      try {
        const signal = AbortSignal.any([budget, AbortSignal.timeout(20000)]);
        release = await this.acquire(signal);
        if (signal.aborted) throw new Error('Defense read budget exhausted.');
        const response = await this.fetcher(url, {
          signal,
          headers: {
            accept: source.id.startsWith('dst-totals-') ? 'text/csv' : 'application/json',
          },
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error('Defense source unavailable.');
        }
        const value = await parser(response);
        const entry = {
          value,
          source: {
            ...source,
            status: 'available' as const,
            retrievedAt: new Date(this.now()).toISOString(),
          },
          loadedAt: this.now(),
          retryAfter: 0,
        };
        this.cache.delete(url);
        this.cache.set(url, entry);
        while (this.cache.size > 180) this.cache.delete(this.cache.keys().next().value!);
        return { entry, source: entry.source, failed: false };
      } catch {
        if (previous) {
          previous.retryAfter = this.now() + retry;
          return { entry: previous, source: previous.source, failed: true };
        }
        const entry = {
          value: undefined,
          source,
          loadedAt: this.now() - ttl,
          retryAfter: this.now() + retry,
        };
        this.cache.set(url, entry);
        while (this.cache.size > 180) this.cache.delete(this.cache.keys().next().value!);
        return { source, failed: true };
      } finally {
        release?.();
      }
    })().finally(() => this.running.delete(url));
    this.running.set(url, task);
    return task;
  }

  async get(season: number, games: FootballGame[]) {
    validSeason(season);
    const budget = AbortSignal.timeout(60000);
    const result: {
      players: PlayerGameStats[];
      sources: FootballDataSource[];
      warnings: string[];
      refreshFailed: boolean;
    } = { players: [], sources: [], warnings: [], refreshFailed: false };
    const completed = games.filter(
      (g) =>
        g.season >= Math.max(2021, season - 2) &&
        g.season <= season &&
        g.seasonType === 'REG' &&
        Number.isInteger(g.week) &&
        g.week >= 1 &&
        g.week <= 18 &&
        g.homeScore !== undefined &&
        g.awayScore !== undefined &&
        g.date < new Date(this.now()).toISOString().slice(0, 10),
    );
    const years = [...new Set(completed.map((g) => g.season))].sort();
    const record = (loaded: { source: FootballDataSource; failed: boolean }) => {
      result.sources.push(loaded.source);
      result.refreshFailed ||= loaded.failed;
      if (loaded.failed)
        result.warnings.push(
          `${loaded.source.name} could not refresh; ${loaded.source.status === 'available' ? 'cached values retain their original date' : 'missing values remain unknown'}.`,
        );
    };
    const totals = new Map<number, TeamTotals[]>();
    await Promise.all(
      years.map(async (year) => {
        const loaded = await this.read(
          {
            id: `dst-totals-${year}`,
            name: `nflverse team totals ${year} (D/ST zero verification)`,
            url: teamStatsUrl(year),
            status: 'unavailable',
          },
          async (r) => parseTeamDefenseTotals(await readBoundedText(r, 1000000), year),
          budget,
        );
        record(loaded);
        totals.set(year, (loaded.entry?.value as TeamTotals[] | undefined) ?? []);
      }),
    );
    const weeks = [...new Set(completed.map((g) => `${g.season}:${g.week}`))]
      .map((key) => key.split(':').map(Number) as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const loadedWeeks: {
      raw?: unknown;
      players: PlayerGameStats[];
      source: FootballDataSource;
      failed: boolean;
    }[] = [];
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, weeks.length) }, async () => {
        while (cursor < weeks.length) {
          const index = cursor++,
            [year, week] = weeks[index]!;
          const loaded = await this.read(
            {
              id: `dst-${year}-${week}`,
              name: `Sleeper published D/ST stats ${year} week ${week}`,
              url: defenseStatsUrl(year, week),
              status: 'unavailable',
            },
            async (r) => {
              const value = await readBoundedJson(r, 256000);
              // Validate before caching so a malformed refresh cannot replace known evidence.
              parseTeamDefenseStats(
                value,
                year,
                week,
                games,
                [],
                new Date(this.now()).toISOString(),
              );
              return value;
            },
            budget,
          );
          loadedWeeks[index] = {
            raw: loaded.entry?.value,
            source: loaded.source,
            failed: loaded.failed,
            players:
              loaded.entry?.value === undefined
                ? []
                : parseTeamDefenseStats(
                    loaded.entry.value,
                    year,
                    week,
                    games,
                    totals.get(year) ?? [],
                    new Date(this.now()).toISOString(),
                  ),
          };
        }
      }),
    );
    // Only unresolved positive fumble-TD totals need a second source. Cap extra
    // reads and provenance; the existing advice source/byte budget still applies.
    const unresolved = loadedWeeks
      .flatMap((w) => w.players)
      .filter(
        (p) =>
          p.stats.dst_touchdowns === undefined ||
          p.stats.dst_special_teams_touchdowns === undefined,
      );
    const candidates = completed
      .filter(
        (g) =>
          g.espnId &&
          unresolved.some((p) => p.gameId === g.id) &&
          (totals.get(g.season) ?? []).some(
            (t) =>
              t.gameId === g.id &&
              t.stats.fumble_recovery_tds !== undefined &&
              t.stats.fumble_recovery_tds > 0,
          ),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    if (candidates.length > 12)
      result.warnings.push(
        'Only the twelve most recent unresolved fumble-touchdown games were checked; other missing defense counters remain unknown.',
      );
    const proofs: OffensiveFumbleProof[] = [];
    await Promise.all(
      candidates.slice(0, 12).map(async (game) => {
        const loaded = await this.read(
          {
            id: `dst-offense-${game.espnId!}`,
            name: `ESPN ${game.away} at ${game.home}, ${game.date} (offensive fumble-TD verification)`,
            url: defenseSummaryUrl(game.espnId!),
            status: 'unavailable',
          },
          async (r) => {
            const raw = await readBoundedJson(r, 1000000);
            parseOffensiveFumbleProof(raw, game);
            return raw;
          },
          budget,
        );
        if (loaded.entry?.value !== undefined) {
          try {
            proofs.push(...parseOffensiveFumbleProof(loaded.entry.value, game));
          } catch {
            record({ source: { ...loaded.source, status: 'unavailable' }, failed: true });
            return;
          }
        }
        record(loaded);
      }),
    );
    for (const loaded of loadedWeeks) {
      record(loaded);
      const year = loaded.players[0]?.season,
        week = loaded.players[0]?.week;
      result.players.push(
        ...(proofs.length && year && week && loaded.raw !== undefined
          ? parseTeamDefenseStats(
              loaded.raw,
              year,
              week,
              games,
              totals.get(year) ?? [],
              new Date(this.now()).toISOString(),
              proofs,
            )
          : loaded.players),
      );
    }
    return result;
  }
}
