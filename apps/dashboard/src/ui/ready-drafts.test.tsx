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
  const markup = renderToStaticMarkup(
    <ReadyDrafts
      drafts={[draft, { ...draft, id: 'r0', createdAt: '2026-10-20T12:00:00Z' }]}
      onReview={() => undefined}
      onLibrary={() => undefined}
    />,
  );
  expect(markup).toContain('Your report is ready');
  expect(markup).toContain('1 older draft is in the Reports library.');
  expect(markup).toContain('Week 7 Power Rankings');
  expect(markup).toContain('Copy for group chat');
  expect(markup).toContain('Review your drafts');
  expect(
    renderToStaticMarkup(
      <ReadyDrafts drafts={[]} onReview={() => undefined} onLibrary={() => undefined} />,
    ),
  ).toBe('');
});
