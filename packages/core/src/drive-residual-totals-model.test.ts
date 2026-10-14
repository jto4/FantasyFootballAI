import { it, expect } from 'vitest';
import type { FootballGame } from './advice-types.js';
import { prepareGameRatingModel } from './game-rating-model.js';
import {
  prepareDriveResidualTotalsModel,
  type DriveResidualRow,
} from './drive-residual-totals-model.js';
function fixture() {
  const games: FootballGame[] = [],
    rows: DriveResidualRow[] = [];
  for (let season = 2023; season <= 2025; season++)
    for (let week = 1; week <= 18; week++)
      for (let i = 0; i < 4; i++) {
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
            homeScore: i % 2 ? 30 : 14,
            awayScore: 24,
            totalLine: 44.5,
            spreadLine: 3.5,
            archivedOdds: {
              homeMoneyline: -135,
              awayMoneyline: 115,
              overOdds: -110,
              underOdds: -110,
              homeSpreadOdds: -110,
              awaySpreadOdds: -110,
            },
          };
        games.push(game);
        rows.push({
          game,
          book: 0.5,
          y: i % 2 ? 1 : 0,
          residual: i % 2 ? 9.5 : -6.5,
          supported: true,
          x: Array.from({ length: 18 }, (_, j) => (j === 0 ? (i % 2 ? 1 : -1) : 0)),
        });
      }
  return { games, rows, model: prepareGameRatingModel(games) };
}
const spec = { penalty: 25, flow: false } as const;
it('learns scoring-margin severity and verifies the non-total dispatch exactly', () => {
  const { games, rows, model } = fixture(),
    a = prepareDriveResidualTotalsModel(model, rows, spec),
    r = rows.find((r) => r.game.season === 2025 && r.game.week === 10 && r.y === 1)!,
    out = a.forecast(r.game, r.book, r.x, true);
  expect(out.probability).toBeGreaterThan(0.5);
  expect(out.probability).toBeLessThan(0.59);
  expect(out.reliability.weight).toBeGreaterThan(0);
  for (const kind of ['moneyline', 'spread'] as const) {
    const q = { raw: 0.6, baseline: 0.5 };
    expect(a.probability(kind, r.game, q.raw, q.baseline, [], false)).toBe(
      model.adjust(kind, r.game, q.raw, q.baseline),
    );
  }
  expect(a.weight(games.at(-1)!, games.at(-1)!)).toBe(0);
});
it('keeps earlier forecasts invariant to current/future labels and features', () => {
  const { rows, model } = fixture(),
    r = rows.find((r) => r.game.season === 2025 && r.game.week === 10)!,
    out = prepareDriveResidualTotalsModel(model, rows, spec).forecast(r.game, r.book, r.x, true),
    changed = rows.map((q) =>
      q.game.season === 2025 && q.game.week >= 10
        ? {
            ...q,
            y: (1 - q.y) as 0 | 1,
            residual: -q.residual,
            x: q.game.week > 10 ? Array(18).fill(4) : q.x,
          }
        : q,
    );
  expect(
    prepareDriveResidualTotalsModel(model, changed, spec).forecast(r.game, r.book, r.x, true),
  ).toEqual(out);
  const earlier = rows.map((q) =>
    q.game.season < 2025 || q.game.week < 10
      ? { ...q, residual: -q.residual, y: (1 - q.y) as 0 | 1 }
      : q,
  );
  expect(
    prepareDriveResidualTotalsModel(model, earlier, spec).forecast(r.game, r.book, r.x, true)
      .rawProbability,
  ).not.toBe(out.rawProbability);
});
it('ablation masks all flow columns, missing football coverage falls back, and identities are checked', () => {
  const { rows, model } = fixture(),
    r = rows.at(-1)!,
    a = prepareDriveResidualTotalsModel(model, rows, spec),
    b = prepareDriveResidualTotalsModel(
      model,
      rows.map((q) => ({ ...q, x: [...q.x.slice(0, 14), 4, -4, 4, -4] })),
      spec,
    );
  expect(b.forecast(r.game, r.book, [...r.x.slice(0, 14), 4, -4, 4, -4], true)).toEqual(
    a.forecast(r.game, r.book, r.x, true),
  );
  const missing = rows.map((q) => ({ ...q, supported: false }));
  expect(
    prepareDriveResidualTotalsModel(model, missing, spec).forecast(r.game, r.book, r.x, false)
      .probability,
  ).toBe(r.book);
  expect(() => a.forecast({ ...r.game, totalLine: 50 }, r.book, r.x, true)).toThrow(/identity/);
  expect(() =>
    prepareDriveResidualTotalsModel(model, [{ ...r, x: Array(18).fill(NaN) }], spec),
  ).toThrow();
});
