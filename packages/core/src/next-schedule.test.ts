import { describe, expect, it } from 'vitest';
import { nextSchedule } from './next-schedule.js';
import type { ReportSchedule } from './domain-types.js';
const weekly: ReportSchedule = {
  enabled: true,
  frequency: 'weekly',
  weekday: 2,
  time: '09:00',
  timezone: 'America/New_York',
};
describe('planned schedule occurrences', () => {
  it('uses the schedule timezone and moves past elapsed weekly and monthly occurrences', () => {
    expect(nextSchedule(weekly, new Date('2026-10-05T16:00:00Z')).at).toBe(
      Date.parse('2026-10-06T13:00:00Z'),
    );
    expect(nextSchedule(weekly, new Date('2026-10-06T13:01:00Z')).at).toBe(
      Date.parse('2026-10-13T13:00:00Z'),
    );
    expect(
      nextSchedule(
        { ...weekly, frequency: 'monthly', dayOfMonth: 1 },
        new Date('2026-10-05T16:00:00Z'),
      ).at,
    ).toBe(Date.parse('2026-11-01T14:00:00Z'));
  });
  it('skips nonexistent DST times and does not promise a second recurring fall-back run', () => {
    expect(
      nextSchedule(
        { ...weekly, frequency: 'daily', time: '02:30' },
        new Date('2026-03-08T05:00:00Z'),
      ).at,
    ).toBe(Date.parse('2026-03-09T06:30:00Z'));
    expect(
      nextSchedule({ ...weekly, weekday: 0, time: '01:30' }, new Date('2026-11-01T05:45:00Z')).at,
    ).toBe(Date.parse('2026-11-08T06:30:00Z'));
  });
  it('distinguishes due, missed, completed, disabled, and invalid schedules', () => {
    const once = { ...weekly, frequency: 'once' as const, date: '2026-10-05' };
    const now = new Date('2026-10-05T16:00:00Z');
    expect(nextSchedule(once, now).status).toBe('due');
    expect(nextSchedule({ ...once, date: '2026-10-04' }, now).status).toBe('missed');
    expect(nextSchedule({ ...once, completedAt: now.toISOString() }, now).status).toBe('finished');
    expect(nextSchedule({ ...weekly, enabled: false }, now).status).toBe('off');
    expect(nextSchedule({ ...weekly, timezone: 'Mars' }, now).status).toBe('off');
  });
});
