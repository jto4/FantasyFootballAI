import { nflTeamKey, type FootballGame } from '@sidekick/core';
import { readBoundedText } from './http.js';
import type { NFLInjuryReportRow } from './injuries.js';
const nicknames: Record<string, string> = {
  CARDINALS: 'ARI',
  FALCONS: 'ATL',
  RAVENS: 'BAL',
  BILLS: 'BUF',
  PANTHERS: 'CAR',
  BEARS: 'CHI',
  BENGALS: 'CIN',
  BROWNS: 'CLE',
  COWBOYS: 'DAL',
  BRONCOS: 'DEN',
  LIONS: 'DET',
  PACKERS: 'GB',
  TEXANS: 'HOU',
  COLTS: 'IND',
  JAGUARS: 'JAX',
  CHIEFS: 'KC',
  RAMS: 'LA',
  CHARGERS: 'LAC',
  RAIDERS: 'LV',
  DOLPHINS: 'MIA',
  VIKINGS: 'MIN',
  PATRIOTS: 'NE',
  SAINTS: 'NO',
  GIANTS: 'NYG',
  JETS: 'NYJ',
  EAGLES: 'PHI',
  STEELERS: 'PIT',
  SEAHAWKS: 'SEA',
  '49ERS': 'SF',
  BUCCANEERS: 'TB',
  TITANS: 'TEN',
  COMMANDERS: 'WAS',
};
const clean = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&#(?:x([a-f0-9]+)|(\d+));/gi, (_, hex, decimal) =>
      String.fromCodePoint(Math.min(0x10ffff, parseInt(hex ?? decimal, hex ? 16 : 10))),
    )
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .trim();
const instant = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s.slice(0, 10);
export interface OfficialGameInjuries {
  season: number;
  week: number;
  updatedAt: string;
  rows: NFLInjuryReportRow[];
  teams: string[];
  url: string;
}
/** The latest article modification applies to its entire current body; an earlier publication date cannot authorize later edits. */
export function parseOfficialGameInjuries(
  html: string,
  url: string,
  season: number,
): OfficialGameInjuries | undefined {
  if (html.length > 1500000 || !/^https:\/\/www\.nfl\.com\/news\/[a-z0-9-]+$/.test(url)) return;
  const metadata = [
    ...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ]
    .flatMap((m) => {
      try {
        const x: unknown = JSON.parse(m[1]!);
        return x && typeof x === 'object' && !Array.isArray(x)
          ? [x as Record<string, unknown>]
          : [];
      } catch {
        return [];
      }
    })
    .filter((x) => x['@type'] === 'NewsArticle');
  if (metadata.length !== 1) return;
  const m = metadata[0]!,
    headline = String(m.headline ?? ''),
    weekMatch = /\bWeek (\d{1,2}) injury report\b/i.exec(headline);
  if (
    !weekMatch ||
    !instant(m.datePublished) ||
    !instant(m.dateModified) ||
    Date.parse(m.dateModified) < Date.parse(m.datePublished)
  )
    return;
  const week = Number(weekMatch[1]),
    published = Date.parse(m.datePublished),
    start = Date.UTC(season, 7, 1),
    end = Date.UTC(season + 1, 1, 15);
  if (week < 1 || week > 18 || published < start || published >= end) return;
  const updatedAt = new Date(m.dateModified).toISOString(),
    sections = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h[123]\b|$)/gi)],
    rows: NFLInjuryReportRow[] = [],
    teams: string[] = [];
  for (const section of sections) {
    const team = nicknames[clean(section[1]!).toUpperCase()];
    if (!team) continue;
    if (teams.includes(team)) return;
    const entries = [...section[2]!.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((x) =>
      clean(x[1]!),
    );
    let valid = false,
      malformed = false;
    for (const entry of entries) {
      if (/^No injury designations\.?$/i.test(entry)) {
        valid = true;
        continue;
      }
      const status = /^(OUT|DOUBTFUL|QUESTIONABLE):\s*(.+)$/i.exec(entry);
      if (!status) continue;
      const players = status[2]!.split(/,\s*(?=[A-Z]{1,5}\s)/);
      for (const player of players) {
        const match = /^([A-Z]{1,5})\s+([^()]+?)\s*(?:\([^)]*\))?\s*$/.exec(player);
        if (
          !match ||
          !match[2]!.trim() ||
          match[2]!.length > 120 ||
          /[\u0000-\u001f]/.test(match[2]!)
        ) {
          malformed = true;
          continue;
        }
        valid = true;
        rows.push({
          season,
          week,
          team,
          position: match[1]!,
          fullName: match[2]!.trim(),
          seasonType: 'REG',
          updatedAt,
          sourceUrl: url,
          reportStatus: status[1]![0]! + status[1]!.slice(1).toLowerCase(),
          reportInjury: '',
          practiceStatus: '',
          practiceInjury: '',
        });
      }
    }
    // Partial malformed team lists are withheld rather than silently understating absences.
    if (malformed) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.team === team) rows.splice(i, 1);
    } else if (valid) teams.push(team);
  }
  if (!teams.length || teams.length > 32 || rows.length > 500) return;
  return { season, week, updatedAt, rows, teams, url };
}
export function officialInjuriesForGame(
  reports: OfficialGameInjuries[],
  game: FootballGame,
  asOf: string,
) {
  return reports
    .filter(
      (r) =>
        r.season === game.season &&
        r.week === game.week &&
        Date.parse(r.updatedAt) <= Date.parse(asOf) &&
        Date.parse(r.updatedAt) >= Date.parse(game.kickoffAt ?? '') - 7 * 86400000,
    )
    .flatMap((r) =>
      r.rows.filter((row) => [game.home, game.away].some((t) => nflTeamKey(t) === row.team)),
    );
}
/** Fixed NFL origin; only bounded same-origin news slugs discovered from the publisher's month index are followed. */
export async function fetchOfficialGameInjuries(
  season: number,
  months: number[],
  fetcher: typeof fetch = fetch,
): Promise<OfficialGameInjuries[]> {
  if (
    !Number.isInteger(season) ||
    season < 2025 ||
    season > 2099 ||
    months.length > 5 ||
    months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)
  )
    throw new Error('Invalid official report range.');
  const links = new Set<string>();
  for (const month of months) {
    const year = month === 1 ? season + 1 : season;
    try {
      const r = await fetcher(`https://www.nfl.com/sitemap/html/articles/${year}/${month}`, {
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!r.ok) {
        await r.body?.cancel();
        continue;
      }
      const html = await readBoundedText(r, 1500000);
      for (const m of html.matchAll(/<a\b[^>]*href="(\/news\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi))
        if (/\bWeek \d{1,2} injury report\b/i.test(clean(m[2]!)))
          links.add(`https://www.nfl.com${m[1]}`);
    } catch {
      /* A missing month remains unavailable, not an empty health report. */
    }
  }
  if (links.size > 24) throw new Error('Official report discovery exceeds limit.');
  const list = [...links],
    results: OfficialGameInjuries[] = [];
  let index = 0;
  const work = async () => {
    for (;;) {
      const url = list[index++];
      if (!url) return;
      try {
        const r = await fetcher(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
        if (!r.ok) {
          await r.body?.cancel();
          continue;
        }
        const report = parseOfficialGameInjuries(await readBoundedText(r, 1500000), url, season);
        if (report) results.push(report);
      } catch {
        /* Fail closed on changed article shape or unavailable publisher. */
      }
    }
  };
  await Promise.all([work(), work()]);
  return results;
}
