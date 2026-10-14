import { expect, it } from 'vitest';
import {
  parseOfficialGameInjuries,
  officialInjuriesForGame,
  fetchOfficialGameInjuries,
} from './official-game-injuries.js';
import type { FootballGame } from '@sidekick/core';
const url = 'https://www.nfl.com/news/test-week-5-injury-report',
  game: FootballGame = {
    id: '2025_05_KC_BUF',
    season: 2025,
    week: 5,
    seasonType: 'REG',
    date: '2025-10-05',
    kickoffAt: '2025-10-05T17:00:00Z',
    home: 'BUF',
    away: 'KC',
  };
const article = (
  modified = '2025-10-03T18:00:00.000Z',
  body = '<h3>BILLS</h3><ul><li><strong>OUT:</strong> WR Receiver (ankle), QB Old QB (knee)</li></ul><h3>CHIEFS</h3><ul><li>No injury designations</li></ul>',
) =>
  '<script type="application/ld+json">' +
  JSON.stringify({
    '@type': 'NewsArticle',
    headline: 'NFL Week 5 injury report: Player statuses',
    datePublished: '2025-10-01T18:00:00.000Z',
    dateModified: modified,
  }) +
  '</script>' +
  body;
it('retains the latest modification and parses bounded official team/status facts without backdating later edits', () => {
  const report = parseOfficialGameInjuries(article(), url, 2025)!;
  expect(report.teams).toEqual(['BUF', 'KC']);
  expect(report.rows.map((r) => r.fullName)).toEqual(['Receiver', 'Old QB']);
  expect(officialInjuriesForGame([report], game, '2025-10-05T16:00:00Z')).toHaveLength(2);
  const edited = parseOfficialGameInjuries(article('2025-10-05T18:00:00.000Z'), url, 2025)!;
  expect(officialInjuriesForGame([edited], game, '2025-10-05T16:00:00Z')).toEqual([]);
  expect(officialInjuriesForGame([report], { ...game, week: 6 }, '2025-10-05T16:00:00Z')).toEqual(
    [],
  );
  expect(
    parseOfficialGameInjuries(article(), url.replace('www.nfl.com', 'evil.test'), 2025),
  ).toBeUndefined();
  expect(parseOfficialGameInjuries(article(), url, 2026)).toBeUndefined();
});
it('withholds malformed or duplicated team lists instead of reporting partial absence counts', () => {
  expect(
    parseOfficialGameInjuries(
      article(
        undefined,
        '<h3>BILLS</h3><ul><li>OUT: WR Receiver (ankle), Unknown Player</li></ul>',
      ),
      url,
      2025,
    ),
  ).toBeUndefined();
  expect(
    parseOfficialGameInjuries(
      article(
        undefined,
        '<h3>BILLS</h3><li>No injury designations</li><h3>BILLS</h3><li>No injury designations</li>',
      ),
      url,
      2025,
    ),
  ).toBeUndefined();
});
it('follows only fixed-origin validated news slugs from bounded publisher discovery', async () => {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const u = String(input);
    calls.push(u);
    return new Response(
      u.includes('/sitemap/')
        ? '<a href="/news/test-week-5-injury-report">NFL Week 5 injury report</a><a href="https://evil.test/news/stolen">Week 5 injury report</a>'
        : article(),
    );
  }) as typeof fetch;
  expect(await fetchOfficialGameInjuries(2025, [10], fetcher)).toHaveLength(1);
  expect(calls).toEqual(['https://www.nfl.com/sitemap/html/articles/2025/10', url]);
});
