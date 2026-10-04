import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { LeagueConnection } from '@sidekick/core';
import { LeagueCalendarSettings } from './LeagueCalendarSettings.js';

const actionNames = {
  'offseason-update': 'Offseason updates',
  'draft-hype': 'Draft day hype',
  'draft-review': 'Post-draft review',
  'power-rankings': 'Weekly power rankings',
  'matchup-preview': 'Matchup previews',
};

const leagues: LeagueConnection[] = [
  {
    id: 'league-1',
    platform: 'sleeper',
    name: 'Test league',
    displayName: 'Test league',
    teamCount: 10,
    scoring: {},
    settings: {},
    teams: [],
    draftScheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
    connectedAt: new Date().toISOString(),
  },
];

describe('league calendar settings section', () => {
  it('shows platform draft suggestions and existing league events', () => {
    const markup = renderToStaticMarkup(
      createElement(LeagueCalendarSettings, {
        leagues,
        events: [
          {
            id: 'event-1',
            leagueId: 'league-1',
            title: 'Draft night',
            kind: 'draft-hype',
            date: '2026-09-30',
            time: '19:00',
            timezone: 'America/New_York',
          },
        ],
        actionNames,
        onAddEvent: vi.fn(),
        onDeleteEvent: vi.fn(),
        onNotice: vi.fn(),
      }),
    );

    expect(markup).toContain('LEAGUE SEASON CALENDAR');
    expect(markup).toContain('Sleeper reports a draft at');
    expect(markup).toContain('Use platform draft time');
    expect(markup).toContain('Suggest a review for the next day at 9:00 AM');
    expect(markup).toContain('Suggest post-draft power rankings for the next day');
    expect(markup).toContain('Draft night');
    expect(markup).toContain('Remove Draft night calendar event');
  });

  it('explains that a connected league is needed before events can be created', () => {
    const markup = renderToStaticMarkup(
      createElement(LeagueCalendarSettings, {
        leagues: [],
        events: [],
        actionNames,
        onAddEvent: vi.fn(),
        onDeleteEvent: vi.fn(),
        onNotice: vi.fn(),
      }),
    );

    expect(markup).toContain('Connect a league to create a season calendar.');
    expect(markup).not.toContain('Add calendar event');
  });
});
