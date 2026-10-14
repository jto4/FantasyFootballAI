import { expect, it } from 'vitest';
import { prepareGameRatingModel } from './game-rating-model.js';
import {
  prepareExternalTotalsModel,
  mediaTotalFeatures,
  validateExternalTotalTape,
  type ExternalTotalTape,
} from './external-total-signals.js';
import type { FootballGame } from './advice-types.js';
const codes = 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC'.split(' ');
function fixture() {
  const games: FootballGame[] = [];
  for (let season = 2018; season <= 2024; season++)
    for (let week = 1; week <= 18; week++)
      for (let i = 0; i < 8; i++) {
        const date = new Date(Date.UTC(season, 8, 1 + 7 * (week - 1))).toISOString().slice(0, 10),
          home = codes[i]!,
          away = codes[8 + ((i + week) % 8)]!;
        games.push({
          id: `${season}_${String(week).padStart(2, '0')}_${away}_${home}`,
          season,
          week,
          seasonType: 'REG',
          date,
          kickoffAt: date + 'T18:00:00.000Z',
          home,
          away,
          homeScore: 20 + (i % 3),
          awayScore: 18 + (week % 3),
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
function tape(g: FootballGame): ExternalTotalTape {
  const cutoffAt = new Date(Date.parse(g.kickoffAt!) - 1800000).toISOString(),
    end = Date.parse(cutoffAt);
  return {
    gameId: g.id,
    provider: 'polymarket',
    contractId: '0x' + 'a'.repeat(64),
    line: 44.5,
    kickoffAt: g.kickoffAt!,
    cutoffAt,
    capturedAt: '2026-10-13T12:00:00.000Z',
    createdAt: new Date(end - 3 * 86400000).toISOString(),
    windowStartAt: new Date(end - 86400000).toISOString(),
    complete: true,
    prices: [{ at: new Date(end - 600000).toISOString(), probability: g.week % 2 ? 0.4 : 0.6 }],
    trades: Array.from({ length: 30 }, (_, i) => ({
      id: `${g.id}:${i}`,
      at: new Date(end - (i < 25 ? 7200000 : 600000)).toISOString(),
      shares: i < 25 ? 10 : 2000,
      price: 0.5,
      overProbability: 0.5,
      direction: i % 2 ? 1 : -1,
      walletHash: 'a'.repeat(64),
    })),
  };
}
it('uses exact lines/identities, excludes post-cutoff evidence and treats incomplete flow as unavailable', () => {
  const games = fixture(),
    model = prepareGameRatingModel(games),
    g = games.at(-1)!,
    t = tape(g);
  const create = (ts: ExternalTotalTape[], family: 'price' | 'flow' = 'price') =>
    prepareExternalTotalsModel(model, ts, [], family).features(g, 0.5, t.cutoffAt);
  expect(create([t]).supported).toBe(true);
  expect(create([{ ...t, line: 43.5 }]).supported).toBe(false);
  expect(
    create([{ ...t, kickoffAt: new Date(Date.parse(g.kickoffAt!) + 60000).toISOString() }])
      .supported,
  ).toBe(false);
  expect(create([{ ...t, complete: false }], 'flow').supported).toBe(false);
  expect(() =>
    validateExternalTotalTape({ ...t, prices: [{ at: g.kickoffAt!, probability: 0.5 }] }),
  ).toThrow();
  expect(() => prepareExternalTotalsModel(model, [t, t], [], 'price')).toThrow('Duplicate');
  expect(() => validateExternalTotalTape({ ...t, trades: [t.trades[0]!, t.trades[0]!] })).toThrow();
});
it('future outcomes/snapshots do not affect earlier fitted corrections or wallet scores; non-totals are exact', () => {
  const games = fixture(),
    target = games.find((g) => g.season === 2024 && g.week === 10)!,
    tapes = games.filter((g) => g.season >= 2023).map(tape);
  const predict = (input: FootballGame[], ts: ExternalTotalTape[]) => {
    const model = prepareGameRatingModel(input),
      r = model.observations.find((r) => r.game.id === target.id)!;
    const p = prepareExternalTotalsModel(model, ts, [], 'combined'),
      q = r.markets.total!,
      cutoff = tape(target).cutoffAt;
    for (const kind of ['moneyline', 'spread'] as const) {
      const m = r.markets[kind]!;
      expect(p.probability(kind, target, m.raw, m.baseline, cutoff)).toBe(
        model.adjust(kind, target, m.raw, m.baseline),
      );
    }
    return p.probability('total', target, q.raw, q.baseline, cutoff);
  };
  const p = predict(games, tapes);
  expect(
    predict(
      games.map((g) =>
        g.season === 2024 && g.week >= 10 ? { ...g, homeScore: 99, awayScore: 0 } : g,
      ),
      tapes.map((t) =>
        t.gameId > target.id
          ? { ...t, prices: t.prices.map((r) => ({ ...r, probability: 0.99 })) }
          : t,
      ),
    ),
  ).toBe(p);
  expect(p).toBeGreaterThan(0);
  expect(p).toBeLessThan(1);
  const successful = tapes.map((t) => ({
    ...t,
    trades: t.trades.map((r) => ({ ...r, direction: -1 as const })),
  }));
  const model = prepareGameRatingModel(games),
    wallet = prepareExternalTotalsModel(model, successful, [], 'flow');
  expect(wallet.features(target, 0.5, tape(target).cutoffAt).x[15]).toBeLessThan(0);
  const first = games.find((g) => g.season === 2023 && g.week === 1)!;
  expect(wallet.features(first, 0.5, tape(first).cutoffAt).x[15]).toBe(0);
});
it('current headline text cannot be backfilled into historical sentiment or count copied titles as independent', () => {
  const g = fixture().find((g) => g.home === 'BUF')!,
    cutoff = tape(g).cutoffAt,
    story = {
      title: 'Bills prepare for a high-scoring shootout',
      url: 'https://example.com/1',
      source: 'ESPN',
      publishedAt: new Date(Date.parse(cutoff) - 3600000).toISOString(),
    };
  expect(
    mediaTotalFeatures(g, cutoff, [{ capturedAt: '2026-10-13T12:00:00Z', items: [story] }]).matched,
  ).toBe(0);
  expect(
    mediaTotalFeatures(g, cutoff, [
      { capturedAt: cutoff, items: [story, { ...story, source: 'CBS' }] },
    ]).supported,
  ).toBe(false);
  const m = mediaTotalFeatures(g, cutoff, [
    {
      capturedAt: cutoff,
      items: [
        story,
        { ...story, title: 'Bills anticipate high scoring', source: 'CBS' },
        { ...story, title: 'Bills quarterback injury concerns', source: 'PFF' },
      ],
    },
  ]);
  expect(m.supported).toBe(true);
  expect(m.x[0]).toBeGreaterThan(0);
});
