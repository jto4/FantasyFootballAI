import { describe, expect, it } from 'vitest';
import { seasonHeroHeadline, seasonKicker } from './season-copy.js';

describe('season dashboard copy', () => {
  it('shows the draft window even if a platform also reports a week number', () => {
    expect(seasonKicker('offseason', 1, false, 2026)).toBe('DRAFT WINDOW');
    expect(seasonHeroHeadline('offseason', 1, false, true)).toContain('Draft prep is on');
  });

  it('labels confirmed and inferred playoff weeks differently', () => {
    expect(seasonKicker('playoffs', 15, false, 2026)).toBe('WEEK 15 · PLAYOFFS');
    expect(seasonKicker('playoffs', 15, true, 2026)).toBe('WEEK 15 · POSSIBLE PLAYOFFS');
    expect(seasonHeroHeadline('playoffs', 15, true, true)).toContain('may be a playoff week');
  });

  it('marks a completed season even if the current week is unavailable', () => {
    expect(seasonKicker('complete', undefined, false, 2026)).toBe('SEASON COMPLETE');
    expect(seasonHeroHeadline('complete', undefined, false, true)).toContain(
      'season is in the books',
    );
  });

  it('shows the league year or workspace state when week data is missing', () => {
    expect(seasonKicker('unknown', undefined, false, 2025)).toBe('2025 SEASON');
    expect(seasonKicker('unknown', undefined, false, undefined, 2026)).toBe('2026 SEASON');
    expect(seasonHeroHeadline('unknown', undefined, false, false)).toBe(
      'Let’s make the league chat interesting.',
    );
  });
});
