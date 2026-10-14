import { expect, it } from 'vitest';
import { isProjectionPeriod, projectionPeriodMatchesWeek } from './projection-period.js';

it('requires an explicit ordered season/interval and matches weekly values exactly', () => {
  const period = { season: 2026, fromWeek: 5, throughWeek: 18 };
  expect(isProjectionPeriod(period)).toBe(true);
  for (const change of [
    { season: '2026' },
    { fromWeek: 0 },
    { fromWeek: 19 },
    { throughWeek: 31 },
    { fromWeek: 5.5 },
    { extra: true },
  ])
    expect(isProjectionPeriod({ ...period, ...change })).toBe(false);
  expect(isProjectionPeriod(['2026', 5, 18])).toBe(false);
  expect(projectionPeriodMatchesWeek(period, undefined)).toBe(true);
  expect(projectionPeriodMatchesWeek(period, 5)).toBe(false);
  expect(projectionPeriodMatchesWeek({ ...period, throughWeek: 5 }, 5)).toBe(true);
});
