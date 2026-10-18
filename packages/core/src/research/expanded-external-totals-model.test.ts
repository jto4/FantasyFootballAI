import { expect, it } from 'vitest';
import type { FootballGame } from '../advice-types.js';
import { prepareGameRatingModel } from '../game-rating-model.js';
import { validateExpandedTotalTape, type ExpandedTotalTape } from '../expanded-total-tape.js';
import { prepareExpandedExternalTotalsModel } from './expanded-external-totals-model.js';
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
          homeScore: week % 2 ? 17 : 27,
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
function tape(g: FootballGame): ExpandedTotalTape {
  const end = Date.parse(g.kickoffAt!) - 1800000,
    cutoffAt = new Date(end).toISOString();
  const trade = (i: number, early = false) => ({
    id: `${g.id}:${early ? 'early' : 'late'}:${i}`,
    at: new Date(end - (early ? 2 * 86400000 : i < 25 ? 7200000 : 600000)).toISOString(),
    shares: 2000,
    price: 0.5,
    overProbability: 0.5,
    direction: (g.week % 2 ? -1 : 1) as -1 | 1,
    walletHash: 'a'.repeat(64),
  });
  return {
    gameId: g.id,
    provider: 'polymarket',
    contractId: '0x' + 'a'.repeat(64),
    line: 44.5,
    kickoffAt: g.kickoffAt!,
    cutoffAt,
    capturedAt: '2026-10-13T12:00:00.000Z',
    createdAt: new Date(end - 8 * 86400000).toISOString(),
    windowStartAt: new Date(end - 86400000).toISOString(),
    complete: true,
    prices: [{ at: new Date(end - 600000).toISOString(), probability: g.week % 2 ? 0.4 : 0.6 }],
    trades: Array.from({ length: 30 }, (_, i) => trade(i)),
    earlyWindowStartAt: new Date(end - 7 * 86400000).toISOString(),
    earlyComplete: true,
    earlyTrades: Array.from({ length: 10 }, (_, i) => trade(i, true)),
  };
}
it('rejects earlier-window duplicates, invalid boundaries and oversized windows', () => {
  const t = tape(fixture().at(-1)!);
  expect(() => validateExpandedTotalTape(t)).not.toThrow();
  expect(() => validateExpandedTotalTape({ ...t, earlyTrades: [t.trades[0]!] })).toThrow();
  expect(() =>
    validateExpandedTotalTape({ ...t, earlyWindowStartAt: '2020-01-01T00:00:00.000Z' }),
  ).toThrow();
  expect(() =>
    validateExpandedTotalTape({
      ...t,
      earlyTrades: [{ ...t.earlyTrades![0]!, at: t.windowStartAt }],
    }),
  ).toThrow();
});
it('treats missing history as an exact book tie, and gates incomplete early windows', () => {
  const games = fixture(),
    model = prepareGameRatingModel(games),
    g = games.at(-1)!,
    t = tape(g),
    spec = { family: 'positions', anchor: 'book', penalty: 400 } as const;
  const empty = prepareExpandedExternalTotalsModel(model, [], spec);
  expect(empty.probability(g, 0.7, 0.5, t.cutoffAt)).toBe(0.5);
  const f = prepareExpandedExternalTotalsModel(
    model,
    [{ ...t, earlyComplete: false }],
    spec,
  ).features(g, 0.5, t.cutoffAt);
  expect(f.earlyCount).toBe(0);
  expect(f.flowCount).toBe(1);
  expect(
    prepareExpandedExternalTotalsModel(model, [{ ...t, line: 45.5 }], spec).features(
      g,
      0.5,
      t.cutoffAt,
    ).supported,
  ).toBe(false);
});
it('freezes target and future labels out of predictions and wallet weights, and removes stale seasons', () => {
  const games = fixture(),
    target = games.find((g) => g.season === 2025 && g.week === 10)!,
    tapes = games.filter((g) => g.season >= 2023).map(tape);
  const spec = { family: 'positions', anchor: 'book', penalty: 100 } as const;
  const predict = (gs: FootballGame[], ts: ExpandedTotalTape[]) => {
    const model = prepareGameRatingModel(gs),
      r = model.observations.find((r) => r.game.id === target.id)!,
      q = r.markets.total!,
      a = prepareExpandedExternalTotalsModel(model, ts, spec);
    return {
      p: a.probability(target, q.raw, q.baseline, tape(target).cutoffAt),
      f: a.features(target, q.baseline, tape(target).cutoffAt),
      fit: a.fit(target),
    };
  };
  const original = predict(games, tapes);
  expect(original.p).not.toBe(0.5);
  expect(original.f.walletCount).toBe(1);
  const mutated = games.map((g) =>
    g.season === 2025 && g.week >= 10 ? { ...g, homeScore: 70, awayScore: 70 } : g,
  );
  const future = new Set(games.filter((g) => g.season === 2025 && g.week > 10).map((g) => g.id));
  const changed = predict(
    mutated,
    tapes.map((t) =>
      future.has(t.gameId)
        ? {
            ...t,
            prices: t.prices.map((p) => ({ ...p, probability: 0.99 })),
            trades: t.trades.map((r) => ({ ...r, direction: 1 as const })),
          }
        : t,
    ),
  );
  expect(changed).toEqual(original);
  const stale = games.map((g) => (g.season < 2023 ? { ...g, homeScore: 100, awayScore: 100 } : g));
  expect(predict(stale, tapes)).toEqual(original);
  expect(() =>
    prepareExpandedExternalTotalsModel(prepareGameRatingModel(games), [tapes[0]!, tapes[0]!], spec),
  ).toThrow('Duplicate');
});
