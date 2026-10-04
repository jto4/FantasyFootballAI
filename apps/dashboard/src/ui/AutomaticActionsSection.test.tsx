import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { normalizeActionSettings, type LeagueConnection } from '@sidekick/core';
import { AutomaticActionsSection } from './AutomaticActionsSection.js';

describe('automatic action settings section', () => {
  it('shows channel, schedule, and league controls while retaining legacy all-league defaults', () => {
    const league: LeagueConnection = {
      id: 'league-1',
      platform: 'sleeper',
      name: 'Test League',
      displayName: 'Test League',
      teamCount: 10,
      scoring: {},
      settings: {},
      teams: [],
      connectedAt: new Date().toISOString(),
    };
    const markup = renderToStaticMarkup(
      createElement(AutomaticActionsSection, {
        actions: normalizeActionSettings([]),
        leagues: [league],
        onApplySuggestions: vi.fn(),
        onActionChange: vi.fn(),
        onScheduleChange: vi.fn(),
        onActionLeague: vi.fn(),
      }),
    );

    expect(markup).toContain('Automatic actions');
    expect(markup).toContain('Review before send');
    expect(markup).toContain('RUN FOR CONNECTED LEAGUES');
    expect(markup).toContain('Test League');
    expect(markup).toContain('Existing actions with no league selection continue to include every');
  });
});
