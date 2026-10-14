import { expect, it } from 'vitest';
import type { FootballGame } from './advice-types.js';
import { prepareGameRatingModel } from './game-rating-model.js';
import {
  prepareSeasonalExternalTotalsModel,
  type SeasonalExternalRow,
} from './seasonal-external-totals-model.js';
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
  return games;
}
function rows(games: FootballGame[]): SeasonalExternalRow[] {
  return games
    .filter((g) => g.season >= 2024)
    .map((game, i) => ({
      game,
      book: 0.5,
      y: i % 2 ? 0 : 1,
      supported: true,
      x: Array.from({ length: 18 }, (_, j) => (j === 0 ? (i % 2 ? -0.8 : 0.8) : 0)),
    }));
}
const spec = { halfLifeWeeks: 4, priorSeasonWeight: 0, features: 'directional' } as const;
it('decays completed earlier weeks, resets between seasons and weakens optional prior seasons', () => {
  const games = fixture(),
    input = rows(games),
    model = prepareGameRatingModel(games),
    a = prepareSeasonalExternalTotalsModel(model, input, spec),
    origin = games.find((g) => g.season === 2025 && g.week === 2)!;
  const g = (season: number, week: number) =>
    games.find((g) => g.season === season && g.week === week)!;
  expect(a.weight(origin, g(2025, 1))).toBeCloseTo(2 ** (-1 / 4));
  expect(a.weight(origin, g(2025, 2))).toBe(0);
  expect(a.weight(origin, g(2024, 18))).toBe(0);
  const carry = prepareSeasonalExternalTotalsModel(model, input, {
    ...spec,
    priorSeasonWeight: 0.25,
  });
  expect(carry.weight(origin, g(2024, 18))).toBeCloseTo(0.25 * 2 ** (-1 / 4));
  expect(carry.weight(origin, g(2024, 1))).toBeCloseTo(0.25 * 2 ** (-18 / 4));
  expect(carry.weight(origin, g(2022, 18))).toBe(0);
});
it('uses earlier prequential feedback, excludes current/future labels and features, and preserves non-totals', () => {
  const games = fixture(),
    input = rows(games),
    model = prepareGameRatingModel(games),
    target = input.find((r) => r.game.season === 2025 && r.game.week === 10)!;
  const a = prepareSeasonalExternalTotalsModel(model, input, spec),
    first = a.forecast(target.game, target.book, target.x, true);
  expect(first.probability).toBeGreaterThan(0.5);
  expect(first.reliability.weight).toBeGreaterThan(0);
  const mutated = input.map((r) =>
    r.game.season === 2025 && r.game.week >= 10
      ? { ...r, y: (1 - r.y) as 0 | 1, x: r.game.week > 10 ? Array(18).fill(4) : r.x }
      : r,
  );
  const b = prepareSeasonalExternalTotalsModel(model, mutated, spec);
  expect(b.forecast(target.game, 0.5, target.x, true)).toEqual(first);
  const changedPast = input.map((r) =>
    r.game.season === 2025 && r.game.week < 10 ? { ...r, y: (1 - r.y) as 0 | 1 } : r,
  );
  expect(
    prepareSeasonalExternalTotalsModel(model, changedPast, spec).forecast(
      target.game,
      0.5,
      target.x,
      true,
    ).probability,
  ).toBeLessThan(0.5);
  const observation = model.observations.find((r) => r.game.id === target.game.id)!;
  for (const kind of ['moneyline', 'spread'] as const) {
    const q = observation.markets[kind]!;
    expect(a.probability(kind, target.game, q.raw, q.baseline, target.x, true)).toBe(
      model.adjust(kind, target.game, q.raw, q.baseline),
    );
  }
});
it('rejects learning unsigned coverage/volume as direction, and returns exact book for cold or poor feedback', () => {
  const games = fixture(),
    model = prepareGameRatingModel(games),
    input = rows(games),
    origin = input.find((r) => r.game.season === 2025 && r.game.week === 10)!;
  const coverage = input.map((r) => ({
    ...r,
    y: 1 as const,
    x: Array.from({ length: 18 }, (_, i) => ([2, 5, 8, 11, 14, 17].includes(i) ? 1 : 0)),
  }));
  const a = prepareSeasonalExternalTotalsModel(model, coverage, spec);
  expect(
    a.forecast(origin.game, 0.5, coverage.find((r) => r.game.id === origin.game.id)!.x, true)
      .probability,
  ).toBe(0.5);
  const cold = input.find((r) => r.game.season === 2025 && r.game.week === 1)!;
  expect(
    prepareSeasonalExternalTotalsModel(model, input, spec).forecast(cold.game, 0.5, cold.x, true)
      .probability,
  ).toBe(0.5);
  const reversal = input
    .filter((r) => r.game.season === 2025)
    .map((r) => ({
      ...r,
      y: (r.game.week % 2 ? 1 : 0) as 0 | 1,
      x: Array.from({ length: 18 }, (_, i) => (i === 0 ? 0.8 : 0)),
    }));
  const hostile = prepareSeasonalExternalTotalsModel(model, reversal, spec),
    r = reversal.find((r) => r.game.week === 10)!;
  const f = hostile.forecast(r.game, 0.5, r.x, true);
  expect(f.rawProbability).not.toBe(0.5);
  expect(f.reliability.games).toBeGreaterThanOrEqual(20);
  expect(f.probability).toBe(0.5);
});
it('validates duplicates, vectors, target identities and protects observations from caller mutation', () => {
  const games = fixture(),
    model = prepareGameRatingModel(games),
    input = rows(games),
    target = input.find((r) => r.game.season === 2025 && r.game.week === 10)!;
  expect(() => prepareSeasonalExternalTotalsModel(model, [input[0]!, input[0]!], spec)).toThrow();
  expect(() =>
    prepareSeasonalExternalTotalsModel(model, [{ ...input[0]!, x: Array(18).fill(NaN) }], spec),
  ).toThrow();
  const a = prepareSeasonalExternalTotalsModel(model, input, spec);
  expect(() => a.forecast({ ...target.game, totalLine: 45.5 }, 0.5, target.x, true)).toThrow(
    'identity',
  );
  const original = a.forecast(target.game, 0.5, target.x, true);
  const mutablePast = input.find((r) => r.game.season === 2025 && r.game.week === 1)!;
  mutablePast.x[0] = 4;
  mutablePast.y = 0;
  mutablePast.game.date = '2025-12-31';
  expect(a.forecast(target.game, 0.5, target.x, true)).toEqual(original);
});
