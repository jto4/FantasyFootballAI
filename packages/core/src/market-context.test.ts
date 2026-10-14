import { expect, it } from 'vitest';
import { correctionWeight, priorMarketContext } from './market-context.js';
import type { FootballGame } from './advice-types.js';
const origin: FootballGame = {
  id: 'target',
  season: 2025,
  week: 5,
  seasonType: 'REG',
  date: '2025-10-05',
  home: 'KC',
  away: 'BUF',
};
const game = (extra: Partial<FootballGame>): FootballGame => ({
  ...origin,
  id: 'earlier',
  week: 4,
  date: '2025-09-28',
  homeScore: 30,
  awayScore: 10,
  spreadLine: 3.5,
  totalLine: 44.5,
  ...extra,
});
it('uses actual earlier team dates for rest, defaults missing history and caps offseason gaps', () => {
  expect(priorMarketContext([], origin)).toEqual({
    restDifference: 0,
    restTotal: 0,
    teamMargin: 0,
    teamTotal: 0,
  });
  const context = priorMarketContext(
    [game({ home: 'KC', away: 'DEN', date: '2025-09-25' }), game({ home: 'BUF', away: 'NYJ' })],
    origin,
  );
  expect(context.restDifference).toBeCloseTo(3 / 7);
  expect(context.restTotal).toBeCloseTo(3 / 14);
  const old = priorMarketContext([game({ season: 2024, date: '2024-09-28' })], origin);
  expect(old.restDifference).toBe(0);
  expect(old.restTotal).toBe(1);
});
it('orients historical handicap residuals for the team, normalizes aliases, excludes target and later weeks', () => {
  const prior = [game({})],
    context = priorMarketContext(prior, origin);
  expect(context.teamMargin).toBeGreaterThan(0);
  expect(context.teamTotal).toBeLessThan(0);
  expect(priorMarketContext(prior, { ...origin, home: ' kc ', away: 'buf' })).toEqual(context);
  expect(
    priorMarketContext(
      [
        ...prior,
        game({ id: 'same-week', week: 5, date: '2025-10-01', homeScore: 99 }),
        game({ id: 'future', week: 6, date: '2025-10-12' }),
      ],
      origin,
    ),
  ).toEqual(context);
  expect(priorMarketContext(prior, { ...origin, home: 'BUF', away: 'KC' }).teamMargin).toBeCloseTo(
    -context.teamMargin,
  );
});
it('ignores missing historical lines and bounds extreme past score residual influence', () => {
  const missing = game({});
  delete missing.spreadLine;
  delete missing.totalLine;
  expect(priorMarketContext([missing], origin).teamMargin).toBe(0);
  const a = priorMarketContext([game({ homeScore: 99, awayScore: 0 })], origin);
  const b = priorMarketContext([game({ homeScore: 1000, awayScore: 0 })], origin);
  expect(a.teamMargin).toBe(b.teamMargin);
  expect(a.teamTotal).toBe(b.teamTotal);
});
it('shrinks to the book for thin or harmful corrections and never extrapolates past the candidate', () => {
  expect(correctionWeight([])).toBe(0);
  expect(correctionWeight([{ probability: 0.6, baseline: 0.5, outcome: 0 }])).toBe(0);
  expect(correctionWeight([{ probability: 0.6, baseline: 0.5, outcome: 1 }])).toBeGreaterThan(0);
  expect(correctionWeight([{ probability: 0.6, baseline: 0.5, outcome: 1 }])).toBeLessThan(0.1);
  expect(
    correctionWeight(
      Array.from({ length: 1000 }, () => ({ probability: 0.6, baseline: 0.5, outcome: 1 })),
    ),
  ).toBe(1);
});
