import { expect, it } from 'vitest';
import type { FootballGame } from '../advice-types.js';
import { prepareGameRatingModel } from '../game-rating-model.js';
import {
  prepareSeasonalTotalAdapter,
  prepareSeasonalHybridModel,
  seasonalRowWeight,
  type SeasonalTotalRow,
  type SeasonalTotalSpec,
} from './seasonal-hybrid-model.js';
const spec: SeasonalTotalSpec = {
  halfLifeWeeks: 4,
  penalty: 25,
  priorSeasonWeight: 0,
  rule: 'direct',
};
const game = (season: number, week: number, i = 0): FootballGame => ({
  id: `${season}-${week}-${i}`,
  season,
  week,
  seasonType: 'REG',
  date: new Date(Date.UTC(season, 8, 1 + 7 * (week - 1))).toISOString().slice(0, 10),
  home: `T${i}`,
  away: `T${8 + ((i + week) % 8)}`,
});
const rows: SeasonalTotalRow[] = Array.from({ length: 8 }, (_, j) =>
  Array.from({ length: 8 }, (_, i) => ({
    game: game(2024, j + 1, i),
    probability: 0.45,
    book: 0.5,
    y: i < 6 ? 1 : 0,
  })),
).flat();
it('adapts a stale Under lean from prior weekly outcomes and resets previous-season calibration when carry is zero', () => {
  const origin = game(2024, 9),
    adapter = prepareSeasonalTotalAdapter(rows, spec);
  expect(adapter.probability(origin, 0.45, 0.5)).toBeGreaterThan(0.45);
  const next = game(2025, 1);
  expect(adapter.probability(next, 0.45, 0.5)).toBe(0.45);
  expect(
    prepareSeasonalTotalAdapter(rows, { ...spec, rule: 'adaptive-book' }).probability(
      next,
      0.45,
      0.5,
    ),
  ).toBe(0.5);
  expect(seasonalRowWeight(game(2024, 8), origin, spec)).toBe(1);
  expect(seasonalRowWeight(game(2024, 4), origin, spec)).toBe(0.5);
  expect(seasonalRowWeight(game(2024, 9), origin, spec)).toBe(0);
});
it('calibration and learned book weights exclude target/current/future weeks, clone input and reject duplicate/non-finite data', () => {
  const origin = game(2024, 7),
    future = rows.filter((r) => r.game.week >= 7).map((r) => ({ ...r, y: 1 - r.y })),
    prior = rows.filter((r) => r.game.week < 7);
  for (const rule of ['direct', 'adaptive-book'] as const) {
    const s = { ...spec, priorSeasonWeight: 0.25 as const, rule },
      a = prepareSeasonalTotalAdapter(rows, s),
      b = prepareSeasonalTotalAdapter([...prior, ...future], s);
    expect(a.probability(origin, 0.45, 0.5)).toBeCloseTo(b.probability(origin, 0.45, 0.5), 12);
  }
  const input = structuredClone(rows),
    settings = { ...spec },
    adapter = prepareSeasonalTotalAdapter(input, settings),
    p = adapter.probability(origin, 0.45, 0.5);
  input.forEach((r) => {
    r.y = 0;
  });
  settings.penalty = 100;
  expect(adapter.probability(origin, 0.45, 0.5)).toBe(p);
  expect(() => prepareSeasonalTotalAdapter([...rows, rows[0]!], spec)).toThrow('Invalid bounded');
  expect(() => prepareSeasonalTotalAdapter([{ ...rows[0]!, probability: NaN }], spec)).toThrow(
    'Invalid bounded',
  );
});
it('hybrid dispatch preserves production moneyline/spread exactly and withholds all same-week/future outcomes', () => {
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
    hybrid = prepareSeasonalHybridModel(model, { ...spec, rule: 'adaptive-book' });
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
    other = prepareGameRatingModel(changed),
    updated = prepareSeasonalHybridModel(other, { ...spec, rule: 'adaptive-book' }),
    q2 = other.observations.find((r) => r.game.id === target.id)!.markets.total!;
  expect(updated.probability('total', target, q2.raw, q2.baseline)).toBeCloseTo(p, 12);
});
