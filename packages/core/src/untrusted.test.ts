import { expect, it } from 'vitest';
import { asList, asObject, asText, nflSeasonFor } from './untrusted.js';

it('reads untrusted values without throwing', () => {
  expect(asObject({ a: 1 })).toEqual({ a: 1 });
  expect(asObject([1])).toEqual({});
  expect(asObject(null)).toEqual({});
  expect(asList([1, 2])).toEqual([1, 2]);
  expect(asList('x')).toEqual([]);
  expect(asText('x')).toBe('x');
  expect(asText(3)).toBe('');
});

it('puts January and February games in the previous season', () => {
  expect(nflSeasonFor(Date.parse('2027-02-08T00:00:00Z'))).toBe(2026);
  expect(nflSeasonFor(new Date('2027-03-01T00:00:00Z'))).toBe(2027);
  expect(nflSeasonFor(Date.parse('2026-10-23T00:00:00Z'))).toBe(2026);
});
