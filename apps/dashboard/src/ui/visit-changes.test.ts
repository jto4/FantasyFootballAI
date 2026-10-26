import { expect, it } from 'vitest';
import { visitChanges, type VisitDigest } from './visit-changes';

const digest = (over: Partial<VisitDigest> = {}): VisitDigest => ({
  at: '2026-10-24T12:00:00Z',
  week: 8,
  projections: { a: { name: 'Fictional Back', points: 14 } },
  statuses: {},
  waivers: [{ id: 'w', name: 'Fictional Pickup' }],
  ...over,
});

it('lists projection moves, status changes and waiver targets since picked up', () => {
  const now = digest({
    projections: { a: { name: 'Fictional Back', points: 10.5 } },
    statuses: { a: { name: 'Fictional Back', status: 'Questionable' } },
  });
  expect(visitChanges(digest(), now, new Set(['w']))).toEqual([
    'Fictional Back: projection down 3.5 to 10.5',
    'Fictional Back: now Questionable',
    'Fictional Pickup was picked up',
  ]);
  // Small moves and a new week say nothing.
  expect(
    visitChanges(
      digest(),
      digest({ projections: { a: { name: 'Fictional Back', points: 15 } } }),
      new Set(),
    ),
  ).toEqual([]);
  expect(visitChanges(digest(), digest({ week: 9 }), new Set(['w']))).toEqual([]);
  expect(visitChanges(undefined, digest(), new Set())).toEqual([]);
});
