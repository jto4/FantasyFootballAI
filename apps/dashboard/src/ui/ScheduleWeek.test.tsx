import { expect, it } from 'vitest';
import { defaultActionSettings } from '@sidekick/core';
import { upcomingRuns } from './ScheduleWeek';

const base = defaultActionSettings[0]!;
const action = (frequency: 'daily' | 'weekly' | 'once', extra = {}) => ({
  ...base,
  enabled: true,
  schedule: {
    ...base.schedule,
    enabled: true,
    frequency,
    weekday: 2,
    time: '09:00',
    timezone: 'UTC',
    ...extra,
  },
});

it('lists every planned run inside the next seven days, earliest first', () => {
  const now = new Date('2026-10-21T12:00:00Z'); // Wednesday, after 09:00 UTC
  const runs = upcomingRuns([action('weekly'), action('daily')], now);
  // Daily: Thu 22 through Wed 28 (7 runs); weekly Tuesday: the 27th.
  expect(runs).toHaveLength(8);
  expect(new Date(runs[0]!.at).toISOString()).toBe('2026-10-22T09:00:00.000Z');
  expect(runs.filter((run) => run.action.schedule.frequency === 'weekly')).toHaveLength(1);
  expect(runs.map((run) => run.at)).toEqual([...runs.map((run) => run.at)].sort((a, b) => a - b));
});

it('skips disabled, unscoped, and out-of-window schedules', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  expect(
    upcomingRuns(
      [
        { ...action('daily'), enabled: false },
        { ...action('daily'), leagueIds: [] },
        action('once', { date: '2026-11-15' }),
      ],
      now,
    ),
  ).toEqual([]);
});
