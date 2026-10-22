import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { LeagueConnection } from '@sidekick/core';
import { LeagueTrends } from './LeagueTrends';

const league = (weeklyScores?: LeagueConnection['weeklyScores']): LeagueConnection => ({
  id: 'l',
  platform: 'sleeper',
  name: 'League',
  displayName: 'League',
  teamCount: 4,
  scoring: {},
  settings: {},
  connectedAt: '2026-09-01T00:00:00Z',
  teams: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: `Team ${id.toUpperCase()}` })),
  ...(weeklyScores ? { weeklyScores } : {}),
});
const game = (week: number, a: string, ap: number, b: string, bp: number) => ({
  week,
  teams: [
    { teamId: a, points: ap },
    { teamId: b, points: bp },
  ],
});

it('explains how to load history when no completed weeks are synced', () => {
  const markup = renderToStaticMarkup(<LeagueTrends league={league()} />);
  expect(markup).toContain('Weekly history appears after a league update');
});

it('renders the trend, luck and scatter charts with an accessible standings table', () => {
  const markup = renderToStaticMarkup(
    <LeagueTrends
      league={league([
        game(1, 'a', 120, 'b', 130),
        game(1, 'c', 90, 'd', 80),
        game(2, 'a', 100, 'c', 110),
        game(2, 'b', 70, 'd', 60),
      ])}
    />,
  );
  for (const text of [
    'Weekly scoring',
    'Power rank by week',
    'Luck check',
    'Points for vs. against',
    'Standings from completed weeks',
    'League median',
    'Wins expected from scoring',
  ])
    expect(markup).toContain(text);
  // The default highlight is the top scorer when no team is saved.
  expect(markup).toContain('How Team A is trending');
  expect(markup).toMatch(/role="img"/);
});
