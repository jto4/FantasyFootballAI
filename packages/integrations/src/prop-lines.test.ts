import { expect, it } from 'vitest';
import { PublicPropLines } from './prop-lines.js';

const game = {
  id: 'game',
  espnId: '401873010',
  season: 2026,
  week: 8,
  seasonType: 'REG',
  date: '2026-10-22',
  kickoffAt: '2026-10-23T00:15:00.000Z',
  home: 'CHI',
  away: 'NE',
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const athlete = (id: string) =>
  `http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/athletes/${id}?lang=en`;

it('loads ESPN lines without a key, resolving athletes once and never contacting The Odds API', async () => {
  const urls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith('/odds')) return json({ items: [{ provider: { id: '100', name: 'Book' } }] });
    if (url.includes('/propBets'))
      return json({
        pageCount: 1,
        items: [
          {
            athlete: { $ref: athlete('7') },
            type: { name: 'Total Receiving Yards (incl. overtime)' },
            current: { target: { value: 35.5 } },
          },
        ],
      });
    if (url.includes('/athletes/7')) return json({ id: '7', fullName: 'Fictional Receiver' });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  const props = new PublicPropLines(
    async () => undefined,
    fetcher,
    () => 0,
  );
  const snapshot = await props.props(game);
  expect(snapshot.priced).toBe(false);
  expect(snapshot.lines).toMatchObject([{ playerName: 'Fictional Receiver', line: 35.5 }]);
  expect(urls.every((url) => url.startsWith('https://sports.core.api.espn.com/'))).toBe(true);
  // Cached for ten minutes.
  await props.props(game);
  expect(urls).toHaveLength(3);
  expect((await props.books(game)).warnings[0]).toContain('Odds API key');
});

it('uses The Odds API for priced props when a key is saved, and falls back to ESPN on failure', async () => {
  const seen: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    if (url.includes('the-odds-api.com') && url.includes('/events?'))
      return json([
        {
          id: 'abc12345',
          home_team: 'Chicago Bears',
          away_team: 'New England Patriots',
          commence_time: '2026-10-23T00:15:00Z',
        },
      ]);
    if (url.includes('the-odds-api.com') && url.includes('/events/abc12345/odds'))
      return json({
        bookmakers: [
          {
            title: 'Book A',
            markets: [
              {
                key: 'player_receptions',
                outcomes: [
                  { name: 'Over', description: 'Fictional Receiver', point: 4.5, price: 120 },
                  { name: 'Under', description: 'Fictional Receiver', point: 4.5, price: -150 },
                ],
              },
            ],
          },
        ],
      });
    return new Response('', { status: 500 });
  }) as typeof fetch;
  const props = new PublicPropLines(
    async () => 'test-key',
    fetcher,
    () => 0,
  );
  const snapshot = await props.props(game);
  expect(snapshot.priced).toBe(true);
  expect(snapshot.lines[0]).toMatchObject({ stat: 'receptions', overOdds: 120, underOdds: -150 });
  // The key goes only to The Odds API host.
  expect(
    seen
      .filter((u) => u.includes('test-key'))
      .every((u) => u.startsWith('https://api.the-odds-api.com/')),
  ).toBe(true);
});
