import { expect, it } from 'vitest';
import type { FootballGame } from './advice-types.js';
import { prepareGameRatingModel } from './game-rating-model.js';
import { prepareRecentTotalFeedback, type TotalFeedbackRow } from './recent-total-feedback.js';
function fixture() {
  const rows: TotalFeedbackRow[] = [];
  for (let season = 2024; season <= 2025; season++)
    for (let week = 1; week <= 18; week++)
      for (let i = 0; i < 16; i++) {
        const date = new Date(Date.UTC(season, 8, 1 + 7 * (week - 1))).toISOString().slice(0, 10),
          game: FootballGame = {
            id: `${season}_${week}_${i}`,
            season,
            week,
            seasonType: 'REG',
            date,
            kickoffAt: date + 'T18:00:00.000Z',
            home: 'KC',
            away: 'BUF',
            totalLine: 44.5,
            homeScore: 30,
            awayScore: 20,
          };
        rows.push({ game, book: 0.5, rawProbability: 0.6, y: 1, supported: true });
      }
  return {
    rows,
    model: prepareGameRatingModel([]),
    get: (season: number, week: number) =>
      rows.find((r) => r.game.season === season && r.game.week === week)!,
  };
}
const reset = { halfLifeWeeks: 2, maxWeight: 0.5, priorSeed: false } as const;
it('resets feedback between seasons, bounds corrections, and preserves moneyline/spread dispatch exactly', () => {
  const { rows, model, get } = fixture(),
    a = prepareRecentTotalFeedback(model, rows, reset),
    origin = get(2025, 1);
  expect(a.forecast(origin.game, 0.5, 0.6, true).probability).toBe(0.5);
  const trained = get(2025, 4),
    out = a.forecast(trained.game, 0.5, 0.6, true);
  expect(out.reliability.weight).toBe(0.5);
  expect(out.probability).toBe(0.55);
  for (const kind of ['moneyline', 'spread'] as const)
    expect(a.probability(kind, trained.game, 0.6, 0.5, true)).toBe(
      model.adjust(kind, trained.game, 0.6, 0.5),
    );
});
it('limits the prior seed to one equivalent week and fades it out completely', () => {
  const { rows, model, get } = fixture(),
    a = prepareRecentTotalFeedback(model, rows, { ...reset, priorSeed: true });
  for (const week of [1, 2, 3, 4, 5, 10]) {
    const r = a.reliability(get(2025, week).game);
    expect(r.seedEffectiveGames).toBeLessThanOrEqual(16 * Math.max(0, 1 - (week - 1) / 4) + 1e-10);
    if (week >= 5) {
      expect(r.seedGames).toBe(0);
      expect(r.contributions.every((q) => q.season === 2025)).toBe(true);
    }
  }
  expect(a.reliability(get(2025, 1).game).weight).toBe(0.5);
});
it('responds to recent deterioration and recovers using raw forecasts made while trust is zero', () => {
  const { rows, model, get } = fixture(),
    changed = rows.map((r) => ({
      ...r,
      y: (r.game.season === 2025 && r.game.week >= 5 && r.game.week <= 10 ? 0 : 1) as 0 | 1,
    })),
    a = prepareRecentTotalFeedback(model, changed, reset);
  expect(a.reliability(get(2025, 5).game).weight).toBe(0.5);
  expect(a.reliability(get(2025, 9).game).weight).toBe(0);
  expect(a.reliability(get(2025, 11).game).weight).toBe(0);
  expect(a.reliability(get(2025, 15).game).weight).toBe(0.5);
  expect(a.reliability(get(2025, 15).game).contributions.some((r) => r.week >= 11)).toBe(true);
});
it('excludes same/future weeks and future labels/raw forecasts; old/out-of-season results expire', () => {
  const { rows, model, get } = fixture(),
    origin = get(2025, 10),
    a = prepareRecentTotalFeedback(model, rows, reset),
    first = a.forecast(origin.game, 0.5, 0.6, true),
    mutated = rows.map((r) =>
      r.game.season === 2025 && r.game.week >= 10
        ? { ...r, y: (1 - r.y) as 0 | 1, rawProbability: r.game.week > 10 ? 0.4 : r.rawProbability }
        : r,
    );
  expect(
    prepareRecentTotalFeedback(model, mutated, reset).forecast(origin.game, 0.5, 0.6, true),
  ).toEqual(first);
  expect(
    first.reliability.contributions.every((r) => r.season === 2025 && r.week >= 4 && r.week < 10),
  ).toBe(true);
  const expired = rows.map((r) =>
    r.game.season < 2025 || r.game.week < 4 ? { ...r, y: 0 as const } : r,
  );
  expect(
    prepareRecentTotalFeedback(model, expired, reset).forecast(origin.game, 0.5, 0.6, true),
  ).toEqual(first);
});
it('applies a 48-hour lag and evidence gates even when many outcomes exist in one week', () => {
  const { rows, model, get } = fixture(),
    origin = get(2025, 4),
    oneWeekBase = rows.filter((r) => r.game.season === 2025 && r.game.week === 3),
    oneWeek = [
      ...oneWeekBase,
      ...oneWeekBase.map((r) => ({ ...r, game: { ...r.game, id: r.game.id + '-repeat' } })),
    ],
    a = prepareRecentTotalFeedback(model, oneWeek, reset);
  expect(a.reliability(origin.game).games).toBe(32);
  expect(a.reliability(origin.game).effectiveGames).toBeGreaterThan(12);
  expect(a.reliability(origin.game).weeks).toBe(1);
  expect(a.reliability(origin.game).weight).toBe(0);
  const originDate = new Date(Date.parse(get(2025, 3).game.date) + 24 * 3600000)
      .toISOString()
      .slice(0, 10),
    lagged = { ...origin.game, date: originDate, kickoffAt: originDate + 'T18:00:00.000Z' };
  expect(
    prepareRecentTotalFeedback(model, rows, reset)
      .reliability(lagged)
      .contributions.every((r) => r.week < 3),
  ).toBe(true);
});
it('rejects malformed source probabilities, duplicates, changed forecast identities and invalid specs', () => {
  const { rows, model, get } = fixture(),
    r = get(2025, 10),
    a = prepareRecentTotalFeedback(model, rows, reset);
  expect(() => prepareRecentTotalFeedback(model, [...rows, rows[0]!], reset)).toThrow();
  expect(() => prepareRecentTotalFeedback(model, [{ ...r, rawProbability: NaN }], reset)).toThrow();
  expect(() => prepareRecentTotalFeedback(model, [{ ...r, supported: false }], reset)).toThrow();
  expect(() => a.forecast({ ...r.game, totalLine: 45 }, 0.5, 0.6, true)).toThrow(/identity/);
  expect(() => a.forecast(r.game, 0.5, 0.59, true)).toThrow(/identity/);
  expect(() =>
    prepareRecentTotalFeedback(model, rows, { ...reset, halfLifeWeeks: 8 } as never),
  ).toThrow();
  const missing = rows.map((r) => ({ ...r, supported: false, rawProbability: r.book }));
  expect(
    prepareRecentTotalFeedback(model, missing, reset).forecast(r.game, 0.5, 0.5, false).probability,
  ).toBe(0.5);
});
