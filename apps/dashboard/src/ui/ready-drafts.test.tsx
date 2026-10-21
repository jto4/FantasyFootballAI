import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ReadyDrafts } from './ReadyDrafts';

it('lists ready drafts with a copy shortcut and renders nothing without drafts', () => {
  const draft = {
    id: 'r1',
    leagueId: 'l',
    kind: 'power-rankings' as const,
    title: 'Week 7 Power Rankings',
    createdAt: '2026-10-21T12:00:00Z',
    status: 'draft' as const,
    revision: 0,
  };
  const markup = renderToStaticMarkup(<ReadyDrafts drafts={[draft]} onReview={() => undefined} />);
  expect(markup).toContain('Your report is ready');
  expect(markup).toContain('Week 7 Power Rankings');
  expect(markup).toContain('Copy for group chat');
  expect(renderToStaticMarkup(<ReadyDrafts drafts={[]} onReview={() => undefined} />)).toBe('');
});
