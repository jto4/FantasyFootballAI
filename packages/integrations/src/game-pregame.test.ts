import { expect, it } from 'vitest';
import { PublicPregameEvidence } from './game-pregame.js';
import type { FootballDataSnapshot, FootballGame } from '@sidekick/core';
const clock = Date.parse('2025-10-05T16:00:00Z'),
  game: FootballGame = {
    id: 'target',
    season: 2025,
    week: 5,
    seasonType: 'REG',
    date: '2025-10-05',
    kickoffAt: '2025-10-05T17:00:00Z',
    home: 'BUF',
    away: 'KC',
  };
const data: FootballDataSnapshot = {
  season: 2025,
  games: [
    {
      ...game,
      id: 'old',
      season: 2024,
      date: '2024-10-05',
      kickoffAt: '2024-10-05T17:00:00Z',
      homeScore: 24,
      awayScore: 20,
    },
  ],
  players: [],
  market: [],
  sources: [],
  warnings: [],
};
it('coalesces bounded archive work, preserves cached provenance and invalidates changed game identities', async () => {
  let calls = 0;
  const urls: string[] = [];
  const p = new PublicPregameEvidence(
    (async (input) => {
      calls++;
      urls.push(String(input));
      return new Response('', { status: 404 });
    }) as typeof fetch,
    () => clock,
  );
  const [a, b] = await Promise.all([
    p.history(data, new Date(clock).toISOString()),
    p.history(data, new Date(clock).toISOString()),
  ]);
  expect(a).toEqual(b);
  const count = calls;
  await p.history(data, new Date(clock).toISOString());
  expect(calls).toBe(count);
  const modified = structuredClone(data);
  modified.games[0]!.homeQuarterbackName = 'Changed prior starter';
  await p.history(modified, new Date(clock).toISOString());
  expect(calls).toBeGreaterThan(count);
  expect(a.sources.every((s) => s.status === 'unavailable')).toBe(true);
  expect(urls.some((u) => u.includes('/stats_player/') || u.includes('/snap_counts/'))).toBe(false);
});
it('does not relabel stale/future injury snapshots as current and uses UTC kickoff day for night-game weather', async () => {
  const urls: string[] = [];
  const fetcher = (async (input) => {
    urls.push(String(input));
    return new Response('', { status: 404 });
  }) as typeof fetch;
  const p = new PublicPregameEvidence(fetcher, () => clock);
  const outdoor = {
    ...game,
    date: '2025-10-05',
    kickoffAt: '2025-10-06T00:15:00Z',
    stadiumId: 'BUF00',
    stadiumName: 'Highmark Stadium',
  };
  const result = await p.current(
    outdoor,
    data,
    { rows: [], retrievedAt: '2025-10-10T00:00:00Z', sourceUrl: 'https://example.test' },
    undefined,
  );
  expect(result.pregame?.home.reportUpdatedAt).toBeUndefined();
  expect(urls.find((u) => u.includes('open-meteo'))).toContain('start_date=2025-10-06');
  expect(result.pregame?.weather).toBeUndefined();
});
it('cancels evidence work without caching incomplete source state or starting generation', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const p = new PublicPregameEvidence(
    (async () => {
      calls++;
      return new Response('', { status: 404 });
    }) as typeof fetch,
    () => clock,
  );
  await expect(p.history(data, new Date(clock).toISOString(), controller.signal)).rejects.toThrow();
  expect(calls).toBe(0);
});
it('keeps public history usable when optional official discovery exceeds its bounds', async () => {
  const p = new PublicPregameEvidence(
    (async (input) =>
      new Response(
        String(input).includes('/sitemap/')
          ? Array.from(
              { length: 25 },
              (_, i) => `<a href="/news/report-${i}">NFL Week 5 injury report</a>`,
            ).join('')
          : '',
        { status: String(input).includes('/sitemap/') ? 200 : 404 },
      )) as typeof fetch,
    () => clock,
  );
  const result = await p.history(data, new Date(clock).toISOString());
  expect(result.games).toHaveLength(1);
  expect(result.sources.find((s) => s.id === 'game-context-official-injuries-2025')?.status).toBe(
    'unavailable',
  );
  expect(result.warnings).toContain('Official NFL injury history 2025 is unavailable.');
});
