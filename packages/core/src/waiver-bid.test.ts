import { expect, it } from 'vitest';
import { faabBid, regularWeeksLeft } from './waiver-bid.js';

it('suggests more of the budget for bigger rest-of-season gains, within 1–50%', () => {
  // 3 points a week for 6 weeks = 18 points: about 18% of 100.
  expect(faabBid({ gain: 3, weeksLeft: 6, remaining: 100 })).toEqual({ low: 13, high: 23 });
  expect(faabBid({ gain: 20, weeksLeft: 10, remaining: 100 })).toEqual({ low: 37, high: 50 });
  expect(faabBid({ gain: 0.1, weeksLeft: 1, remaining: 100 })).toEqual({ low: 1, high: 2 });
  expect(faabBid({ gain: 3, weeksLeft: 6, remaining: 0 })).toBeUndefined();
  expect(faabBid({ gain: -1, weeksLeft: 6, remaining: 50 })).toBeUndefined();
});

it('reads the regular season length from either platform', () => {
  expect(regularWeeksLeft({ settings: { regularSeasonWeeks: 14 } }, 8)).toBe(6);
  expect(regularWeeksLeft({ settings: { playoff_week_start: 15 } }, 8)).toBe(6);
  expect(regularWeeksLeft({ settings: {} }, 16)).toBe(0);
});
