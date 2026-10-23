import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { NextUpCard } from './NextUpCard.js';

const props = {
  leagueId: 'league',
  teamId: 'team',
  stale: false,
  onAdvice: () => undefined,
  onRefresh: () => undefined,
  onLive: () => undefined,
};

it('never says all is well before the starter checks come back', () => {
  // First render: alerts and the briefing are still loading.
  const loading = renderToStaticMarkup(
    createElement(NextUpCard, { ...props, briefing: undefined }),
  );
  expect(loading).toContain('Checking your starters…');
  expect(loading).not.toContain('You’re set');
  const failed = renderToStaticMarkup(
    createElement(NextUpCard, {
      ...props,
      briefing: undefined,
      briefingError: new Error('Failed to fetch'),
      onRetryBriefing: () => undefined,
    }),
  );
  expect(failed).toContain('Couldn’t finish checking your lineup');
  expect(failed).toContain('Check again');
  expect(failed).toContain('Details for support');
  expect(failed).not.toContain('You’re set');
});
