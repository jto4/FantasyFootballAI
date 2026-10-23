import { nflTeamKey, type FootballGame } from '@sidekick/core';
import { verifiedPregameTeams } from './sportsbook-lines.js';
import { readBoundedJson } from './http.js';
import type { NFLInjuryReportRow } from './injuries.js';
const object = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
/** Dated publisher statuses on a verified pregame event. IR/general roster states are not converted to game Out designations. */
export function parseDatedGameInjuries(
  value: unknown,
  game: FootballGame,
  asOf: string,
): NFLInjuryReportRow[] {
  const verified = verifiedPregameTeams(value, game, asOf),
    body = object(value),
    groups = body.injuries;
  if (!Array.isArray(groups) || groups.length > 2) throw new Error('Invalid game injury groups.');
  const seen = new Set<string>(),
    result: NFLInjuryReportRow[] = [];
  for (const raw of groups) {
    const group = object(raw),
      team = object(group.team),
      id = String(team.id ?? '');
    const home = id === String(verified.home.id),
      away = id === String(verified.away.id);
    if (
      (!home && !away) ||
      seen.has(id) ||
      nflTeamKey(String(team.abbreviation)) !== nflTeamKey(home ? game.home : game.away) ||
      !Array.isArray(group.injuries) ||
      group.injuries.length > 100
    )
      throw new Error('Mismatched game injury team.');
    seen.add(id);
    for (const rawInjury of group.injuries) {
      const r = object(rawInjury),
        a = object(r.athlete),
        position = object(a.position),
        date = r.date;
      if (
        typeof date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date.slice(0, 10) ||
        Date.parse(date) > Date.parse(asOf) ||
        Date.parse(date) < Date.parse(game.kickoffAt!) - 7 * 86400000 ||
        typeof a.id !== 'string' ||
        !/^\d{1,10}$/.test(a.id) ||
        typeof a.fullName !== 'string' ||
        !a.fullName ||
        a.fullName.length > 120 ||
        /[\u0000-\u001f]/.test(a.fullName) ||
        typeof position.abbreviation !== 'string' ||
        !/^[A-Z]{1,5}$/.test(position.abbreviation) ||
        typeof r.status !== 'string' ||
        !['Out', 'Doubtful', 'Questionable'].includes(r.status)
      )
        continue;
      result.push({
        season: game.season,
        week: game.week,
        seasonType: 'REG',
        team: nflTeamKey(home ? game.home : game.away),
        position: position.abbreviation,
        fullName: a.fullName,
        updatedAt: new Date(date).toISOString(),
        reportStatus: r.status,
        reportInjury: '',
        practiceStatus: '',
        practiceInjury: '',
      });
    }
  }
  return result;
}
export async function fetchDatedGameInjuries(
  game: FootballGame,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<NFLInjuryReportRow[]> {
  if (!game.espnId || !/^\d{9}$/.test(game.espnId)) return [];
  const response = await fetcher(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${game.espnId}`,
    { signal: AbortSignal.timeout(10000), redirect: 'error' },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Dated game injuries unavailable.');
  }
  return parseDatedGameInjuries(
    await readBoundedJson(response, 750000),
    game,
    new Date(now()).toISOString(),
  );
}

/** Game-day lists per game, cached for ten minutes; failures are not cached. */
export class GameDayInjuries {
  private cache = new Map<string, { until: number; value: Promise<NFLInjuryReportRow[]> }>();
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}
  get(game: FootballGame): Promise<NFLInjuryReportRow[]> {
    const hit = this.cache.get(game.id);
    if (hit && hit.until > this.now()) return hit.value;
    const value = fetchDatedGameInjuries(game, this.fetcher, this.now);
    this.cache.set(game.id, { until: this.now() + 10 * 60_000, value });
    value.catch(() => this.cache.delete(game.id));
    while (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }
}
