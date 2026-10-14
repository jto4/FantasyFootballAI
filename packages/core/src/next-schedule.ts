import type { ReportSchedule } from './domain-types.js';
import { localDateTimeInstants } from './calendar-time.js';

export type SchedulePlan = {
  status: 'off' | 'finished' | 'missed' | 'due' | 'scheduled';
  at?: number;
};
/** A planned occurrence, not a delivery promise. Recurring repeated DST minutes run only once. */
export function nextSchedule(schedule: ReportSchedule, now = new Date()): SchedulePlan {
  if (!schedule.enabled) return { status: 'off' };
  if (schedule.frequency === 'once' && schedule.completedAt) return { status: 'finished' };
  let today: string;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: schedule.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(now)
        .map((part) => [part.type, part.value]),
    );
    today = `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return { status: 'off' };
  }
  if (schedule.frequency === 'once') {
    if (!schedule.date) return { status: 'off' };
    const at = localDateTimeInstants(schedule.date, schedule.time, schedule.timezone)[0];
    if (at === undefined) return { status: 'off' };
    if (schedule.date < today) return { status: 'missed' };
    return { status: at <= now.getTime() ? 'due' : 'scheduled', at };
  }
  const firstDay = new Date(`${today}T00:00:00Z`).getTime();
  for (let offset = 0; offset < 63; offset++) {
    const day = new Date(firstDay + offset * 86400000);
    if (schedule.frequency === 'weekly' && day.getUTCDay() !== schedule.weekday) continue;
    if (schedule.frequency === 'monthly' && day.getUTCDate() !== (schedule.dayOfMonth ?? 1))
      continue;
    const at = localDateTimeInstants(
      day.toISOString().slice(0, 10),
      schedule.time,
      schedule.timezone,
    )[0];
    if (at !== undefined && at > now.getTime()) return { status: 'scheduled', at };
  }
  return { status: 'off' };
}
