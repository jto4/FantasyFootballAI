import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { LeagueConnection } from '@sidekick/core';
import { LeaguesPage } from './LeaguesPage.js';

describe('LeaguesPage', () => {
  it('prevents refresh and disconnect from racing on the same league', () => {
    const league: LeagueConnection = {
      id: 'league-1',
      platform: 'sleeper',
      name: 'Sunday Crew',
      displayName: 'Sunday Crew',
      teamCount: 12,
      scoring: {},
      settings: {},
      teams: [],
      connectedAt: '2026-09-01T12:00:00.000Z',
    };
    const markup = renderToStaticMarkup(
      <LeaguesPage
        leagues={[league]}
        refreshingLeagueId="league-1"
        disconnectingLeagueId=""
        onConnect={vi.fn()}
        onSetActive={vi.fn()}
        onRefresh={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );

    expect(markup).toContain('Refreshing…');
    expect(markup).toContain('aria-label="Disconnect Sunday Crew"');
    expect(markup).toContain('disabled=""');
  });
});
