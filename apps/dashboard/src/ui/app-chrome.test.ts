import { expect, it } from 'vitest';
import { updatedLabel } from './AppChrome';

it('describes league freshness in plain words', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  expect(updatedLabel({ lastSyncedAt: '2026-10-21T11:59:30Z' }, now)).toBe(' · updated just now');
  expect(updatedLabel({ lastSyncedAt: '2026-10-21T11:15:00Z' }, now)).toBe(' · updated 45 min ago');
  expect(updatedLabel({ lastSyncedAt: '2026-10-21T07:00:00Z' }, now)).toBe(' · updated 5 hr ago');
  expect(updatedLabel({ snapshotImportedAt: '2026-10-16T00:45:00Z' }, now)).toBe(
    ' · updated 5 days ago',
  );
  expect(updatedLabel({}, now)).toBe('');
  expect(updatedLabel({ lastSyncedAt: '2026-10-22T12:00:00Z' }, now)).toBe('');
});
