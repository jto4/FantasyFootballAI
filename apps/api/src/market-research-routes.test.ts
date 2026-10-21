import express from 'express';
import { afterEach, expect, it } from 'vitest';
import { createMarketResearchRouter } from './market-research-routes.js';
import { MarketResearchStore } from './market-research-store.js';
import {
  buildMarketSignals,
  freezeMarketResearch,
  type FootballGame,
  type ExternalTotalTape,
  type SportsbookQuote,
} from '@sidekick/core';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const at = '2026-10-15T23:00:00.000Z';
const game: FootballGame = {
  id: '2026_06_SEA_DEN',
  season: 2026,
  week: 6,
  seasonType: 'REG',
  date: '2026-10-15',
  kickoffAt: '2026-10-16T00:15:00.000Z',
  home: 'DEN',
  away: 'SEA',
  espnId: '401872995',
};
const baseline: SportsbookQuote = {
  id: 'q1',
  gameId: game.id,
  espnId: game.espnId!,
  sportsbook: 'Example',
  providerId: '100',
  kind: 'total',
  side: 'over',
  line: 40.5,
  americanOdds: -112,
  oppositeAmericanOdds: -108,
  observedAt: at,
  kickoffAt: game.kickoffAt!,
  sourceUrl: `https://www.espn.com/nfl/odds/_/gameId/${game.espnId}`,
};
const tape: ExternalTotalTape = {
  provider: 'kalshi',
  gameId: game.id,
  contractId: 'KXNFLTOTAL-26OCT15SEADEN-41',
  line: 40.5,
  kickoffAt: game.kickoffAt!,
  cutoffAt: at,
  capturedAt: at,
  createdAt: '2026-10-10T12:00:00Z',
  windowStartAt: '2026-10-14T23:00:00Z',
  complete: true,
  prices: [{ at, probability: 0.54 }],
  trades: [],
};
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
it('persists immutable first-game/provider record across restart, validates corruption, settles once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sidekick-research-')),
    path = join(dir, 'research.sqlite');
  let store = new MarketResearchStore(path);
  cleanups.push(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  const s = buildMarketSignals({
    id: 's1',
    game,
    line: 40.5,
    provider: 'kalshi',
    cutoffAt: at,
    capturedAt: at,
    tape,
    baseline,
  });
  const r = freezeMarketResearch(s, at);
  store.freeze(r);
  store.close();
  store = new MarketResearchStore(path);
  expect(store.list()).toEqual([r]);
  expect(store.freeze({ ...r, snapshot: { ...s, id: 's2' } })).toEqual(r);
  expect(() => store.freeze({ ...r, candidateProbability: 0.99 })).toThrow();
  store.settle(r.id, {
    observedAt: '2026-10-16T04:00:00Z',
    total: 45,
    sourceUrl: `https://www.espn.com/nfl/game/_/gameId/${game.espnId}`,
  });
  store.settle(r.id, {
    observedAt: '2026-10-16T04:01:00Z',
    total: 30,
    sourceUrl: `https://www.espn.com/nfl/game/_/gameId/${game.espnId}`,
  });
  expect(store.list()[0]?.result?.total).toBe(45);
});
it('captures public signals, only freezes server snapshots, resolves matched finals without touching advice or AI', async () => {
  let clock = Date.parse(at),
    calls = 0;
  const store = new MarketResearchStore(':memory:'),
    app = express();
  app.use(express.json());
  app.use(
    createMarketResearchRouter({
      research: store,
      now: () => clock,
      data: {
        get: async () => ({
          season: 2026,
          games: [game],
          players: [],
          market: [],
          sources: [],
          warnings: [],
        }),
      },
      markets: {
        getTotal: async () => {
          calls++;
          return tape;
        },
      },
      odds: {
        get: async () => ({
          gameId: game.id,
          status: 'available',
          quotes: [baseline],
          warnings: [],
        }),
        result: async () => ({
          gameId: game.id,
          espnId: game.espnId!,
          home: game.home,
          away: game.away,
          kickoffAt: game.kickoffAt!,
          observedAt: new Date(clock).toISOString(),
          homeScore: 24,
          awayScore: 21,
          sourceUrl: `https://www.espn.com/nfl/game/_/gameId/${game.espnId}`,
        }),
      },
      news: { get: async () => ({ items: [], stale: false, refreshedAt: at }) },
      catalog: async () => new Map(),
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  cleanups.push(async () => {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    store.close();
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('port');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown) =>
    fetch(`${base}/api/market-signals/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  expect((await post('capture', { gameId: game.id, provider: 'kalshi', line: 40 })).status).toBe(
    400,
  );
  expect(calls).toBe(0);
  expect(
    (await post('freeze', { snapshotId: 'client-forged', candidateProbability: 0.99 })).status,
  ).toBe(400);
  const capture = await post('capture', { gameId: game.id, provider: 'kalshi', line: 40.5 });
  expect(capture.status).toBe(200);
  const s = await capture.json();
  expect(s.prices).toHaveLength(1);
  const frozen = await post('freeze', { snapshotId: s.id });
  expect(frozen.status).toBe(201);
  const r = await frozen.json();
  expect((await post('freeze', { snapshotId: s.id })).status).toBe(201);
  expect(store.list()).toHaveLength(1);
  expect((await post('resolve', { total: 100 })).status).toBe(400);
  clock = Date.parse('2026-10-16T04:00:00Z');
  expect((await post('capture', { gameId: game.id, provider: 'kalshi', line: 40.5 })).status).toBe(
    400,
  );
  expect((await post('freeze', { snapshotId: s.id })).status).toBe(409);
  const resolved = await post('resolve', {});
  expect(resolved.status).toBe(200);
  expect((await resolved.json()).records[0].result.total).toBe(45);
  expect(store.list()[0]?.candidateProbability).toBe(r.candidateProbability);
  const exported = await fetch(`${base}/api/market-signals/export`);
  expect(exported.headers.get('content-disposition')).toContain('sidekick-market-research');
});
