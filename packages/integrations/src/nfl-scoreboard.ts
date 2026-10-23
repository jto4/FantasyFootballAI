import { asList, asObject } from '@sidekick/core';
import { nflTeamKey } from '@sidekick/core';
import { readBoundedJson } from './http.js';

export interface LiveNflGame {
  espnId: string;
  home: string;
  away: string;
  state: 'pre' | 'in' | 'post';
  /** ESPN's short status, for example "Q3 4:12" or "Final". */
  detail: string;
  homeScore?: number;
  awayScore?: number;
  kickoffAt?: string;
}

/** Parses ESPN's public NFL scoreboard; malformed events are skipped, never guessed. */
export function parseNflScoreboard(value: unknown): {
  week?: number;
  games: LiveNflGame[];
  byeTeams: string[];
} {
  const v = asObject(value);
  const week = Number(asObject(v.week).number);
  const games = asList(v.events)
    .slice(0, 32)
    .flatMap((event) => {
      const e = asObject(event),
        competition = asObject(asList(e.competitions)[0]),
        status = asObject(asObject(competition.status).type),
        state = status.state,
        teams = asList(competition.competitors).map(asObject);
      const home = teams.find((t) => t.homeAway === 'home'),
        away = teams.find((t) => t.homeAway === 'away');
      const abbreviation = (t?: Record<string, unknown>) => {
        const a = asObject(t?.team).abbreviation;
        return typeof a === 'string' && /^[A-Z]{2,4}$/.test(a) ? nflTeamKey(a) : undefined;
      };
      const score = (t?: Record<string, unknown>) => {
        const n = Number(t?.score);
        return Number.isInteger(n) && n >= 0 && n < 200 ? n : undefined;
      };
      const h = abbreviation(home),
        a = abbreviation(away);
      if (
        typeof e.id !== 'string' ||
        !/^\d{6,12}$/.test(e.id) ||
        !h ||
        !a ||
        (state !== 'pre' && state !== 'in' && state !== 'post')
      )
        return [];
      const detail = typeof status.shortDetail === 'string' ? status.shortDetail.slice(0, 60) : '';
      const date = typeof e.date === 'string' && Number.isFinite(Date.parse(e.date)) ? e.date : '';
      return [
        {
          espnId: e.id,
          home: h,
          away: a,
          state,
          detail,
          ...(state !== 'pre' && score(home) !== undefined ? { homeScore: score(home)! } : {}),
          ...(state !== 'pre' && score(away) !== undefined ? { awayScore: score(away)! } : {}),
          ...(date ? { kickoffAt: new Date(date).toISOString() } : {}),
        } satisfies LiveNflGame,
      ];
    });
  const byeTeams = asList(asObject(v.week).teamsOnBye)
    .slice(0, 32)
    .flatMap((t) => {
      const a = asObject(t).abbreviation;
      return typeof a === 'string' && /^[A-Z]{2,4}$/.test(a) ? [nflTeamKey(a)] : [];
    });
  return { ...(Number.isInteger(week) && week > 0 && week < 30 ? { week } : {}), games, byeTeams };
}

/** The current NFL week's games from ESPN's public scoreboard, cached for one minute. */
export class PublicNflScoreboard {
  private cache?: { until: number; value: ReturnType<typeof parseNflScoreboard> };
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}
  async current() {
    if (this.cache && this.cache.until > this.now()) return this.cache.value;
    const response = await this.fetcher(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
      {
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: { accept: 'application/json' },
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('The NFL scoreboard is unavailable.');
    }
    const value = parseNflScoreboard(await readBoundedJson<unknown>(response, 3_000_000));
    this.cache = { until: this.now() + 60_000, value };
    return value;
  }
}
