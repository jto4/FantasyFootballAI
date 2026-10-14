import { expect, it } from 'vitest';
import { fitBoostedMarket, prepareBoostedMarketModel } from './boosted-market-model.js';
import { prepareGameRatingModel } from './game-rating-model.js';
import type { FootballGame } from './advice-types.js';

it('learns a nonlinear subgroup correction while preserving a balanced book and thin-data fallback', () => {
  const rows = Array.from({ length: 400 }, (_, i) => ({
      x: [i < 200 ? 0 : 1],
      book: 0.5,
      y: i < 200 ? 0 : 1,
      weight: 1,
    })),
    fit = fitBoostedMarket(rows, 1);
  expect(fit([0], 0.5)).toBeLessThan(0.5);
  expect(fit([1], 0.5)).toBeGreaterThan(0.5);
  expect(fitBoostedMarket(rows.slice(0, 20), 1)([1], 0.6)).toBe(0.6);
  const balanced = rows.map((r, i) => ({ ...r, x: [0], y: i % 2 }));
  expect(fitBoostedMarket(balanced, 2)([0], 0.5)).toBe(0.5);
  expect(fit([1], 0.9)).toBeLessThan(1);
  for (const patch of [{ book: 0 }, { book: NaN }, { y: 2 }, { x: [Infinity] }, { weight: 0 }])
    expect(() => fitBoostedMarket([{ ...rows[0]!, ...patch }], 1)).toThrow('Invalid bounded');
});
function fixture() {
  const games: FootballGame[] = [];
  for (let season = 2018; season <= 2024; season++)
    for (let week = 1; week <= 18; week++)
      for (let i = 0; i < 8; i++) {
        const date = new Date(Date.UTC(season, 8, 1 + 7 * (week - 1))).toISOString().slice(0, 10);
        games.push({
          id: `${season}-${week}-${i}`,
          season,
          week,
          seasonType: 'REG',
          date,
          home: `T${i}`,
          away: `T${8 + ((i + week) % 8)}`,
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
      }
  return games;
}
it('tree fits and adaptive weights exclude target, same-week and future outcomes and remain deterministic', () => {
  const games = fixture(),
    target = games.find((g) => g.season === 2023 && g.week === 10)!,
    changed = games.map((g) =>
      g.season > target.season || (g.season === target.season && g.week >= target.week)
        ? { ...g, homeScore: 0, awayScore: 99 }
        : g,
    );
  const predict = (input: FootballGame[], rule: 'direct' | 'adaptive-book') => {
    const model = prepareGameRatingModel(input),
      q = model.observations.find((r) => r.game.id === target.id)!.markets.total!,
      tree = prepareBoostedMarketModel(model, {
        depth: 2,
        halfLifeDays: 120,
        features: 'all',
        rule,
      });
    return tree.probability('total', target, q.raw, q.baseline);
  };
  for (const rule of ['direct', 'adaptive-book'] as const) {
    const p = predict(games, rule);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    expect(predict(changed, rule)).toBeCloseTo(p, 12);
  }
});
