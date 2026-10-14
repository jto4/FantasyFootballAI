import { expect, it } from 'vitest';
import type { FootballGame } from './advice-types.js';
import { prepareGameRatingModel } from './game-rating-model.js';
import {
  prepareExpertTotalsAdapter,
  prepareExpertTotalsHybrid,
  type ExpertTotalsRow,
  type ExpertTotalsSpec,
} from './expert-totals-model.js';
const spec: ExpertTotalsSpec = { learningRate: 16, share: 0.2, bookPrior: 0.5, seasonCarry: 0 };
const game = (season: number, week: number, i = 0): FootballGame => ({
  id: `${season}-${week}-${i}`,
  season,
  week,
  seasonType: 'REG',
  date: new Date(Date.UTC(season, 8, 1 + 7 * (week - 1))).toISOString().slice(0, 10),
  home: `T${i}`,
  away: `T${8 + ((i + week) % 8)}`,
});
const rows: ExpertTotalsRow[] = Array.from({ length: 8 }, (_, j) =>
  Array.from({ length: 8 }, (_, i) => ({
    game: game(2024, j + 1, i),
    probabilities: [0.5, 0.2, 0.8, 0.5] as [number, number, number, number],
    y: j < 4 ? 0 : 1,
  })),
).flat();
it('learns expert reliability, recovers after a regime switch, and resets safely at the next season', () => {
  const adapter = prepareExpertTotalsAdapter(rows, spec),
    before = adapter.weights(game(2024, 5)),
    after = adapter.weights(game(2024, 9));
  expect(before[1]).toBeGreaterThan(before[2]!);
  expect(after[2]).toBeGreaterThan(after[1]!);
  expect(after.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 12);
  expect(after.every((w) => w > 0)).toBe(true);
  expect(adapter.probability(game(2024, 9), [0.5, 0.2, 0.8, 0.5])).toBeGreaterThan(0.5);
  expect(adapter.weights(game(2025, 1))).toEqual([0.5, 1 / 6, 1 / 6, 1 / 6]);
  after[0] = 0;
  expect(adapter.weights(game(2024, 9))[0]).toBeGreaterThan(0);
});
it('uses entire prior weeks only, is independent of input order/mutation, and rejects invalid or duplicate rows', () => {
  const origin = game(2024, 5),
    prior = rows.filter((r) => r.game.week < 5),
    future = rows.filter((r) => r.game.week >= 5).map((r) => ({ ...r, y: 1 - r.y })),
    a = prepareExpertTotalsAdapter(rows, spec),
    b = prepareExpertTotalsAdapter([...future, ...prior].reverse(), spec);
  expect(a.weights(origin)).toEqual(b.weights(origin));
  const input = structuredClone(rows),
    settings = { ...spec },
    c = prepareExpertTotalsAdapter(input, settings),
    weights = c.weights(origin);
  input.forEach((r) => {
    r.y = 1;
  });
  settings.bookPrior = 0.8;
  expect(c.weights(origin)).toEqual(weights);
  expect(() => prepareExpertTotalsAdapter([...rows, rows[0]!], spec)).toThrow('Invalid bounded');
  expect(() =>
    prepareExpertTotalsAdapter([{ ...rows[0]!, probabilities: [0.5, NaN, 0.8, 0.5] }], spec),
  ).toThrow('Invalid bounded');
  expect(() => c.probability(origin, [0, 0.2, 0.8, 0.5])).toThrow('Invalid expert probability');
});
it('preserves production moneyline and spread and keeps the target/future labels out of the whole hybrid', () => {
  const games: FootballGame[] = [];
  for (let season = 2018; season <= 2024; season++)
    for (let week = 1; week <= 18; week++)
      for (let i = 0; i < 8; i++)
        games.push({
          ...game(season, week, i),
          homeScore: 24 + (i % 3),
          awayScore: 18 + (week % 3),
          spreadLine: 3.5,
          totalLine: 44.5,
          archivedOdds: {
            homeMoneyline: -135,
            awayMoneyline: 115,
            homeSpreadOdds: -110,
            awaySpreadOdds: -110,
            overOdds: -110,
            underOdds: -110,
          },
        });
  const target = games.find((g) => g.season === 2023 && g.week === 10)!,
    model = prepareGameRatingModel(games),
    hybrid = prepareExpertTotalsHybrid(model, spec);
  for (const kind of ['moneyline', 'spread'] as const) {
    const q = model.observations.find((r) => r.game.id === target.id)!.markets[kind]!;
    expect(hybrid.probability(kind, target, q.raw, q.baseline)).toBe(
      model.adjust(kind, target, q.raw, q.baseline),
    );
  }
  const q = model.observations.find((r) => r.game.id === target.id)!.markets.total!,
    p = hybrid.probability('total', target, q.raw, q.baseline),
    changed = games.map((g) =>
      g.season > target.season || (g.season === target.season && g.week >= target.week)
        ? { ...g, homeScore: 0, awayScore: 99 }
        : g,
    ),
    next = prepareGameRatingModel(changed),
    hybrid2 = prepareExpertTotalsHybrid(next, spec),
    q2 = next.observations.find((r) => r.game.id === target.id)!.markets.total!;
  expect(hybrid2.probability('total', target, q2.raw, q2.baseline)).toBeCloseTo(p, 12);
});
