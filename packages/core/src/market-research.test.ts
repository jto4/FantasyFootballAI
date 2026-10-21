import { buildPropGameLog } from './player-prop-research.js';
import { expect, it } from 'vitest';
import {
  buildMarketSignals,
  freezeMarketResearch,
  isMarketResearchRecord,
  isMarketSignalsSnapshot,
} from './market-research.js';
import type { ExternalTotalTape } from './external-total-signals.js';
import type { FootballGame, PlayerGameStats } from './advice-types.js';
import type { SportsbookQuote } from './sportsbook-types.js';
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
  prices: [
    { at: '2026-10-15T22:50:00Z', probability: 0.52 },
    { at: '2026-10-15T22:59:00Z', probability: 0.54 },
  ],
  trades: [
    {
      id: 'a',
      at: '2026-10-15T22:30:00Z',
      shares: 1000,
      price: 0.6,
      overProbability: 0.6,
      direction: 1,
    },
    {
      id: 'b',
      at: '2026-10-15T22:40:00Z',
      shares: 1000,
      price: 0.3,
      overProbability: 0.7,
      direction: -1,
    },
  ],
};
const snapshot = () =>
  buildMarketSignals({
    id: 'snapshot',
    game,
    line: 40.5,
    provider: 'kalshi',
    cutoffAt: at,
    capturedAt: at,
    tape,
    baseline,
    news: {
      items: [
        {
          title: 'Denver Broncos football injury update',
          url: 'https://www.espn.com/nfl/story/test',
          source: 'ESPN',
          publishedAt: '2026-10-15T21:00:00Z',
        },
      ],
      stale: false,
      refreshedAt: at,
    },
  });
it('builds executed cash, fixed large trade threshold, exact prices and dated relevant media without invented sentiment', () => {
  const s = snapshot();
  expect(isMarketSignalsSnapshot(s)).toBe(true);
  expect(s.activity).toEqual([
    { at: '2026-10-15T22:00:00.000Z', overCash: 600, underCash: 300, largeCash: 600, trades: 2 },
  ]);
  expect(s.headlines).toHaveLength(1);
  expect(s).not.toHaveProperty('sentiment');
  expect(s.game).not.toHaveProperty('archivedOdds');
  const r = freezeMarketResearch(s, at);
  expect(isMarketResearchRecord(r)).toBe(true);
  expect(r.candidateProbability).toBe(0.54);
  expect(r.baselineProbability).toBeCloseTo(112 / 212 / (112 / 212 + 108 / 208), 12);
  expect(s).not.toHaveProperty('forecast');
});
it('fails closed on wrong line, future tape, stale/partial snapshots and post-kickoff capture', () => {
  expect(() =>
    buildMarketSignals({
      id: 'bad',
      game,
      line: 41.5,
      provider: 'kalshi',
      cutoffAt: at,
      capturedAt: at,
      tape,
    }),
  ).toThrow('Mismatched');
  for (const s of [
    { ...snapshot(), complete: false },
    { ...snapshot(), prices: [] },
    { ...snapshot(), baseline: undefined },
  ])
    expect(() => freezeMarketResearch(s as ReturnType<typeof snapshot>, at)).toThrow();
  expect(() => freezeMarketResearch(snapshot(), '2026-10-16T00:16:00Z')).toThrow();
  expect(() => freezeMarketResearch(snapshot(), 'invalid')).toThrow();
  expect(() => freezeMarketResearch(snapshot(), '2026-10-15T22:59:00Z')).toThrow();
  expect(() =>
    freezeMarketResearch(
      { ...snapshot(), prices: [{ at: '2026-10-15T20:00:00Z', probability: 0.9 }] },
      at,
    ),
  ).toThrow();
  expect(
    isMarketSignalsSnapshot({
      ...snapshot(),
      prices: [{ at: '2026-10-16T01:00:00Z', probability: 0.9 }],
    }),
  ).toBe(false);
  expect(
    isMarketResearchRecord({ ...freezeMarketResearch(snapshot(), at), candidateProbability: 0.99 }),
  ).toBe(false);
});
it('filters future/undated/stale news and does not turn missing coverage into zero activity', () => {
  const s = buildMarketSignals({
    id: 'missing',
    game,
    line: 40.5,
    provider: 'polymarket',
    cutoffAt: at,
    capturedAt: at,
    news: {
      stale: true,
      items: [
        {
          title: 'Denver Broncos football',
          source: 'ESPN',
          url: 'https://www.espn.com/test',
          publishedAt: '2026-10-16T01:00:00Z',
        },
      ],
    },
  });
  expect(s.prices).toEqual([]);
  expect(s.activity).toEqual([]);
  expect(s.headlines).toEqual([]);
  expect(s.complete).toBe(false);
  expect(s.mediaStatus).toBe('stale');
});
it('player logs preserve zero and pushes, exclude missing, duplicate and uncompleted/future stats', () => {
  const g = {
    ...game,
    id: 'old',
    week: 5,
    kickoffAt: '2026-10-11T17:00:00Z',
    homeScore: 20,
    awayScore: 21,
  };
  const p: PlayerGameStats = {
    playerId: 'gsis',
    name: 'Player',
    position: 'QB',
    team: 'SEA',
    opponent: 'DEN',
    gameId: 'old',
    season: 2026,
    week: 5,
    seasonType: 'REG',
    stats: { passing_tds: 0 },
  };
  expect(buildPropGameLog('gsis', 'Player', 'passing_tds', [p], [g], at).rows[0]?.value).toBe(0);
  expect(buildPropGameLog('gsis', 'Player', 'passing_yards', [p], [g], at).rows).toEqual([]);
  expect(buildPropGameLog('gsis', 'Player', 'passing_tds', [p, p], [g], at).rows).toEqual([]);
  expect(buildPropGameLog('other', 'Player', 'passing_tds', [p], [g], at).rows).toEqual([]);
  expect(
    buildPropGameLog('gsis', 'Player', 'passing_tds', [p], [{ ...g, kickoffAt: at }], at).rows,
  ).toEqual([]);
});
export { snapshot, game, at };
