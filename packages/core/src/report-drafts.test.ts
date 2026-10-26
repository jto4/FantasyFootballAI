import { expect, it } from 'vitest';
import { olderDraftIds } from './report-drafts.js';

it('keeps the newest draft of each report per league and nothing sent or sending', () => {
  const r = (id: string, kind: string, createdAt: string, extra = {}) => ({
    id,
    leagueId: 'a',
    kind,
    status: 'draft',
    createdAt,
    ...extra,
  });
  const older = olderDraftIds([
    r('pr1', 'power-rankings', '2026-10-22T10:00:00Z'),
    r('pr2', 'power-rankings', '2026-10-22T12:00:00Z'),
    r('pr0', 'power-rankings', '2026-10-21T12:00:00Z', { deliveryState: 'failed' }),
    r('mp1', 'matchup-preview', '2026-10-22T09:00:00Z'),
    r('sent', 'matchup-preview', '2026-10-23T09:00:00Z', { status: 'sent' }),
    { ...r('b1', 'power-rankings', '2026-10-20T10:00:00Z'), leagueId: 'b' },
  ]);
  expect([...older]).toEqual(['pr1']);
});
