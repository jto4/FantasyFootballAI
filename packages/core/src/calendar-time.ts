import { isValidScheduleDate } from './schedules.js';
/** Return both instants for repeated wall times, and none for times skipped by DST. */
export function localDateTimeInstants(date: string, time: string, timezone: string): number[] {
  if (!isValidScheduleDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return [];
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return [];
  }
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desired = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const offsets = new Set<number>();
  for (let delta = -36; delta <= 36; delta += 6) {
    const sample = desired + delta * 60 * 60_000;
    const values = Object.fromEntries(
      formatter.formatToParts(sample).map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
    );
    offsets.add(represented - Math.floor(sample / 60_000) * 60_000);
  }
  return [...offsets]
    .map((offset) => desired - offset)
    .filter((candidate) => {
      const values = Object.fromEntries(
        formatter.formatToParts(candidate).map((part) => [part.type, part.value]),
      );
      return (
        `${values.year}-${values.month}-${values.day}` === date &&
        `${values.hour}:${values.minute}` === time
      );
    })
    .sort((a, b) => a - b);
}
