import { expect, it } from 'vitest';
import type { FootballGame } from './advice-types.js';
import { prepareGameRatingModel } from './game-rating-model.js';
import type { TotalFeedbackRow } from './recent-total-feedback.js';
import {
  prepareStableTotalFeedback,
  type StableTotalFeedbackSpec,
} from './stable-total-feedback.js';
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
            homeScore: 30,
            awayScore: 20,
            totalLine: 44.5,
          };
        rows.push({ game, book: 0.5, rawProbability: 0.6, y: 1, supported: true });
      }
  return {
    rows,
    model: prepareGameRatingModel([]),
    get: (week: number, i = 0) =>
      rows.find(
        (r) => r.game.season === 2025 && r.game.week === week && r.game.id.endsWith(`_${i}`),
      )!,
  };
}
const pooled = { method: 'cluster', strength: 1, scope: 'pooled' } as const;
it('withholds trust when apparent alignment depends on one lucky week', () => {
  const { rows, model, get } = fixture(),
    changed = rows.map((r) => ({
      ...r,
      y: (r.game.week === 8 ? 1 : 0) as 0 | 1,
      rawProbability: r.game.week === 8 ? 0.58 : 0.51,
    })),
    origin = get(9);
  for (const spec of [
    pooled,
    { method: 'leave-week-out', strength: 1, scope: 'pooled' } as const,
  ]) {
    const a = prepareStableTotalFeedback(model, changed, spec),
      r = a.forecast(origin.game, 0.5, 0.51, true);
    expect(r.reliability.ordinaryWeight).toBe(0.5);
    expect(r.reliability.weight).toBe(0);
    expect(r.probability).toBe(0.5);
  }
});
it('retains capped trust for consistent evidence across weeks and validates public origins even after caching', () => {
  const { rows, model, get } = fixture(),
    a = prepareStableTotalFeedback(model, rows, pooled),
    origin = get(5),
    r = a.forecast(origin.game, 0.5, 0.6, true);
  expect(r.reliability.weight).toBe(0.5);
  expect(r.probability).toBe(0.55);
  expect(r.reliability.standardError).toBeLessThan(1e-12);
  expect(Object.isFrozen(r.reliability)).toBe(true);
  expect(() => a.reliability({ ...origin.game, kickoffAt: 'invalid' }, 0.5, 0.6)).toThrow();
});
it('keeps same-day directional heads separate so opposing corrections cannot borrow trust', () => {
  const { rows, model, get } = fixture(),
    split = rows.map((r, i) => ({ ...r, rawProbability: i % 16 < 8 ? 0.6 : 0.4 })),
    a = prepareStableTotalFeedback(model, split, { ...pooled, scope: 'directional' }),
    over = get(4, 0),
    under = get(4, 8),
    o = a.forecast(over.game, 0.5, 0.6, true),
    u = a.forecast(under.game, 0.5, 0.4, true);
  expect(o.reliability.games).toBe(24);
  expect(o.reliability.weight).toBe(0.5);
  expect(o.probability).toBe(0.55);
  expect(u.reliability.weight).toBe(0);
  expect(u.probability).toBe(0.5);
  expect(o.reliability.direction).toBe(1);
  expect(u.reliability.direction).toBe(-1);
});
it('excludes future/current labels, expires old weeks and resets without a prior seed', () => {
  const { rows, model, get } = fixture(),
    origin = get(10),
    a = prepareStableTotalFeedback(model, rows, pooled),
    first = a.forecast(origin.game, 0.5, 0.6, true),
    changed = rows.map((r) =>
      r.game.season === 2025 && r.game.week >= 10
        ? { ...r, y: 0 as const, rawProbability: r.game.week > 10 ? 0.4 : r.rawProbability }
        : r,
    );
  expect(
    prepareStableTotalFeedback(model, changed, pooled).forecast(origin.game, 0.5, 0.6, true),
  ).toEqual(first);
  expect(
    first.reliability.weeksDetail.every((r) => {
      const [season, week] = r.key.split(':').map(Number);
      return season === 2025 && week! >= 4 && week! < 10;
    }),
  ).toBe(true);
  const expired = rows.map((r) =>
    r.game.season < 2025 || r.game.week < 4 ? { ...r, y: 0 as const } : r,
  );
  expect(
    prepareStableTotalFeedback(model, expired, pooled).forecast(origin.game, 0.5, 0.6, true),
  ).toEqual(first);
  expect(a.forecast(get(1).game, 0.5, 0.6, true).probability).toBe(0.5);
});
it('requires three distinct weeks, keeps unavailable forecasts at book, and preserves non-totals', () => {
  const { rows, model, get } = fixture(),
    a = prepareStableTotalFeedback(model, rows, pooled),
    origin = get(3),
    out = a.forecast(origin.game, 0.5, 0.6, true);
  expect(out.reliability.games).toBe(32);
  expect(out.reliability.effectiveGames).toBeGreaterThan(12);
  expect(out.reliability.weeks).toBe(2);
  expect(out.reliability.weight).toBe(0);
  const missing = rows.map((r) => ({ ...r, supported: false, rawProbability: 0.5 }));
  expect(
    prepareStableTotalFeedback(model, missing, pooled).forecast(get(10).game, 0.5, 0.5, false)
      .probability,
  ).toBe(0.5);
  for (const kind of ['moneyline', 'spread'] as const)
    expect(a.probability(kind, origin.game, 0.6, 0.5, true)).toBe(
      model.adjust(kind, origin.game, 0.6, 0.5),
    );
});
it('checks identities, duplicate/nonfinite inputs and spec combinations; later caller mutations do not alter policy', () => {
  const { rows, model, get } = fixture(),
    origin = get(10),
    spec: StableTotalFeedbackSpec = { ...pooled },
    a = prepareStableTotalFeedback(model, rows, spec),
    out = a.forecast(origin.game, 0.5, 0.6, true);
  spec.strength = 0.5;
  spec.scope = 'directional';
  expect(a.forecast(origin.game, 0.5, 0.6, true)).toEqual(out);
  expect(() => a.forecast({ ...origin.game, totalLine: 40 }, 0.5, 0.6, true)).toThrow(/identity/);
  expect(() => a.forecast(origin.game, 0.5, 0.59, true)).toThrow(/identity/);
  expect(() => prepareStableTotalFeedback(model, [...rows, rows[0]!], pooled)).toThrow();
  expect(() =>
    prepareStableTotalFeedback(model, [{ ...rows[0]!, rawProbability: NaN }], pooled),
  ).toThrow();
  expect(() =>
    prepareStableTotalFeedback(model, rows, { ...pooled, method: 'leave-week-out', strength: 0.5 }),
  ).toThrow();
});
