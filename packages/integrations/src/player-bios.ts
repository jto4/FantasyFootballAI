import type { PlayerBio, PlayerBios } from '@sidekick/core';
import { cachedDownload } from './download-cache.js';
import { csvRecords } from './football-csv.js';

export const nflPlayersUrl =
  'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv';
const gsisPattern = /^(?:00-\d{7}|[A-Z]{3}\d{6})$/;
const positions = new Set(['QB', 'RB', 'WR', 'TE']);

function year(raw: string | undefined) {
  return raw && /^\d{4}$/.test(raw) && Number(raw) >= 1980 && Number(raw) <= 2099
    ? Number(raw)
    : undefined;
}

/**
 * Keeps only what dynasty values use: identity, birth date, first season and NFL draft slot for
 * skill players active in the last few seasons (or drafted and yet to play).
 */
export function parsePlayerBios(csv: string, season: number): PlayerBio[] {
  const rows = csvRecords(csv, [
    'gsis_id',
    'display_name',
    'position',
    'birth_date',
    'rookie_season',
    'last_season',
    'draft_year',
    'draft_pick',
    'espn_id',
  ]);
  if (rows.length > 40_000) throw new Error('Too many NFL player records.');
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const gsisId = row.gsis_id ?? '';
    if (!gsisPattern.test(gsisId) || seen.has(gsisId) || !positions.has(row.position ?? ''))
      return [];
    const draftYear = year(row.draft_year);
    const rookieSeason = year(row.rookie_season) ?? draftYear;
    const lastSeason = year(row.last_season);
    if ((lastSeason ?? rookieSeason ?? 0) < season - 3) return [];
    const name = (row.display_name ?? '').trim();
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) return [];
    seen.add(gsisId);
    const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(row.birth_date ?? '') ? row.birth_date : undefined;
    const pick = /^\d{1,3}$/.test(row.draft_pick ?? '') ? Number(row.draft_pick) : undefined;
    const espnId = /^\d{1,12}$/.test(row.espn_id ?? '') ? row.espn_id : undefined;
    return [
      {
        gsisId,
        name,
        position: row.position!,
        ...(espnId ? { espnId } : {}),
        ...(birthDate ? { birthDate } : {}),
        ...(rookieSeason ? { rookieSeason } : {}),
        ...(pick && pick >= 1 && pick <= 300 ? { draftPick: pick } : {}),
      },
    ];
  });
}

/** Player bios from nflverse, through the download cache and kept in memory for six hours. */
export class PublicPlayerBios {
  private cached?: { season: number; at: number; bios: PlayerBios };
  private inFlight: Promise<PlayerBios> | undefined;
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async get(season: number): Promise<PlayerBios> {
    if (this.cached?.season === season && this.now() - this.cached.at < 6 * 3_600_000)
      return this.cached.bios;
    this.inFlight ??= this.load(season).finally(() => (this.inFlight = undefined));
    return this.inFlight;
  }

  private async load(season: number): Promise<PlayerBios> {
    const download = await cachedDownload(nflPlayersUrl, {
      fetcher: this.fetcher,
      now: this.now,
      accept: 'text/csv',
      timeoutMs: 30_000,
      maxBytes: 12_000_000,
      staleFallback: true,
      parse: (csv) => parsePlayerBios(csv, season),
      // The raw file is ~7 MB; the kept fields are a small fraction of it.
      derive: {
        version: `bios-v1-${season}`,
        encode: (bios) => bios,
        decode: (stored) => {
          if (!Array.isArray(stored) || stored.length > 40_000)
            throw new Error('Saved player bios are invalid.');
          // The cache file is local but still re-checked before use.
          return stored.filter(
            (bio): bio is PlayerBio =>
              Boolean(bio) &&
              typeof bio.gsisId === 'string' &&
              gsisPattern.test(bio.gsisId) &&
              typeof bio.name === 'string' &&
              positions.has(bio.position),
          );
        },
      },
    });
    const bios: PlayerBios = { byGsis: new Map(), byEspn: new Map() };
    for (const bio of download.value) {
      bios.byGsis.set(bio.gsisId, bio);
      if (bio.espnId) bios.byEspn.set(bio.espnId, bio);
    }
    this.cached = { season, at: this.now(), bios };
    return bios;
  }
}
