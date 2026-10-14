import type { BetTerms } from './advice-types.js';
export interface SportsbookQuote {
  id: string;
  gameId: string;
  espnId: string;
  sportsbook: string;
  providerId: string;
  kind: 'moneyline' | 'spread' | 'total';
  side: 'home' | 'away' | 'over' | 'under';
  line?: number;
  americanOdds: number;
  oppositeAmericanOdds: number;
  observedAt: string;
  kickoffAt: string;
  sourceUrl: string;
}
export interface SportsbookSnapshot {
  gameId: string;
  status: 'available' | 'unavailable';
  observedAt?: string;
  quotes: SportsbookQuote[];
  warnings: string[];
}
export interface FinalFootballResult {
  gameId: string;
  espnId: string;
  home: string;
  away: string;
  kickoffAt: string;
  homeScore: number;
  awayScore: number;
  observedAt: string;
  sourceUrl: string;
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const string = (x: unknown, n: number) =>
  typeof x === 'string' && x.length > 0 && x.length <= n && !/[\u0000-\u001f\u007f]/.test(x);
const instant = (x: unknown) =>
  string(x, 40) &&
  /(?:Z|[+-]\d\d:\d\d)$/.test(x as string) &&
  Number.isFinite(Date.parse(x as string));
const odds = (x: unknown) =>
  typeof x === 'number' && Number.isInteger(x) && Math.abs(x) >= 100 && Math.abs(x) <= 100000;
export function isSportsbookQuote(x: unknown): x is SportsbookQuote {
  if (
    !object(x) ||
    Object.keys(x).some(
      (k) =>
        ![
          'id',
          'gameId',
          'espnId',
          'sportsbook',
          'providerId',
          'kind',
          'side',
          'line',
          'americanOdds',
          'oppositeAmericanOdds',
          'observedAt',
          'kickoffAt',
          'sourceUrl',
        ].includes(k),
    )
  )
    return false;
  return (
    string(x.id, 160) &&
    string(x.gameId, 80) &&
    typeof x.espnId === 'string' &&
    /^\d{9}$/.test(x.espnId) &&
    string(x.sportsbook, 100) &&
    typeof x.providerId === 'string' &&
    /^\d{1,8}$/.test(x.providerId) &&
    odds(x.americanOdds) &&
    odds(x.oppositeAmericanOdds) &&
    instant(x.observedAt) &&
    instant(x.kickoffAt) &&
    Date.parse(x.observedAt as string) < Date.parse(x.kickoffAt as string) &&
    x.sourceUrl === `https://www.espn.com/nfl/odds/_/gameId/${x.espnId}` &&
    ((x.kind === 'moneyline' &&
      ['home', 'away'].includes(String(x.side)) &&
      x.line === undefined) ||
      (x.kind === 'spread' &&
        ['home', 'away'].includes(String(x.side)) &&
        typeof x.line === 'number' &&
        Number.isFinite(x.line) &&
        Math.abs(x.line) <= 100) ||
      (x.kind === 'total' &&
        ['over', 'under'].includes(String(x.side)) &&
        typeof x.line === 'number' &&
        Number.isFinite(x.line) &&
        x.line >= 0 &&
        x.line <= 200))
  );
}
export function isSportsbookSnapshot(x: unknown): x is SportsbookSnapshot {
  return (
    object(x) &&
    string(x.gameId, 80) &&
    ['available', 'unavailable'].includes(String(x.status)) &&
    (x.observedAt === undefined || instant(x.observedAt)) &&
    Array.isArray(x.quotes) &&
    x.quotes.length <= 60 &&
    x.quotes.every(isSportsbookQuote) &&
    new Set(x.quotes.map((q) => q.id)).size === x.quotes.length &&
    x.quotes.every((q) => q.gameId === x.gameId) &&
    Array.isArray(x.warnings) &&
    x.warnings.length <= 10 &&
    x.warnings.every((w) => string(w, 500))
  );
}
export function quoteMatchesTerms(q: SportsbookQuote, t: BetTerms): boolean {
  return (
    q.gameId === t.gameId &&
    q.kind === t.kind &&
    q.side === t.side &&
    q.line === t.line &&
    q.americanOdds === t.americanOdds &&
    q.oppositeAmericanOdds === t.oppositeAmericanOdds
  );
}
