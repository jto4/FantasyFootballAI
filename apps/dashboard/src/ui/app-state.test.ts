import { describe, expect, it } from 'vitest';
import { initialAppState, isAppState, isCredentialProviders, isNewsSnapshot } from './app-state.js';

describe('dashboard API state contracts', () => {
  it('provides complete owner-safe first-run defaults', () => {
    expect(initialAppState.leagues).toEqual([]);
    expect(initialAppState.reports).toEqual([]);
    expect(initialAppState.settings.actions.length).toBeGreaterThan(0);
    expect(initialAppState.settings.includeMemberContextInReports).toBe(false);
    expect(initialAppState.settings.analyzeImportsWithAI).toBe(false);
  });

  it('rejects malformed state snapshots before rendering dependent views', () => {
    expect(isAppState({ leagues: [], reports: [], scheduledRuns: [], settings: {} })).toBe(false);
    expect(
      isAppState({
        leagues: [],
        reports: [],
        scheduledRuns: [],
        settings: { actions: [] },
      }),
    ).toBe(false);
    expect(isAppState(initialAppState)).toBe(true);
  });

  it('rejects malformed credential status without treating it as an empty credential store', () => {
    expect(isCredentialProviders({})).toBe(false);
    expect(isCredentialProviders([{ provider: 'espn', configured: 'yes' }])).toBe(false);
    expect(isCredentialProviders([{ provider: 'espn', configured: true }])).toBe(true);
  });

  it('validates news fields and accepts only bounded HTTP(S) links', () => {
    const item = {
      title: 'Training camp begins',
      source: 'NFL News',
      url: 'https://example.com/nfl/camp',
      publishedAt: '2026-09-28T12:00:00.000Z',
    };
    expect(isNewsSnapshot({ items: [item], stale: false })).toBe(true);
    expect(isNewsSnapshot({ items: [{ ...item, url: 'javascript:alert(1)' }], stale: false })).toBe(
      false,
    );
    expect(isNewsSnapshot({ items: [{ ...item, title: 'x'.repeat(501) }], stale: false })).toBe(
      false,
    );
    expect(isNewsSnapshot({ items: [{ title: 'incomplete' }], stale: false })).toBe(false);
  });
});
