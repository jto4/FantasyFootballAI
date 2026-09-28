import cron, { type TaskContext, type TaskFn, type TaskOptions } from 'node-cron';
import { describe, expect, it, vi } from 'vitest';
import { defaultActionSettings } from '@sidekick/core';
import type { ScheduledTask } from './lifecycle.js';
import {
  calendarEventDisposition,
  isOneOffDue,
  isOneOffMissed,
  isValidReportSchedule,
  preserveCompletedOneOffs,
  LeagueCalendarScheduler,
  ReportScheduler,
  toCronExpression,
} from './scheduler.js';

describe('report schedules', () => {
  it('converts daily, weekly, and monthly settings to cron expressions', () => {
    expect(
      toCronExpression({
        enabled: true,
        frequency: 'daily',
        weekday: 2,
        time: '09:05',
        timezone: 'UTC',
      }),
    ).toBe('5 9 * * *');
    expect(
      toCronExpression({
        enabled: true,
        frequency: 'weekly',
        weekday: 0,
        time: '23:45',
        timezone: 'America/New_York',
      }),
    ).toBe('45 23 * * 0');
    expect(
      toCronExpression({
        enabled: true,
        frequency: 'monthly',
        weekday: 0,
        dayOfMonth: 28,
        time: '09:05',
        timezone: 'UTC',
      }),
    ).toBe('5 9 28 * *');
  });

  it('uses a minute poll for one-off events and validates their local date', () => {
    const once = {
      enabled: true,
      frequency: 'once',
      weekday: 2,
      date: '2026-10-01',
      time: '09:00',
      timezone: 'America/New_York',
    } as const;
    expect(toCronExpression(once)).toBe('* * * * *');
    expect(isValidReportSchedule(once)).toBe(true);
    expect(isValidReportSchedule({ ...once, date: '2026-02-30' })).toBe(false);
  });

  it('matches a one-off event in its configured timezone on or after its local time', () => {
    const schedule = {
      enabled: true,
      frequency: 'once',
      weekday: 2,
      date: '2026-10-01',
      time: '09:00',
      timezone: 'America/New_York',
    } as const;
    expect(isOneOffDue(schedule, new Date('2026-10-01T12:59:00.000Z'))).toBe(false);
    expect(isOneOffDue(schedule, new Date('2026-10-01T13:00:00.000Z'))).toBe(true);
    expect(isOneOffDue(schedule, new Date('2026-10-02T13:00:00.000Z'))).toBe(false);
    expect(isOneOffMissed(schedule, new Date('2026-10-01T13:00:00.000Z'))).toBe(false);
    expect(isOneOffMissed(schedule, new Date('2026-10-02T13:00:00.000Z'))).toBe(true);
    expect(isOneOffMissed(schedule, new Date('2026-10-01T12:59:00.000Z'))).toBe(false);
  });

  it('reports an expired one-off once without generating a late report', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T13:05:00.000Z'));
    try {
      const run = vi.fn().mockResolvedValue(undefined);
      const onMissed = vi.fn();
      let callback: TaskFn | undefined;
      const scheduleTask = ((_expression: string, task: TaskFn | string) => {
        if (typeof task === 'function') callback = task;
        return { stop: vi.fn() } as unknown as ScheduledTask;
      }) as typeof cron.schedule;
      const scheduler = new ReportScheduler(run, scheduleTask, undefined, onMissed);
      const action = structuredClone(
        defaultActionSettings.find((item) => item.kind === 'draft-hype')!,
      );
      action.schedule = {
        ...action.schedule,
        enabled: true,
        frequency: 'once',
        date: '2026-10-01',
        time: '09:00',
        timezone: 'America/New_York',
      };

      scheduler.reconcile([action]);
      await callback!({} as TaskContext);
      await callback!({} as TaskContext);
      expect(run).not.toHaveBeenCalled();
      expect(onMissed).toHaveBeenCalledOnce();
      expect(onMissed).toHaveBeenCalledWith(action, new Date('2026-10-02T13:05:00.000Z'));
      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fires a one-off event at most once during a running service session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T13:05:00.000Z'));
    try {
      const run = vi.fn().mockResolvedValue(undefined);
      let callback: TaskFn | undefined;
      const scheduleTask = ((_expression: string, task: TaskFn | string) => {
        if (typeof task === 'function') callback = task;
        return { stop: vi.fn() } as unknown as ScheduledTask;
      }) as typeof cron.schedule;
      const scheduler = new ReportScheduler(run, scheduleTask);
      const action = structuredClone(
        defaultActionSettings.find((item) => item.kind === 'draft-hype')!,
      );
      action.schedule = {
        ...action.schedule,
        enabled: true,
        frequency: 'once',
        date: '2026-10-01',
        time: '09:00',
        timezone: 'America/New_York',
      };
      scheduler.reconcile([action]);
      expect(callback).toBeDefined();
      await callback!({} as TaskContext);
      await callback!({} as TaskContext);
      expect(run).toHaveBeenCalledOnce();
      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves completion across stale settings saves but clears it for a changed event', () => {
    const existing = structuredClone(defaultActionSettings);
    const original = existing.find((item) => item.kind === 'draft-hype')!;
    original.schedule = {
      ...original.schedule,
      enabled: true,
      frequency: 'once',
      date: '2026-10-01',
      time: '09:00',
      timezone: 'UTC',
      completedAt: '2026-10-01T09:00:02.000Z',
    };
    const stale = structuredClone(existing);
    delete stale.find((item) => item.kind === 'draft-hype')!.schedule.completedAt;

    expect(
      preserveCompletedOneOffs(stale, existing).find((item) => item.kind === 'draft-hype')?.schedule
        .completedAt,
    ).toBe('2026-10-01T09:00:02.000Z');

    const rescheduled = structuredClone(stale);
    rescheduled.find((item) => item.kind === 'draft-hype')!.schedule.date = '2026-10-02';
    expect(
      preserveCompletedOneOffs(rescheduled, existing).find((item) => item.kind === 'draft-hype')
        ?.schedule.completedAt,
    ).toBeUndefined();

    const retargeted = structuredClone(existing);
    retargeted.find((item) => item.kind === 'draft-hype')!.leagueIds = ['league-2'];
    delete retargeted.find((item) => item.kind === 'draft-hype')!.schedule.completedAt;
    expect(
      preserveCompletedOneOffs(retargeted, existing).find((item) => item.kind === 'draft-hype')
        ?.schedule.completedAt,
    ).toBeUndefined();
  });

  it('rejects malformed times, weekdays, and time zones', () => {
    const valid = {
      enabled: true,
      frequency: 'weekly',
      weekday: 2,
      time: '09:00',
      timezone: 'UTC',
    };
    expect(isValidReportSchedule(valid)).toBe(true);
    expect(isValidReportSchedule({ ...valid, time: '24:00' })).toBe(false);
    expect(isValidReportSchedule({ ...valid, weekday: 7 })).toBe(false);
    expect(isValidReportSchedule({ ...valid, timezone: 'Mars/Olympus' })).toBe(false);
    expect(isValidReportSchedule({ ...valid, frequency: 'monthly', dayOfMonth: 29 })).toBe(false);
  });

  it('starts only enabled schedules and stops replaced jobs', () => {
    const scheduled: Array<{ expression: string; options: TaskOptions | undefined }> = [];
    const stop = vi.fn();
    const task = { stop } as unknown as ScheduledTask;
    const scheduleTask = ((
      expression: string,
      _callback: TaskFn | string,
      options?: TaskOptions,
    ) => {
      scheduled.push({ expression, options });
      return task;
    }) as typeof cron.schedule;
    const scheduler = new ReportScheduler(vi.fn().mockResolvedValue(undefined), scheduleTask);
    const actions = structuredClone(defaultActionSettings);
    actions.find((action) => action.kind === 'offseason-update')!.schedule.enabled = false;
    actions.find((action) => action.kind === 'matchup-preview')!.schedule.enabled = false;
    actions.find((action) => action.kind === 'power-rankings')!.schedule.timezone = 'UTC';

    scheduler.reconcile(actions);
    expect(scheduled).toEqual([
      {
        expression: '0 9 * * 2',
        options: { timezone: 'UTC', name: 'sidekick-power-rankings', noOverlap: true },
      },
    ]);

    scheduler.reconcile([]);
    expect(stop).toHaveBeenCalledOnce();
    scheduler.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('returns the report promise to cron so no-overlap waits for completion', async () => {
    let finishRun!: () => void;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRun = resolve;
        }),
    );
    let callback: TaskFn | undefined;
    const scheduleTask = ((_expression: string, task: TaskFn | string) => {
      if (typeof task === 'function') callback = task;
      return { stop: vi.fn() } as unknown as ScheduledTask;
    }) as typeof cron.schedule;
    const scheduler = new ReportScheduler(run, scheduleTask);
    const action = structuredClone(
      defaultActionSettings.find((item) => item.kind === 'power-rankings')!,
    );
    action.schedule.timezone = 'UTC';

    scheduler.reconcile([action]);
    const execution = callback!({} as TaskContext);
    expect(execution).toBeInstanceOf(Promise);
    expect(run).toHaveBeenCalledOnce();
    finishRun();
    await execution;
  });
});

describe('league calendar events', () => {
  const event = {
    id: 'c10f595f-c3fd-4bc8-9d08-183cdd533122',
    leagueId: 'league-a',
    title: 'Draft night',
    kind: 'draft-hype' as const,
    date: '2026-10-01',
    time: '09:00',
    timezone: 'America/New_York',
  };

  it('handles local time, same-day catch-up, missed dates, and persistent completion', () => {
    expect(calendarEventDisposition(event, new Date('2026-09-30T12:00:00.000Z'))).toBe('waiting');
    expect(calendarEventDisposition(event, new Date('2026-10-01T12:59:00.000Z'))).toBe('waiting');
    expect(calendarEventDisposition(event, new Date('2026-10-01T13:00:00.000Z'))).toBe('due');
    expect(calendarEventDisposition(event, new Date('2026-10-02T12:00:00.000Z'))).toBe('missed');
    expect(
      calendarEventDisposition(
        { ...event, completedAt: '2026-10-01T13:00:00.000Z' },
        new Date('2026-10-01T13:00:00.000Z'),
      ),
    ).toBe('complete');
  });

  it('runs a due event once and records an event that was missed while stopped', async () => {
    let now = new Date('2026-10-01T13:00:00.000Z');
    const callbacks: TaskFn[] = [];
    const scheduleTask = ((_expression: string, task: TaskFn | string) => {
      if (typeof task === 'function') callbacks.push(task);
      return { stop: vi.fn() } as unknown as ScheduledTask;
    }) as typeof cron.schedule;
    const run = vi.fn().mockResolvedValue(undefined);
    const missed = vi.fn().mockResolvedValue(undefined);
    const scheduler = new LeagueCalendarScheduler(run, scheduleTask, missed, vi.fn(), () => now);

    scheduler.reconcile([event]);
    await callbacks[0]!({} as TaskContext);
    await callbacks[0]!({} as TaskContext);
    expect(run).toHaveBeenCalledOnce();

    now = new Date('2026-10-02T12:00:00.000Z');
    scheduler.reconcile([{ ...event, id: 'd20f595f-c3fd-4bc8-9d08-183cdd533123' }]);
    await callbacks[1]!({} as TaskContext);
    expect(missed).toHaveBeenCalledOnce();
    scheduler.stop();
  });
});
