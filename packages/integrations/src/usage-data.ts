import { depthPosition, snapKey, type DepthEntry } from '@sidekick/core';
import { parsePersonnelSnaps } from './game-personnel.js';
import { readBoundedText } from './http.js';

const releaseRoot = 'https://github.com/nflverse/nflverse-data/releases/download';

export interface UsageSnapshot {
  /** Offensive snap share by name, team and game (see snapKey). */
  snaps: Map<string, number>;
  /** Skill-position depth listings by nflverse player ID, current season only. */
  depth: Map<string, DepthEntry[]>;
}

/**
 * Parses an nflverse depth-chart file into skill-position listings. Dated files (2025 onward)
 * keep the last snapshot of each day; older weekly files keep each week's chart.
 */
export function parseDepthCharts(csv: string, season: number): Map<string, DepthEntry[]> {
  const lines = csv.split('\n');
  const header = lines[0]?.split(',') ?? [];
  const col = (name: string) => header.indexOf(name);
  const dated = col('dt') >= 0;
  const [idCol, posCol, rankCol, dtCol, weekCol] = dated
    ? [col('gsis_id'), col('pos_abb'), col('pos_rank'), col('dt'), -1]
    : [col('gsis_id'), col('depth_position'), col('depth_team'), -1, col('week')];
  if (idCol < 0 || posCol < 0 || rankCol < 0) throw new Error('Unrecognized depth chart file.');
  const byKey = new Map<string, DepthEntry & { id: string }>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(',');
    const id = cells[idCol];
    const pos = depthPosition(cells[posCol]);
    const rank = Number(cells[rankCol]);
    if (!id || !/^\d{2}-\d{7}$/.test(id) || !pos || !Number.isInteger(rank) || rank < 1 || rank > 9)
      continue;
    if (dated) {
      const at = cells[dtCol];
      if (!at || !/^\d{4}-\d{2}-\d{2}T/.test(at)) continue;
      const key = `${id}:${pos}:${at.slice(0, 10)}`;
      const previous = byKey.get(key);
      // Keep the day's last snapshot, and the better rank when one snapshot lists two slots.
      if (!previous || at > previous.at! || (at === previous.at && rank < previous.rank))
        byKey.set(key, { id, pos, rank, at });
    } else {
      const week = Number(cells[weekCol]);
      if (!Number.isInteger(week) || week < 1 || week > 22) continue;
      const key = `${id}:${pos}:${week}`;
      const previous = byKey.get(key);
      if (!previous || rank < previous.rank) byKey.set(key, { id, pos, rank, season, week });
    }
  }
  const depth = new Map<string, DepthEntry[]>();
  for (const { id, ...entry } of byKey.values()) depth.set(id, [...(depth.get(id) ?? []), entry]);
  return depth;
}

/** Snap counts (three seasons) and the current depth chart, cached for twelve hours. */
export class PublicUsageData {
  private cache = new Map<number, { until: number; value: Promise<UsageSnapshot> }>();
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}
  get(season: number): Promise<UsageSnapshot> {
    const hit = this.cache.get(season);
    if (hit && hit.until > this.now()) return hit.value;
    const value = this.load(season);
    this.cache.set(season, { until: this.now() + 12 * 3_600_000, value });
    // A failed load is retried on the next request rather than cached.
    value.catch(() => this.cache.delete(season));
    return value;
  }
  private async text(url: string, maxBytes: number) {
    const response = await this.fetcher(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Usage data is unavailable.');
    }
    return readBoundedText(response, maxBytes);
  }
  private async load(season: number): Promise<UsageSnapshot> {
    if (!Number.isInteger(season) || season < 2012 || season > 2099)
      throw new Error('Invalid usage season.');
    const seasons = [season - 2, season - 1, season];
    const [snapFiles, depthFile] = await Promise.all([
      Promise.allSettled(
        seasons.map((s) =>
          this.text(`${releaseRoot}/snap_counts/snap_counts_${s}.csv`, 12_000_000).then((csv) =>
            parsePersonnelSnaps(csv, s),
          ),
        ),
      ),
      this.text(`${releaseRoot}/depth_charts/depth_charts_${season}.csv`, 150_000_000)
        .then((csv) => parseDepthCharts(csv, season))
        .catch(() => new Map<string, DepthEntry[]>()),
    ]);
    const snaps = new Map<string, number>();
    for (const file of snapFiles)
      if (file.status === 'fulfilled')
        for (const row of file.value)
          snaps.set(snapKey(row.name, row.team, row.gameId), row.offense);
    return { snaps, depth: depthFile };
  }
}
