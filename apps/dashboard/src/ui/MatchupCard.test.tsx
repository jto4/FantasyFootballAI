import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MatchupCard } from './MatchupCard.js';
import { isWeeklyBriefing, type WeeklyBriefing } from './weekly-briefing.js';

const briefing: WeeklyBriefing = {
  week: 8,
  coverage: { known: 2, total: 2, alreadyPlayed: 0 },
  lineup: { complete: true, changes: [] },
  availability: [],
  waivers: [],
  notes: [],
  matchup: {
    week: 8,
    winProbability: 0.634,
    you: {
      teamId: 'a',
      name: 'Fictional Ones',
      projected: 20,
      starters: [
        {
          id: '1',
          name: 'Fictional Receiver',
          position: 'WR',
          estimate: 12,
          range: { low: 4.2, high: 21.6 },
        },
      ],
    },
    opponent: {
      teamId: 'b',
      name: 'Fictional Twos',
      projected: 17,
      starters: [{ id: '2', name: 'Fictional Back', position: 'RB', estimate: 9 }],
    },
  },
};

it('shows the pre-kickoff win chance and each starter’s likely range', () => {
  expect(isWeeklyBriefing(briefing)).toBe(true);
  const html = renderToStaticMarkup(createElement(MatchupCard, { briefing }));
  expect(html).toContain('<strong>63%</strong> chance you win');
  expect(html).toContain('width:63%');
  expect(html).toContain('12.0');
  expect(html).toMatch(/4–22/);
  expect(
    isWeeklyBriefing({ ...briefing, matchup: { ...briefing.matchup!, winProbability: 2 } }),
  ).toBe(false);
  const without = renderToStaticMarkup(
    createElement(MatchupCard, {
      briefing: {
        ...briefing,
        matchup: { ...briefing.matchup!, winProbability: undefined },
      } as never,
    }),
  );
  expect(without).not.toContain('chance you win');
});
