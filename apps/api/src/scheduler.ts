import cron from 'node-cron';
import {
  isValidScheduleDate,
  isValidLeagueCalendarEvent,
  isValidTimezone,
  type ActionSetting,
  type LeagueCalendarEvent,
  type ReportSchedule,
} from '@sidekick/core';
import type { ScheduledTask } from './lifecycle.js';
import { errorName, logEvent } from './logger.js';

export type ReportRunner = (action: ActionSetting) => Promise<void>;
export type MissedRunHandler = (action: ActionSetting, missedAt: Date) => Promise<void> | void;
export type CalendarEventRunner = (event: LeagueCalendarEvent) => Promise<void>;
export type MissedCalendarEventHandler = (
  event: LeagueCalendarEvent,
  missedAt: Date,
) => Promise<void> | void;
type ScheduleFunction = typeof cron.schedule;

export function preserveCompletedOneOffs(
  incoming: ActionSetting[],
  existing: ActionSetting[],
): ActionSetting[] {
  return incoming.map((action) => {
    const previous = existing.find((item) => item.kind === action.kind);
    const prior = previous?.schedule;
    const next = action.schedule;
    const sameTargets =
      (previous?.leagueIds === undefined && action.leagueIds === undefined) ||
      (previous?.leagueIds !== undefined &&
        action.leagueIds !== undefined &&
        previous.leagueIds.length === action.leagueIds.length &&
        previous.leagueIds.every((leagueId) => action.leagueIds?.includes(leagueId)));
    if (
      !sameTargets ||
      next.frequency !== 'once' ||
      next.completedAt ||
      prior?.frequency !== 'once' ||
      !prior.completedAt ||
      prior.date !== next.date ||
      prior.time !== next.time ||
      prior.timezone !== next.timezone
    )
      return action;
    return { ...action, schedule: { ...next, completedAt: prior.completedAt } };
  });
}

/** Convert the dashboard's human-friendly schedule fields into a cron expression. */
export function toCronExpression(schedule: ReportSchedule): string {
  if (schedule.frequency === 'once') return '* * * * *';
  const [hour, minute] = schedule.time.split(':').map(Number);
  return schedule.frequency === 'daily'
    ? `${minute} ${hour} * * *`
    : schedule.frequency === 'monthly'
      ? `${minute} ${hour} ${schedule.dayOfMonth ?? 1} * *`
      : `${minute} ${hour} * * ${schedule.weekday}`;
}

export function isValidReportSchedule(value: unknown): value is ReportSchedule {
  if (!value || typeof value !== 'object') return false;
  const schedule = value as Record<string, unknown>;
  const oneOff = schedule.frequency === 'once';
  if (
    typeof schedule.enabled !== 'boolean' ||
    (schedule.frequency !== 'daily' &&
      schedule.frequency !== 'weekly' &&
      schedule.frequency !== 'monthly' &&
      !oneOff) ||
    typeof schedule.weekday !== 'number' ||
    !Number.isInteger(schedule.weekday) ||
    schedule.weekday < 0 ||
    schedule.weekday > 6 ||
    (schedule.frequency === 'monthly' &&
      (typeof schedule.dayOfMonth !== 'number' ||
        !Number.isInteger(schedule.dayOfMonth) ||
        schedule.dayOfMonth < 1 ||
        schedule.dayOfMonth > 28)) ||
    typeof schedule.time !== 'string' ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time) ||
    typeof schedule.timezone !== 'string' ||
    schedule.timezone.length > 100
  ) {
    return false;
  }
  if (oneOff && !isValidScheduleDate(schedule.date)) return false;
  if (
    schedule.completedAt !== undefined &&
    (typeof schedule.completedAt !== 'string' || !Number.isFinite(Date.parse(schedule.completedAt)))
  )
    return false;
  try {
    return (
      isValidTimezone(schedule.timezone) &&
      cron.validate(toCronExpression(schedule as unknown as ReportSchedule))
    );
  } catch {
    return false;
  }
}

/** Reconcile persisted settings with live cron tasks; changing settings replaces tasks. */
export class ReportScheduler {
  private tasks: ScheduledTask[] = [];
  private readonly firedOneOffs = new Set<string>();

  constructor(
    private readonly run: ReportRunner,
    private readonly scheduleTask: ScheduleFunction = cron.schedule,
    private readonly onError: (kind: string, error: unknown) => void = (kind, error) =>
      logEvent('error', 'schedule.action.failed', {
        component: 'scheduler',
        action: kind,
        errorName: errorName(error),
      }),
    private readonly onMissed: MissedRunHandler = () => undefined,
  ) {}

  reconcile(actions: ActionSetting[]): void {
    this.stop();
    this.firedOneOffs.clear();
    for (const action of actions) {
      if (!action.enabled || !action.schedule.enabled || !isValidReportSchedule(action.schedule))
        continue;
      if (action.schedule.frequency === 'once' && action.schedule.completedAt) continue;
      const oneOffKey = oneOffIdentity(action.schedule, action.kind);
      const task = this.scheduleTask(
        toCronExpression(action.schedule),
        () => {
          if (action.schedule.frequency === 'once') {
            if (this.firedOneOffs.has(oneOffKey)) return;
            const now = new Date();
            if (isOneOffMissed(action.schedule, now)) {
              this.firedOneOffs.add(oneOffKey);
              return Promise.resolve()
                .then(() => this.onMissed(action, now))
                .catch((error: unknown) => {
                  this.firedOneOffs.delete(oneOffKey);
                  this.onError(action.kind, error);
                });
            }
            if (!isOneOffDue(action.schedule, now)) return;
            this.firedOneOffs.add(oneOffKey);
          }
          return this.run(action).catch((error: unknown) => {
            if (action.schedule.frequency === 'once') this.firedOneOffs.delete(oneOffKey);
            this.onError(action.kind, error);
          });
        },
        { timezone: action.schedule.timezone, name: `sidekick-${action.kind}`, noOverlap: true },
      );
      this.tasks.push(task);
    }
  }

  stop(): void {
    for (const task of this.tasks) task.stop();
    this.tasks = [];
  }
}

/** Schedule owner-entered single-date league milestones without enabling automatic delivery. */
export class LeagueCalendarScheduler {
  private tasks: ScheduledTask[] = [];
  private readonly firedEvents = new Set<string>();
  private events: LeagueCalendarEvent[] = [];

  constructor(
    private readonly run: CalendarEventRunner,
    private readonly scheduleTask: ScheduleFunction = cron.schedule,
    private readonly onMissed: MissedCalendarEventHandler = () => undefined,
    private readonly onError: (eventId: string, error: unknown) => void = (eventId, error) =>
      logEvent('error', 'schedule.calendar_event.failed', {
        component: 'scheduler',
        eventId,
        errorName: errorName(error),
      }),
    private readonly now: () => Date = () => new Date(),
  ) {}

  reconcile(events: LeagueCalendarEvent[]): void {
    this.stop();
    this.firedEvents.clear();
    this.events = events.filter(
      (event) => !event.completedAt && isValidCalendarEventSchedule(event),
    );
    if (!this.events.length) return;
    const task = this.scheduleTask(
      '* * * * *',
      async () => {
        for (const event of this.events) {
          if (this.firedEvents.has(event.id)) continue;
          const now = this.now();
          const disposition = calendarEventDisposition(event, now);
          if (disposition === 'waiting' || disposition === 'complete') continue;
          this.firedEvents.add(event.id);
          try {
            if (disposition === 'missed') await this.onMissed(event, now);
            else await this.run(event);
          } catch (error) {
            // Keep the event claimed: the durable callback may have committed before failing.
            // Retrying an ambiguous report generation could create duplicate drafts.
            this.onError(event.id, error);
          }
        }
      },
      { timezone: 'UTC', name: 'sidekick-league-calendar', noOverlap: true },
    );
    this.tasks.push(task);
  }

  stop(): void {
    for (const task of this.tasks) task.stop();
    this.tasks = [];
    this.events = [];
  }
}

export function isValidCalendarEventSchedule(event: LeagueCalendarEvent): boolean {
  return isValidLeagueCalendarEvent(event) && cron.validate('* * * * *');
}

export function calendarEventDisposition(
  event: LeagueCalendarEvent,
  now: Date,
): 'waiting' | 'due' | 'missed' | 'complete' {
  if (event.completedAt) return 'complete';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: event.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localDate = `${values.year}-${values.month}-${values.day}`;
  if (localDate > event.date) return 'missed';
  if (localDate < event.date) return 'waiting';
  return `${values.hour}:${values.minute}` >= event.time ? 'due' : 'waiting';
}

export function isOneOffDue(schedule: ReportSchedule, now: Date): boolean {
  if (schedule.frequency !== 'once' || !schedule.date) return false;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: schedule.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localDate = `${values.year}-${values.month}-${values.day}`;
  const localTime = `${values.hour}:${values.minute}`;
  return localDate === schedule.date && localTime >= schedule.time;
}

/** A one-time schedule may catch up later the same local day, but expires after that date. */
export function isOneOffMissed(schedule: ReportSchedule, now: Date): boolean {
  if (schedule.frequency !== 'once' || !schedule.date) return false;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: schedule.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localDate = `${values.year}-${values.month}-${values.day}`;
  return localDate > schedule.date;
}

function oneOffIdentity(schedule: ReportSchedule, kind: ActionSetting['kind']): string {
  return `${kind}:${schedule.date}:${schedule.time}:${schedule.timezone}`;
}
