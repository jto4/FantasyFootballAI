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
      onSavedAdvice: vi.fn(),
    }),
  );
  expect(markup).toContain('Last roster update unknown');
  expect(markup).toContain('No injury flags on this roster');
  expect(markup).toContain('Check your waiver priority and FAAB');
  expect(markup).toContain('Saved decisions to revisit');
});

it('keeps neutral ESPN status out of alerts and retains a separate injury flag', () => {
  const markup = renderToStaticMarkup(
    createElement(WeeklyHome, {
      league: {
        id: 'l',
        name: 'League',
        displayName: 'League',
        platform: 'espn',
        teamCount: 1,
        connectedAt: '2026-10-15T12:00:00Z',
        scoring: {},
        settings: {},
        teams: [
          {
            id: 't',
            name: 'Team',
            roster: [
              { id: 'normal', name: 'Normal Player', status: 'Normal' },
              {
                id: 'hurt',
                name: 'Injured Player',
                status: 'Active',
                injuryStatus: 'Questionable',
              },
              { id: 'reserve', name: 'Reserve Player', status: 'Injured Reserve' },
            ],
          },
        ],
      },
      settings: { actions: [] } as unknown as AppSettings,
      teamId: 't',
      onTeamChange: vi.fn(),
      onAdvice: vi.fn(),
      onRefresh: vi.fn(),
      onSavedAdvice: vi.fn(),
    }),
  );
  expect(markup).not.toContain('Normal Player');
  expect(markup).toContain('Injured Player: Questionable');
  expect(markup).toContain('Reserve Player: Injured Reserve');
});
