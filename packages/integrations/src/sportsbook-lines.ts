import { asObject } from '@sidekick/core';
import { createHash } from 'node:crypto';
import {
  isSportsbookQuote,
  nflTeamKey,
  isUpcomingFootballGame,
  type FootballGame,
  type SportsbookQuote,
  type SportsbookSnapshot,
  type FinalFootballResult,
  type BetTerms,
  quoteMatchesTerms,
} from '@sidekick/core';
import { readBoundedJson } from './http.js';
const array = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
function identity(value: unknown, game: FootballGame) {
  const h = asObject(asObject(value).header),
    competitions = array(h.competitions);
  if (
    h.id !== game.espnId ||
    h.uid !== `s:20~l:28~e:${game.espnId}` ||
    asObject(h.season).year !== game.season ||
    asObject(h.season).type !== 2 ||
    competitions.length !== 1
  )
    throw new Error('Unverified NFL market identity.');
  const c = asObject(competitions[0]),
    rows = array(c.competitors);
  if (
    c.id !== game.espnId ||
    (c.uid !== undefined && c.uid !== `s:20~l:28~e:${game.espnId}~c:${game.espnId}`) ||
    rows.length !== 2 ||
    typeof c.date !== 'string' ||
    !game.kickoffAt ||
    Date.parse(c.date) !== Date.parse(game.kickoffAt) ||
    h.timeValid !== true
  )
    throw new Error('Unverified NFL market time.');
  const home = rows.filter((r) => asObject(r).homeAway === 'home'),
    away = rows.filter((r) => asObject(r).homeAway === 'away');
  if (home.length !== 1 || away.length !== 1) throw new Error('Ambiguous NFL market teams.');
  const a = asObject(home[0]),
    b = asObject(away[0]);
  if (
    !/^[1-9]\d{0,2}$/.test(String(a.id)) ||
    !/^[1-9]\d{0,2}$/.test(String(b.id)) ||
    String(a.id) === String(b.id)
  )
    throw new Error('Unverified NFL team IDs.');
  if (
    nflTeamKey(String(asObject(a.team).abbreviation)) !== nflTeamKey(game.home) ||
    nflTeamKey(String(asObject(b.team).abbreviation)) !== nflTeamKey(game.away)
  )
    throw new Error('Mismatched NFL market teams.');
  return { competition: c, home: a, away: b, status: asObject(c.status) };
}
function price(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^[-+]?\d{3,6}$/.test(value)) return;
  const n = Number(value);
  return Number.isInteger(n) && Math.abs(n) >= 100 && Math.abs(n) <= 100000 ? n : undefined;
}
function line(value: unknown, total = false): number | undefined {
  if (
    typeof value !== 'string' ||
    !(total ? /^[ou]\d+(?:\.5)?$/ : /^[+-]?\d+(?:\.5)?$/).test(value)
  )
    return;
  const n = Number(total ? value.slice(1) : value);
  return Number.isFinite(n) && Math.abs(n) <= (total ? 200 : 100) ? n : undefined;
}
/** Pregame publisher prices only: no opening-line fallback, inferred -110, affiliate link, or private $ref. */
export function parseSportsbookQuotes(
  value: unknown,
  game: FootballGame,
  observedAt: string,
): SportsbookQuote[] {
  const { competition, home, away, status } = identity(value, game);
  if (
    asObject(status.type).state !== 'pre' ||
    asObject(status.type).completed !== false ||
    !isUpcomingFootballGame(game, observedAt)
  )
    return [];
  const result: SportsbookQuote[] = [],
    providers = new Set<string>();
  const books = array(asObject(value).pickcenter);
  if (books.length > 10) throw new Error('Too many market providers.');
  for (const item of books) {
    const row = asObject(item),
      p = asObject(row.provider),
      providerId = String(p.id ?? '');
    if (
      !/^\d{1,8}$/.test(providerId) ||
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      p.name.length > 100 ||
      providers.has(providerId)
    )
      throw new Error('Ambiguous market provider.');
    providers.add(providerId);
    if (
      String(asObject(row.homeTeamOdds).teamId) !== String(home.id) ||
      String(asObject(row.awayTeamOdds).teamId) !== String(away.id)
    )
      continue;
    for (const [kind, field, sides] of [
      ['moneyline', 'moneyline', ['home', 'away']],
      ['spread', 'pointSpread', ['home', 'away']],
      ['total', 'total', ['over', 'under']],
    ] as const) {
      const market = asObject(row[field]),
        first = asObject(asObject(market[sides[0]]).close),
        second = asObject(asObject(market[sides[1]]).close);
      const firstOdds = price(first.odds),
        secondOdds = price(second.odds);
      const firstLine = kind === 'moneyline' ? undefined : line(first.line, kind === 'total'),
        secondLine = kind === 'moneyline' ? undefined : line(second.line, kind === 'total');
      if (
        firstOdds === undefined ||
        secondOdds === undefined ||
        (kind !== 'moneyline' && (firstLine === undefined || secondLine === undefined))
      )
        continue;
      if (
        (kind === 'spread' && firstLine !== -secondLine!) ||
        (kind === 'total' &&
          (firstLine !== secondLine ||
            !String(first.line).startsWith('o') ||
            !String(second.line).startsWith('u')))
      )
        continue;
      for (const [i, side] of sides.entries()) {
        const q: SportsbookQuote = {
          id: '',
          gameId: game.id,
          espnId: game.espnId!,
          sportsbook: p.name.trim(),
          providerId,
          kind,
          side,
          ...(kind !== 'moneyline' ? { line: i === 0 ? firstLine! : secondLine! } : {}),
          americanOdds: i === 0 ? firstOdds : secondOdds,
          oppositeAmericanOdds: i === 0 ? secondOdds : firstOdds,
          observedAt,
          kickoffAt: game.kickoffAt!,
          sourceUrl: `https://www.espn.com/nfl/odds/_/gameId/${game.espnId}`,
        };
        q.id = createHash('sha256').update(JSON.stringify(q)).digest('hex');
        if (isSportsbookQuote(q)) result.push(q);
      }
    }
  }
  void competition;
  return result;
}
export function parseFinalFootballResult(
  value: unknown,
  game: FootballGame,
  observedAt: string,
): FinalFootballResult | undefined {
  const { home, away, status } = identity(value, game);
  if (
    asObject(status.type).state !== 'post' ||
    asObject(status.type).completed !== true ||
    Date.parse(game.kickoffAt!) >= Date.parse(observedAt)
  )
    return;
  const score = (x: unknown) =>
    typeof x === 'string' && /^\d{1,3}$/.test(x) && Number(x) <= 100 ? Number(x) : undefined;
  const homeScore = score(home.score),
    awayScore = score(away.score);
  if (homeScore === undefined || awayScore === undefined) return;
  return {
    gameId: game.id,
    espnId: game.espnId!,
    home: game.home,
    away: game.away,
    kickoffAt: game.kickoffAt!,
    homeScore,
    awayScore,
    observedAt,
    sourceUrl: `https://www.espn.com/nfl/game/_/gameId/${game.espnId}`,
  };
}
export class PublicSportsbookLines {
  private cache = new Map<
    string,
    {
      quotes: SportsbookQuote[];
      final?: FinalFootballResult;
      signature: string;
      observedAt: string;
      until: number;
    }
  >();
  private quotes = new Map<string, SportsbookQuote>();
  private pending = new Map<
    string,
    Promise<{
      quotes: SportsbookQuote[];
      final?: FinalFootballResult;
      signature: string;
      observedAt: string;
    }>
  >();
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}
  private async load(game: FootballGame) {
    if (!game.espnId || !/^\d{9}$/.test(game.espnId) || !game.kickoffAt)
      throw new Error('NFL market identity is unavailable.');
    const key = game.espnId,
      signature = JSON.stringify([game.id, game.season, game.home, game.away, game.kickoffAt]),
      cached = this.cache.get(key);
    if (cached && cached.until > this.now() && Date.parse(cached.observedAt) <= this.now()) {
      if (cached.signature !== signature) throw new Error('Conflicting NFL market identity.');
      return cached;
    }
    const existing = this.pending.get(key);
    if (existing) {
      const joined = await existing;
      if (joined.signature !== signature) throw new Error('Conflicting NFL market identity.');
      return joined;
    }
    const task = (async () => {
      const response = await this.fetcher(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${key}`,
        {
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          headers: { accept: 'application/json' },
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('NFL market feed is unavailable.');
      }
      const value = await readBoundedJson<unknown>(response, 2000000),
        observedAt = new Date(this.now()).toISOString();
      identity(value, game);
      const quotes = parseSportsbookQuotes(value, game, observedAt),
        final = parseFinalFootballResult(value, game, observedAt);
      const normalized = { quotes, ...(final ? { final } : {}), signature, observedAt };
      this.cache.set(key, { ...normalized, until: this.now() + 60000 });
      while (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
      return normalized;
    })().finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }
  async get(game: FootballGame): Promise<SportsbookSnapshot> {
    try {
      if (!isUpcomingFootballGame(game, new Date(this.now()).toISOString()))
        throw new Error('Game is no longer upcoming.');
      const { observedAt, quotes, signature } = await this.load(game);
      if (
        signature !== JSON.stringify([game.id, game.season, game.home, game.away, game.kickoffAt])
      )
        throw new Error('Conflicting NFL market identity.');
      for (const q of quotes) this.quotes.set(q.id, q);
      for (const [id, q] of this.quotes)
        if (this.now() - Date.parse(q.observedAt) > 300000) this.quotes.delete(id);
      while (this.quotes.size > 4000) this.quotes.delete(this.quotes.keys().next().value!);
      return {
        gameId: game.id,
        status: quotes.length ? 'available' : 'unavailable',
        observedAt,
        quotes,
        warnings: quotes.length
          ? [
              'ESPN-displayed pregame prices; retrieval time is not publisher update time. Confirm the price and settlement rules at the sportsbook.',
            ]
          : [
              'No complete two-sided pregame prices are available. Enter a verified price manually.',
            ],
      };
    } catch {
      return {
        gameId: game.id,
        status: 'unavailable',
        quotes: [],
        warnings: [
          'Live prices could not be verified. No cached or opening price was substituted.',
        ],
      };
    }
  }
  async verify(game: FootballGame, terms: BetTerms): Promise<SportsbookQuote | undefined> {
    const q = terms.quoteId ? this.quotes.get(terms.quoteId) : undefined;
    if (
      !q ||
      !quoteMatchesTerms(q, terms) ||
      this.now() - Date.parse(q.observedAt) > 300000 ||
      Date.parse(q.observedAt) > this.now()
    )
      return;
    const latest = await this.get(game);
    return latest.quotes.some((n) => n.providerId === q.providerId && quoteMatchesTerms(n, terms))
      ? structuredClone(q)
      : undefined;
  }
  async result(game: FootballGame): Promise<FinalFootballResult | undefined> {
    try {
      const x = await this.load(game);
      return x.signature ===
        JSON.stringify([game.id, game.season, game.home, game.away, game.kickoffAt])
        ? x.final
        : undefined;
    } catch {
      return;
    }
  }
}
/** Shared event/team/time verification for other pregame evidence; no odds are required. */
export function verifiedPregameTeams(value: unknown, game: FootballGame, asOf: string) {
  const result = identity(value, game);
  if (
    asObject(result.status.type).state !== 'pre' ||
    asObject(result.status.type).completed !== false ||
    !isUpcomingFootballGame(game, asOf)
  )
    throw new Error('Pregame evidence is unavailable for a started game.');
  return result;
}
