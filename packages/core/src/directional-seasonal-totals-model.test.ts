import { expect, it } from 'vitest';
import type { FootballGame } from './advice-types.js';
import { prepareGameRatingModel } from './game-rating-model.js';
import {
  prepareSeasonalExternalTotalsModel,
  type SeasonalExternalRow,
} from './seasonal-external-totals-model.js';
import {
  prepareDirectionalSeasonalTotalsModel,
  projectDirectionalTotalFeatures,
  directionalTotalPolicy,
  priceOnlyTotalPolicy,
} from './directional-seasonal-totals-model.js';
function fixture() {
  const games: FootballGame[] = [];
  for (let season = 2021; season <= 2025; season++)
    for (let week = 1; week <= 18; week++)
      for (let i = 0; i < 8; i++) {
        const date = new Date(Date.UTC(season, 8, 1 + 7 * (week - 1))).toISOString().slice(0, 10);
        games.push({
          id: `${season}_${week}_${i}`,
          season,
          week,
          seasonType: 'REG',
          date,
          kickoffAt: date + 'T18:00:00.000Z',
          home: ['KC', 'BUF', 'DAL', 'PHI', 'ARI', 'ATL', 'BAL', 'CAR'][i]!,
          away: ['DEN', 'MIA', 'NYG', 'WAS', 'CHI', 'CIN', 'CLE', 'DET'][i]!,
          homeScore: 20 + i,
          awayScore: 20,
          totalLine: 44.5,
          spreadLine: 3.5,
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
  const rows: SeasonalExternalRow[] = games
    .filter((g) => g.season === 2025)
    .map((game, i) => ({
      game,
      book: 0.5,
      y: i % 2 ? 0 : 1,
      supported: true,
      x: Array.from({ length: 18 }, (_, j) =>
        j === 0 ? (i % 2 ? -0.8 : 0.8) : directionalTotalPolicy.removedIndices.includes(j) ? 1 : 0,
      ),
    }));
  return {
    games,
    rows,
    model: prepareGameRatingModel(games),
    target: rows.find((r) => r.game.week === 10)!,
  };
}
const spec = { halfLifeWeeks: 4, priorSeasonWeight: 0 } as const;
it('also supports a fixed price-only control with no learned liquidity or wallet direction', () => {
  const { model, rows, target } = fixture(),
    a = prepareDirectionalSeasonalTotalsModel(model, rows, spec, 'prices-only');
  const before = a.forecast(target.game, 0.5, target.x, true);
  const changed = rows.map((r) => ({
    ...r,
    x: r.x.map((v, i) => (priceOnlyTotalPolicy.removedIndices.includes(i) ? (r.y ? 4 : -4) : v)),
  }));
  const b = prepareDirectionalSeasonalTotalsModel(model, changed, spec, 'prices-only');
  expect(
    b.forecast(target.game, 0.5, changed.find((r) => r.game.id === target.game.id)!.x, true),
  ).toEqual(before);
  expect(before.probability).toBeGreaterThan(0.5);
});
it('forces removal during training and inference, while retaining the old directional engine exactly', () => {
  const { model, rows, target } = fixture(),
    a = prepareDirectionalSeasonalTotalsModel(model, rows, spec),
    old = prepareSeasonalExternalTotalsModel(model, rows, { ...spec, features: 'directional' });
  const prediction = a.forecast(target.game, 0.5, target.x, true);
  expect(prediction).toEqual(old.forecast(target.game, 0.5, target.x, true));
  expect(prediction.probability).toBeGreaterThan(0.5);
  const changed = rows.map((r) => ({
    ...r,
    x: r.x.map((v, i) => (directionalTotalPolicy.removedIndices.includes(i) ? (r.y ? 4 : -4) : v)),
  }));
  const b = prepareDirectionalSeasonalTotalsModel(model, changed, spec);
  expect(
    b.forecast(target.game, 0.5, changed.find((r) => r.game.id === target.game.id)!.x, true),
  ).toEqual(prediction);
  const shape = projectDirectionalTotalFeatures(Array.from({ length: 18 }, (_, i) => i / 10));
  expect(directionallyKept(shape)).toEqual(directionalTotalPolicy.retainedIndices);
  function directionallyKept(x: number[]) {
    return x.map((v, i) => (v !== 0 || i === 0 ? i : -1)).filter((i) => i >= 0);
  }
  expect(() =>
    prepareDirectionalSeasonalTotalsModel(model, rows, { ...spec, features: 'all' } as typeof spec),
  ).toThrow('specification');
});
it('keeps eligibility gates, rejects malformed removed values, and preserves non-total calculations', () => {
  const { model, rows, target } = fixture(),
    a = prepareDirectionalSeasonalTotalsModel(model, rows, spec);
  expect(() => projectDirectionalTotalFeatures(Array(18).fill(NaN))).toThrow();
  const bad = [...target.x];
  bad[5] = Infinity;
  expect(() => a.forecast(target.game, 0.5, bad, true)).toThrow();
  const absent = rows.map((r) => ({ ...r, supported: false })),
    b = prepareDirectionalSeasonalTotalsModel(model, absent, spec);
  expect(b.forecast(target.game, 0.5, target.x, false).probability).toBe(0.5);
  const q = model.observations.find((r) => r.game.id === target.game.id)!;
  for (const kind of ['moneyline', 'spread'] as const) {
    const market = q.markets[kind]!;
    expect(a.probability(kind, target.game, market.raw, market.baseline, [], false)).toBe(
      model.adjust(kind, target.game, market.raw, market.baseline),
    );
  }
});
it('excludes current/future labels and retained signals from earlier feedback and fitting', () => {
  const { model, rows, target } = fixture(),
    a = prepareDirectionalSeasonalTotalsModel(model, rows, spec),
    before = a.forecast(target.game, 0.5, target.x, true);
  const future = rows.map((r) =>
    r.game.week >= 10
      ? { ...r, y: (1 - r.y) as 0 | 1, x: r.game.week > 10 ? Array(18).fill(4) : r.x }
      : r,
  );
  expect(
    prepareDirectionalSeasonalTotalsModel(model, future, spec).forecast(
      target.game,
      0.5,
      target.x,
      true,
    ),
  ).toEqual(before);
  const earlier = rows.map((r) => (r.game.week < 10 ? { ...r, y: (1 - r.y) as 0 | 1 } : r));
  expect(
    prepareDirectionalSeasonalTotalsModel(model, earlier, spec).forecast(
      target.game,
      0.5,
      target.x,
      true,
    ).probability,
  ).toBeLessThan(0.5);
});
