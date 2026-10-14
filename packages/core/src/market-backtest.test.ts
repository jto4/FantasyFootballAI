import { afterEach, expect, it, vi } from 'vitest';
import * as model from './bet-forecast.js';
import { evaluateArchivedMarkets } from './market-backtest.js';
import type { FootballDataSnapshot, BetModelForecast } from './advice-types.js';
const asOf = '2026-10-11T12:00:00Z';
function data(): FootballDataSnapshot {
  const games: FootballDataSnapshot['games'] = [];
  for (const season of [2023, 2024])
    for (let week = 1; week <= 18; week++)
      for (let i = 0; i < 16; i++) {
        const date = new Date(Date.UTC(season, 8, 1 + (week - 1) * 7)).toISOString().slice(0, 10);
        games.push({
          id: `${season}-${week}-${i}`,
          season,
          week,
          seasonType: 'REG',
          date,
          kickoffAt: `${date}T17:00:00Z`,
          home: `A${i}`,
          away: `B${(i + week) % 16}`,
          homeScore: 20 + i + (week % 3),
          awayScore: 20 + ((i + week) % 16) + ((week + i) % 4),
        });
      }
  games.push({
    id: 'target',
    season: 2025,
    week: 5,
    seasonType: 'REG',
    date: '2025-10-05',
    kickoffAt: '2025-10-05T17:00:00Z',
    home: 'A15',
    away: 'B0',
    homeScore: 24,
    awayScore: 17,
    spreadLine: 7,
    totalLine: 41,
    archivedOdds: {
      homeMoneyline: -180,
      awayMoneyline: 150,
      homeSpreadOdds: -105,
      awaySpreadOdds: -115,
      overOdds: -115,
      underOdds: -105,
    },
  });
  return {
    season: 2026,
    games,
    players: [],
    market: [],
    warnings: [],
    sources: [{ id: 'games', name: 'Archive', status: 'available', retrievedAt: asOf }],
  };
}
afterEach(() => vi.restoreAllMocks());
it('uses the two real archived prices, home-favorite sign, pushes, and exactly one side per market', () => {
  const calls: unknown[] = [];
  vi.spyOn(model, 'buildBetForecast').mockImplementation((terms, snapshot, stamp) => {
    calls.push(terms);
    expect(stamp).toBe('2025-10-05T16:59:59.000Z');
    expect(snapshot.games.find((g) => g.id === 'target')?.homeScore).toBeUndefined();
    expect(snapshot.sources[0]!.retrievedAt).toBe(asOf);
    return {
      forecast: {
        method: 'market-context-v3',
        probability: 0.8,
        lower: 0.75,
        upper: 0.9,
        pushRate: 0,
        evaluation: {
          baselineKind: 'sportsbook',
          games: 100,
          weeks: 12,
          calibrationSamples: 40,
          calibrationWeeks: 8,
          improvementLower: 0.01,
          brier: 0.1,
          baselineBrier: 0.2,
          calibrationObserved: 0.8,
          calibrationPredicted: 0.8,
        },
      } as BetModelForecast,
      metrics: [],
      warnings: [],
      evaluationCases: [],
    };
  });
  const report = evaluateArchivedMarkets(data(), [2024, 2025], asOf),
    markets = report.seasons[1]!.markets;
  expect(calls).toContainEqual(
    expect.objectContaining({
      kind: 'spread',
      side: 'home',
      line: -7,
      americanOdds: -105,
      oppositeAmericanOdds: -115,
    }),
  );
  expect(markets[0]).toMatchObject({
    games: 1,
    forecasts: 1,
    selections: 1,
    losses: 1,
    netUnits: -1,
  }); // away offers the larger price edge
  expect(markets[1]).toMatchObject({ selections: 1, pushes: 1, netUnits: 0 });
  expect(markets[1]!.brier).toBeUndefined();
  expect(markets[2]).toMatchObject({ selections: 1, pushes: 1, netUnits: 0 });
  expect(report.publicationTimingVerified).toBe(false);
  const won = data();
  won.games.at(-1)!.homeScore = 16;
  expect(evaluateArchivedMarkets(won, [2024, 2025], asOf).seasons[1]!.markets[0]).toMatchObject({
    wins: 1,
    netUnits: 1.5,
  });
});
it('does not synthesize missing prices or count ambiguous duplicate targets', () => {
  const d = data();
  delete d.games.at(-1)!.archivedOdds!.awayMoneyline;
  d.games.push({ ...d.games.at(-1)! });
  expect(
    evaluateArchivedMarkets(d, [2024, 2025], asOf).seasons[1]!.markets.every((m) => m.games === 0),
  ).toBe(true);
  d.games.pop();
  expect(evaluateArchivedMarkets(d, [2024, 2025], asOf).seasons[1]!.markets[0]).toMatchObject({
    games: 0,
    forecasts: 0,
    selections: 0,
  });
});
it('fits only earlier weeks even when future scores and target outcome are present in the archive', () => {
  const d = data(),
    original = evaluateArchivedMarkets(d, [2024, 2025], asOf).seasons[1]!.markets[0]!;
  expect(original.forecasts).toBe(1);
  expect(original.brier).toBeGreaterThan(0);
  const g = d.games.at(-1)!;
  const future = { ...g };
  delete future.archivedOdds;
  d.games.push({
    ...future,
    id: 'future',
    week: 6,
    date: '2025-10-12',
    kickoffAt: '2025-10-12T17:00:00Z',
    homeScore: 100,
  });
  const changed = evaluateArchivedMarkets(d, [2024, 2025], asOf).seasons[1]!.markets[0]!;
  expect(changed).toEqual(original);
  g.homeScore = 0;
  const loss = evaluateArchivedMarkets(d, [2024, 2025], asOf).seasons[1]!.markets[0]!;
  expect(Math.sqrt(original.brier!) + Math.sqrt(loss.brier!)).toBeCloseTo(1, 10); // same pregame probability, different observed outcome
  expect(d.sources[0]!.retrievedAt).toBe(asOf);
});
