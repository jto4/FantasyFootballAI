import { describe, expect, it } from 'vitest';
import { resolveActiveLeague } from './league-selection.js';

const leagues = [
  { id: 'sleeper-1', displayName: 'Sleeper League' },
  { id: 'yahoo-2', displayName: 'Yahoo League' },
];

describe('active league selection', () => {
  it('uses a remembered league when it remains connected', () => {
    expect(resolveActiveLeague(leagues, 'yahoo-2')).toBe(leagues[1]);
  });

  it('falls back to the first connected league when the remembered one was removed', () => {
    expect(resolveActiveLeague(leagues, 'removed-league')).toBe(leagues[0]);
  });

  it('returns no active league when none are connected', () => {
    expect(resolveActiveLeague([], 'removed-league')).toBeUndefined();
  });
});
