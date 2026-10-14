import { describe, it, expect } from 'vitest';
import fixture from './fixtures/sportsbook-summary.json' with { type: 'json' };
import {
  PublicSportsbookLines,
  parseSportsbookQuotes,
  parseFinalFootballResult,
} from './sportsbook-lines.js';
import { isSportsbookSnapshot, type FootballGame, type BetTerms } from '@sidekick/core';
const game: FootballGame = {
  id: '2026_05_BUF_LA',
  espnId: '401872994',
  season: 2026,
  week: 5,
  seasonType: 'REG',
  date: '2026-10-12',
  kickoffAt: '2026-10-13T00:15:00.000Z',
  home: 'LA',
  away: 'BUF',
};
const now = '2026-10-11T12:00:00.000Z';
describe('public sportsbook prices', () => {
  it('reads latest explicit two-sided prices, not opening or assumed odds', () => {
    const q = parseSportsbookQuotes(fixture, game, now);
    expect(q).toHaveLength(6);
    expect(q.find((x) => x.kind === 'moneyline' && x.side === 'home')?.americanOdds).toBe(-180);
    expect(q.find((x) => x.kind === 'spread' && x.side === 'home')).toMatchObject({
      line: -3.5,
      americanOdds: -105,
      oppositeAmericanOdds: -115,
    });
    expect(q.find((x) => x.kind === 'total' && x.side === 'under')).toMatchObject({
      line: 54.5,
      americanOdds: -105,
    });
    expect(
      q.every((x) => x.sportsbook === 'DraftKings' && x.sourceUrl.includes('espn.com/nfl/odds')),
    ).toBe(true);
    expect(
      isSportsbookSnapshot({
        gameId: game.id,
        status: 'available',
        observedAt: now,
        quotes: q,
        warnings: [],
      }),
    ).toBe(true);
  });
  it('rejects foreign identities, timestamps, seasons, teams, duplicate providers and inconsistent paired lines', () => {
    for (const mutation of [
      (x: typeof fixture) => (x.header.id = '401872000'),
      (x: typeof fixture) => (x.header.uid = 's:20~l:46~e:401872994'),
      (x: typeof fixture) =>
        Object.assign(x.header.competitions[0]!, { uid: 's:20~l:46~e:401872994~c:401872994' }),
      (x: typeof fixture) => (x.header.season.year = 2025),
      (x: typeof fixture) => (x.header.competitions[0]!.date = '2026-10-13T01:15Z'),
      (x: typeof fixture) => (x.header.competitions[0]!.competitors[0]!.team.abbreviation = 'NYJ'),
      (x: typeof fixture) => x.pickcenter.push(x.pickcenter[0]!),
    ]) {
      const x = structuredClone(fixture);
      mutation(x);
      expect(() => parseSportsbookQuotes(x, game, now)).toThrow();
    }
    const x = structuredClone(fixture);
    x.pickcenter[0]!.pointSpread.away.close.line = '+4.5';
    expect(parseSportsbookQuotes(x, game, now).filter((q) => q.kind === 'spread')).toEqual([]);
    x.pickcenter[0]!.moneyline.home.close.odds = '';
    expect(parseSportsbookQuotes(x, game, now).filter((q) => q.kind === 'moneyline')).toEqual([]);
  });
  it('never labels in-play/postgame or missing prices as pregame, and requires explicit final scores', () => {
    const x = structuredClone(fixture);
    x.header.competitions[0]!.status.type.state = 'in';
    expect(parseSportsbookQuotes(x, game, now)).toEqual([]);
    expect(parseFinalFootballResult(x, game, '2026-10-13T04:00:00Z')).toBeUndefined();
    x.header.competitions[0]!.status.type.state = 'post';
    x.header.competitions[0]!.status.type.completed = true;
    const ended = x as unknown as {
      header: { competitions: { competitors: { score?: string }[] }[] };
    };
    ended.header.competitions[0]!.competitors[0]!.score = '24';
    ended.header.competitions[0]!.competitors[1]!.score = '17';
    expect(parseFinalFootballResult(x, game, '2026-10-13T04:00:00Z')).toMatchObject({
      homeScore: 24,
      awayScore: 17,
    });
    expect(parseFinalFootballResult(x, game, now)).toBeUndefined();
  });
  it('coalesces bounded fixed-host reads, preserves observed times, and rejects altered, moved and expired prices', async () => {
    let time = Date.parse(now),
      calls = 0,
      fail = false;
    const value = structuredClone(fixture);
    const cache = new PublicSportsbookLines(
      async (url, init) => {
        calls++;
        expect(String(url)).toBe(
          'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401872994',
        );
        expect(init?.redirect).toBe('error');
        if (fail) throw new Error('fixture');
        return new Response(JSON.stringify(value));
      },
      () => time,
    );
    const [a, b] = await Promise.all([cache.get(game), cache.get(game)]);
    expect(calls).toBe(1);
    expect(a.observedAt).toBe(b.observedAt);
    const q = a.quotes[0]!;
    const terms: BetTerms = {
      kind: q.kind,
      side: q.side,
      gameId: q.gameId,
      americanOdds: q.americanOdds,
      oppositeAmericanOdds: q.oppositeAmericanOdds,
      quoteId: q.id,
    };
    expect(await cache.verify(game, terms)).toEqual(q);
    expect(await cache.verify(game, { ...terms, americanOdds: -175 })).toBeUndefined();
    time += 61000;
    value.pickcenter[0]!.moneyline.home.close.odds = '-185';
    expect(await cache.verify(game, terms)).toBeUndefined();
    time += 300000;
    expect(await cache.verify(game, terms)).toBeUndefined();
    fail = true;
    expect((await cache.get(game)).quotes).toEqual([]);
  });
  it('caps response bytes and refuses unresolved event identity without following references', async () => {
    let calls = 0;
    const cache = new PublicSportsbookLines(
      async () => {
        calls++;
        return new Response('{}', { headers: { 'content-length': '2000001' } });
      },
      () => Date.parse(now),
    );
    expect((await cache.get(game)).status).toBe('unavailable');
    expect(
      (await cache.get({ ...game, espnId: undefined } as unknown as FootballGame)).quotes,
    ).toEqual([]);
    expect(calls).toBe(1);
  });
});
