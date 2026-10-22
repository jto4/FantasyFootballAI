import {
  espnPropAthleteIds,
  nflTeamFullName,
  oddsApiPropMarkets,
  parseEspnPropBets,
  parseOddsApiLines,
  parseOddsApiProps,
  type BookLine,
  type FootballGame,
  type PropLine,
} from '@sidekick/core';
import { readBoundedJson } from './http.js';

export interface PropLinesSnapshot {
  gameId: string;
  lines: PropLine[];
  /** True when prices came from a priced source; ESPN supplies lines only. */
  priced: boolean;
  warnings: string[];
}

export interface BookLinesSnapshot {
  gameId: string;
  lines: BookLine[];
  warnings: string[];
}

const espnBase = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const oddsApiBase = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl';
const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/**
 * Player-prop lines and multi-book game prices.
 *
 * ESPN's public feed is used without any key and returns lines only. When the user saves an
 * Odds API key, prop prices and other books' game prices come from The Odds API. The key travels
 * only to api.the-odds-api.com as its required `apiKey` query parameter and is never logged or
 * echoed in errors.
 */
export class PublicPropLines {
  private propCache = new Map<string, { value: PropLinesSnapshot; until: number }>();
  private bookCache = new Map<string, { value: BookLinesSnapshot; until: number }>();
  private names = new Map<string, { name: string }>();
  private events?: { value: unknown[]; until: number };

  constructor(
    private readonly readOddsApiKey: () => Promise<string | undefined> = async () => undefined,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async json(url: string, maxBytes: number): Promise<unknown> {
    const response = await this.fetcher(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Prop feed request failed (${response.status}).`);
    }
    return readBoundedJson<unknown>(response, maxBytes);
  }

  async props(game: FootballGame): Promise<PropLinesSnapshot> {
    const cached = this.propCache.get(game.id);
    if (cached && cached.until > this.now()) return cached.value;
    const warnings: string[] = [];
    let value: PropLinesSnapshot | undefined;
    const key = await this.readOddsApiKey().catch(() => undefined);
    if (key) {
      try {
        const event = await this.oddsApiEvent(game, key);
        if (event) {
          const markets = Object.keys(oddsApiPropMarkets).join(',');
          const data = await this.json(
            `${oddsApiBase}/events/${encodeURIComponent(event)}/odds?apiKey=${encodeURIComponent(key)}&regions=us&markets=${markets}&oddsFormat=american`,
            4_000_000,
          );
          const lines = parseOddsApiProps(data, {
            gameId: game.id,
            observedAt: new Date(this.now()).toISOString(),
          });
          if (lines.length) value = { gameId: game.id, lines, priced: true, warnings };
        }
        if (!value) warnings.push('The Odds API had no priced props for this game yet.');
      } catch {
        warnings.push('The Odds API could not be reached; showing ESPN lines without prices.');
      }
    }
    value ??= { ...(await this.espnProps(game)), warnings };
    this.propCache.set(game.id, { value, until: this.now() + 10 * 60_000 });
    while (this.propCache.size > 64) this.propCache.delete(this.propCache.keys().next().value!);
    return value;
  }

  private async espnProps(game: FootballGame): Promise<Omit<PropLinesSnapshot, 'warnings'>> {
    if (!game.espnId || !/^\d{9}$/.test(game.espnId))
      throw new Error('NFL game identity is unavailable.');
    const competition = `${espnBase}/events/${game.espnId}/competitions/${game.espnId}`;
    const odds = obj(await this.json(`${competition}/odds`, 500_000));
    const provider = list(odds.items)
      .map((item) => obj(obj(item).provider))
      .find((p) => /^\d{1,6}$/.test(String(p.id)) && typeof p.name === 'string');
    if (!provider) return { gameId: game.id, lines: [], priced: false };
    const items: unknown[] = [];
    for (let page = 1; page <= 3; page++) {
      const data = obj(
        await this.json(
          `${competition}/odds/${provider.id}/propBets?limit=1000&page=${page}`,
          6_000_000,
        ),
      );
      items.push(...list(data.items));
      if (!(Number(data.pageCount) > page)) break;
    }
    const ids = espnPropAthleteIds(items).slice(0, 150);
    await this.resolveNames(ids, game.season);
    return {
      gameId: game.id,
      lines: parseEspnPropBets(items, this.names, {
        gameId: game.id,
        sportsbook: String(provider.name),
        observedAt: new Date(this.now()).toISOString(),
      }),
      priced: false,
    };
  }

  /** Athlete names are fetched once and reused across games; eight requests at a time. */
  private async resolveNames(ids: string[], season: number) {
    const missing = ids.filter((id) => !this.names.has(id));
    for (let start = 0; start < missing.length; start += 8)
      await Promise.all(
        missing.slice(start, start + 8).map(async (id) => {
          try {
            const athlete = obj(
              await this.json(`${espnBase}/seasons/${season}/athletes/${id}`, 200_000),
            );
            const name = typeof athlete.fullName === 'string' ? athlete.fullName.trim() : '';
            if (name && name.length <= 80 && String(athlete.id) === id)
              this.names.set(id, { name });
          } catch {
            /* An unresolved athlete's lines are dropped rather than guessed. */
          }
        }),
      );
    while (this.names.size > 3000) this.names.delete(this.names.keys().next().value!);
  }

  private async oddsApiEvent(game: FootballGame, key: string): Promise<string | undefined> {
    if (!this.events || this.events.until <= this.now()) {
      // Listing events does not count against the Odds API quota.
      const value = list(
        await this.json(`${oddsApiBase}/events?apiKey=${encodeURIComponent(key)}`, 1_000_000),
      );
      this.events = { value, until: this.now() + 30 * 60_000 };
    }
    const home = nflTeamFullName(game.home),
      away = nflTeamFullName(game.away),
      kickoff = game.kickoffAt ? Date.parse(game.kickoffAt) : NaN;
    const match = this.events.value
      .map(obj)
      .find(
        (e) =>
          e.home_team === home &&
          e.away_team === away &&
          typeof e.commence_time === 'string' &&
          Math.abs(Date.parse(e.commence_time) - kickoff) <= 6 * 3_600_000,
      );
    return typeof match?.id === 'string' && /^[a-z0-9]{8,64}$/i.test(match.id)
      ? match.id
      : undefined;
  }

  /** Other books' prices for the game; available only with an Odds API key. */
  async books(game: FootballGame): Promise<BookLinesSnapshot> {
    const cached = this.bookCache.get(game.id);
    if (cached && cached.until > this.now()) return cached.value;
    const key = await this.readOddsApiKey().catch(() => undefined);
    const home = nflTeamFullName(game.home),
      away = nflTeamFullName(game.away);
    if (!key || !home || !away)
      return {
        gameId: game.id,
        lines: [],
        warnings: ['Add an Odds API key in Settings to compare prices across sportsbooks.'],
      };
    let value: BookLinesSnapshot;
    try {
      const event = await this.oddsApiEvent(game, key);
      const data = event
        ? await this.json(
            `${oddsApiBase}/events/${encodeURIComponent(event)}/odds?apiKey=${encodeURIComponent(key)}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`,
            2_000_000,
          )
        : undefined;
      const lines = data
        ? parseOddsApiLines(
            data,
            { home: game.home, away: game.away, homeName: home, awayName: away },
            new Date(this.now()).toISOString(),
          )
        : [];
      value = {
        gameId: game.id,
        lines,
        warnings: lines.length ? [] : ['No sportsbook prices were listed for this game yet.'],
      };
    } catch {
      value = {
        gameId: game.id,
        lines: [],
        warnings: ['The Odds API could not be reached. Try again shortly.'],
      };
    }
    this.bookCache.set(game.id, { value, until: this.now() + 10 * 60_000 });
    while (this.bookCache.size > 64) this.bookCache.delete(this.bookCache.keys().next().value!);
    return value;
  }
}
