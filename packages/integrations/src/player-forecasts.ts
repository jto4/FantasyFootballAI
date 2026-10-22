import type { FootballDataSource, FootballStatKey, PublicPlayerForecast } from '@sidekick/core';
import { readBoundedJson } from './http.js';
import { asRecord } from './platforms/shared.js';

const positions: Record<number, string> = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE' };
// Verified against ESPN's public NFL team registry; IDs are provider metadata only.
const teams: Record<number, string> = {
  22: 'ARI',
  1: 'ATL',
  33: 'BAL',
  2: 'BUF',
  29: 'CAR',
  3: 'CHI',
  4: 'CIN',
  5: 'CLE',
  6: 'DAL',
  7: 'DEN',
  8: 'DET',
  9: 'GB',
  34: 'HOU',
  11: 'IND',
  30: 'JAX',
  12: 'KC',
  13: 'LV',
  24: 'LAC',
  14: 'LAR',
  15: 'MIA',
  16: 'MIN',
  17: 'NE',
  18: 'NO',
  19: 'NYG',
  20: 'NYJ',
  21: 'PHI',
  23: 'PIT',
  25: 'SF',
  26: 'SEA',
  27: 'TB',
  10: 'TEN',
  28: 'WAS',
};
const fields: Record<string, FootballStatKey> = {
  0: 'attempts',
  3: 'passing_yards',
  4: 'passing_tds',
  20: 'passing_interceptions',
  19: 'passing_2pt_conversions',
  23: 'carries',
  24: 'rushing_yards',
  25: 'rushing_tds',
  26: 'rushing_2pt_conversions',
  42: 'receiving_yards',
  43: 'receiving_tds',
  44: 'receiving_2pt_conversions',
  53: 'receptions',
  58: 'targets',
  69: 'sack_fumbles_lost',
  70: 'rushing_fumbles_lost',
  71: 'receiving_fumbles_lost',
};
const defaults: Record<string, number> = {
  3: 0.04,
  4: 4,
  20: -2,
  24: 0.1,
  25: 6,
  42: 0.1,
  43: 6,
  53: 1,
  72: -2,
};
const numeric = (v: unknown, max = 100000) =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
const integer = (v: unknown, min: number, max: number) =>
  Number.isInteger(v) && Number(v) >= min && Number(v) <= max;

export function publicPlayerForecastUrl(season: number) {
  if (!integer(season, 2021, 2099)) throw new Error('Invalid public forecast season.');
  return `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info&view=mSettings&view=mStatus`;
}
export function publicPlayerForecastFilter(season: number, offset: number) {
  publicPlayerForecastUrl(season);
  if (![0, 100, 200, 300, 400].includes(offset)) throw new Error('Invalid public forecast page.');
  return JSON.stringify({
    players: {
      limit: 100,
      offset,
      filterStatsForExternalIds: {
        value: [season, ...Array.from({ length: 18 }, (_, i) => Number(`${season}${i + 1}`))],
      },
      filterStatsForSourceIds: { value: [1] },
      filterStatsForSplitTypeIds: { value: [0, 1] },
      sortAppliedStatTotal: { sortAsc: false, sortPriority: 1, value: `10${season}` },
      filterSlotIds: { value: [0, 2, 4, 6] },
    },
  });
}

/** Sparse forecast categories represent the publisher's expected zero, never observed zero.
 * Verify its complete scoring formula before normalizing, and ignore season aggregates. */
export function parsePublicPlayerForecasts(
  value: unknown,
  season: number,
  sourceId: string,
): PublicPlayerForecast[] {
  publicPlayerForecastUrl(season);
  if (!new RegExp(`^espn-forecasts-${season}-(?:0|100|200|300|400)$`).test(sourceId))
    throw new Error('Invalid forecast source.');
  const root = asRecord(value),
    scoring = asRecord(asRecord(root?.settings)?.scoringSettings);
  const items = scoring?.scoringItems;
  if (
    !root ||
    root.seasonId !== season ||
    !integer(root.scoringPeriodId, 0, 18) ||
    !Array.isArray(root.players) ||
    root.players.length > 100 ||
    !Array.isArray(items) ||
    !items.length ||
    items.length > 100
  )
    throw new Error('Invalid public forecast scope.');
  const rules = new Map<string, { points: number; overrides: Record<string, number> }>();
  for (const item of items) {
    const r = asRecord(item),
      overrides = asRecord(r?.pointsOverrides);
    if (
      !r ||
      !integer(r.statId, 0, 999) ||
      typeof r.points !== 'number' ||
      !Number.isFinite(r.points) ||
      Math.abs(r.points) > 100 ||
      r.isReverseItem !== false ||
      !overrides ||
      Object.keys(overrides).length > 32 ||
      rules.has(String(r.statId))
    )
      throw new Error('Invalid forecast scoring definition.');
    for (const [key, weight] of Object.entries(overrides))
      if (
        !/^\d{1,2}$/.test(key) ||
        typeof weight !== 'number' ||
        !Number.isFinite(weight) ||
        Math.abs(weight) > 100
      )
        throw new Error('Invalid forecast position scoring.');
    rules.set(String(r.statId), {
      points: r.points,
      overrides: overrides as Record<string, number>,
    });
  }
  if (Object.entries(defaults).some(([key, weight]) => rules.get(key)?.points !== weight))
    throw new Error('Unexpected default forecast scoring.');
  const result: PublicPlayerForecast[] = [],
    identities = new Set<number>();
  for (const wrapper of root.players) {
    const entry = asRecord(wrapper),
      p = asRecord(entry?.player);
    if (
      !p ||
      !integer(p.id, 1, 99999999) ||
      entry?.id !== p.id ||
      identities.has(Number(p.id)) ||
      typeof p.fullName !== 'string' ||
      !p.fullName.trim() ||
      p.fullName.length > 120 ||
      /[\u0000-\u001f\u007f]/.test(p.fullName) ||
      !Array.isArray(p.stats) ||
      p.stats.length > 40
    )
      throw new Error('Invalid forecast player identity.');
    identities.add(Number(p.id));
    const position = positions[Number(p.defaultPositionId)],
      team = teams[Number(p.proTeamId)];
    if (!position || !team || p.active !== true) continue;
    const weeks = new Set<number>();
    for (const item of p.stats) {
      const r = asRecord(item);
      if (!r || r.seasonId !== season || r.statSourceId !== 1)
        throw new Error('Foreign public forecast record.');
      if (r.statSplitTypeId === 0) continue;
      if (r.statSplitTypeId !== 1) throw new Error('Unknown forecast split.');
      if (
        !integer(r.scoringPeriodId, 1, 18) ||
        r.externalId !== `${season}${r.scoringPeriodId}` ||
        r.id !== `11${season}${r.scoringPeriodId}` ||
        weeks.has(Number(r.scoringPeriodId))
      )
        throw new Error('Invalid weekly forecast scope.');
      weeks.add(Number(r.scoringPeriodId));
      const raw = asRecord(r.stats);
      if (
        !raw ||
        Object.keys(raw).length > 160 ||
        typeof r.appliedTotal !== 'number' ||
        !Number.isFinite(r.appliedTotal) ||
        Math.abs(r.appliedTotal) > 1000 ||
        Object.entries(raw).some(([key, value]) => !/^\d{1,3}$/.test(key) || !numeric(value))
      )
        throw new Error('Invalid projected statistic.');
      // Derived category fantasy points and unused regression fields may be negative, and the
      // publisher's model emits tiny negative event expectations (about -0.01 touchdowns).
      // Those round to zero below; a materially negative event count is still rejected.
      // Net yardage may be negative. Never expose unknown numeric IDs.
      if (
        Object.keys(fields).some(
          (key) => !['3', '24', '42'].includes(key) && Number(raw[key] ?? 0) < -0.05,
        )
      )
        throw new Error('Invalid projected event count.');
      if (!Object.keys(raw).length) continue;
      const total = [...rules].reduce(
        (sum, [key, rule]) =>
          sum +
          Number(raw[key] ?? 0) * (rule.overrides[String(p.defaultPositionId)] ?? rule.points),
        0,
      );
      if (
        Math.abs(total - Number(r.appliedTotal)) > 0.0001 ||
        Math.abs(
          Number(raw['72'] ?? 0) -
            ['69', '70', '71'].reduce((sum, key) => sum + Number(raw[key] ?? 0), 0),
        ) > 0.0001
      )
        throw new Error('Projected statistics do not reconcile.');
      const stats = Object.fromEntries(
        Object.entries(fields).map(([key, field]) => {
          const value = Number(raw[key] ?? 0);
          return [field, ['3', '24', '42'].includes(key) ? value : Math.max(0, value)];
        }),
      );
      result.push({
        espnId: String(p.id),
        name: p.fullName.trim(),
        position,
        team,
        season,
        week: Number(r.scoringPeriodId),
        issuedWeek: Number(root.scoringPeriodId),
        stats,
        sourceId,
      });
    }
  }
  return result;
}

type Snapshot = {
  playerForecasts: PublicPlayerForecast[];
  sources: FootballDataSource[];
  warnings: string[];
};
export class PublicPlayerForecasts {
  private cache = new Map<number, { at: number; retry: number; value: Snapshot }>();
  private inFlight = new Map<number, Promise<Snapshot>>();
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {}
  async get(season: number): Promise<Snapshot> {
    publicPlayerForecastUrl(season);
    const old = this.cache.get(season);
    if (old && this.now() < old.retry) return old.value;
    if (this.inFlight.has(season)) return this.inFlight.get(season)!;
    const pending = this.load(season, old?.value)
      .then((value) => {
        this.cache.delete(season);
        this.cache.set(season, {
          at: this.now(),
          retry: this.now() + (value.warnings.length ? 300000 : 21600000),
          value,
        });
        while (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value!);
        return value;
      })
      .finally(() => this.inFlight.delete(season));
    this.inFlight.set(season, pending);
    return pending;
  }
  private async load(season: number, previous?: Snapshot): Promise<Snapshot> {
    const value: Snapshot = { playerForecasts: [], sources: [], warnings: [] };
    const deadline = AbortSignal.timeout(45000);
    // Fixed five pages, at most three concurrent reads and 30 MB per cache refresh.
    for (const offsets of [
      [0, 100, 200],
      [300, 400],
    ]) {
      const results = await Promise.allSettled(
        offsets.map(async (offset) => {
          const response = await this.fetcher(publicPlayerForecastUrl(season), {
            signal: AbortSignal.any([deadline, AbortSignal.timeout(20000)]),
            headers: {
              accept: 'application/json',
              'x-fantasy-filter': publicPlayerForecastFilter(season, offset),
            },
          });
          if (!response.ok) {
            await response.body?.cancel();
            throw new Error('Public forecasts unavailable.');
          }
          const id = `espn-forecasts-${season}-${offset}`;
          return {
            rows: parsePublicPlayerForecasts(await readBoundedJson(response, 6000000), season, id),
            retrievedAt: new Date(this.now()).toISOString(),
          };
        }),
      );
      for (const [index, result] of results.entries()) {
        const id = `espn-forecasts-${season}-${offsets[index]}`;
        const source: FootballDataSource = {
          id,
          name: `ESPN weekly player forecasts · page ${Number(offsets[index]) / 100 + 1}`,
          url: publicPlayerForecastUrl(season),
          status: 'unavailable',
        };
        if (result.status === 'fulfilled') {
          value.playerForecasts.push(...result.value.rows);
          Object.assign(source, { status: 'available', retrievedAt: result.value.retrievedAt });
        } else {
          const cached = previous?.sources.find((s) => s.id === id && s.status === 'available');
          if (cached) {
            Object.assign(source, cached);
            value.playerForecasts.push(
              ...previous!.playerForecasts.filter((r) => r.sourceId === id),
            );
          }
          value.warnings.push(
            'ESPN player forecasts could not refresh; missing forecasts remain unknown and cached rows retain their original source date.',
          );
        }
        value.sources.push(source);
      }
    }
    // Changing pagination can repeat an identity. Withhold all conflicting player/week rows.
    const counts = new Map<string, number>();
    for (const row of value.playerForecasts) {
      const key = `${row.espnId}:${row.week}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if ([...counts.values()].some((count) => count > 1))
      value.warnings.push(
        'Public forecast pagination repeated a player/week; ambiguous forecasts were withheld.',
      );
    value.playerForecasts = value.playerForecasts.filter(
      (r) => counts.get(`${r.espnId}:${r.week}`) === 1,
    );
    value.warnings = [...new Set(value.warnings)];
    return value;
  }
}
