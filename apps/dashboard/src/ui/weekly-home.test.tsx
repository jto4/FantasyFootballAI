import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { WeeklyHome } from './WeeklyHome.js';
import { selectedTeamId } from './team-selection.js';
import type { AppSettings, LeagueConnection } from '@sidekick/core';
it('keeps unknown availability and deadlines explicit and refuses a removed saved team', () => {
  const league: LeagueConnection = {
    id: 'l',
    name: 'League',
    displayName: 'League',
    platform: 'sleeper',
    teamCount: 1,
    connectedAt: new Date().toISOString(),
    lastSyncedAt: '2999-01-01T00:00:00Z',
    scoring: {},
    settings: { currentWeek: 5 },
    teams: [
      {
        id: 't',
        name: 'Team',
        rosterSize: 1,
        roster: [{ id: 'p', name: 'Player', position: 'WR' }],
      },
    ],
  };
  expect(selectedTeamId(league, { l: 'deleted' })).toBeUndefined();
  expect(selectedTeamId(league, { l: 't' })).toBe('t');
  const markup = renderToStaticMarkup(
    createElement(WeeklyHome, {
      league,
      settings: { actions: [] } as unknown as AppSettings,
      teamId: 't',
      onTeamChange: vi.fn(),
      onAdvice: vi.fn(),
      onRefresh: vi.fn(),
      onSetup: vi.fn(),
      onSavedAdvice: vi.fn(),
    }),
  );
  expect(markup).toContain('Roster freshness is unverified');
  expect(markup).toContain('does not establish that everyone is healthy');
  expect(markup).toContain('No verified deadline');
  expect(markup).toContain('Saved decisions to revisit');
});
