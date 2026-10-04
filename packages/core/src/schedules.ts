import type {
  ReportKind,
  LeagueConnection,
  ActionSetting,
  LeagueCalendarEvent,
  AppSettings,
} from './domain-types.js';
import { localDateTimeInstants } from './calendar-time.js';
const supportedReportKinds: ReportKind[] = [
  'offseason-update',
  'draft-hype',
  'draft-review',
  'power-rankings',
  'matchup-preview',
];
const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const scheduleRecommendations: Partial<
  Record<
    ReportKind,
    {
      frequency: 'weekly' | 'monthly';
      weekday?: number;
      dayOfMonth?: number;
      time: string;
      label: string;
    }
  >
> = {
  'offseason-update': {
    frequency: 'monthly',
    dayOfMonth: 1,
    time: '09:00',
    label: 'the first of each month',
  },
  'power-rankings': { frequency: 'weekly', weekday: 2, time: '09:00', label: 'Tuesday' },
  'matchup-preview': { frequency: 'weekly', weekday: 3, time: '09:00', label: 'Wednesday' },
};

/** Seasonal reports start on a safe review-only cadence; optional draft events stay unscheduled. */
export const defaultActionSettings: ActionSetting[] = supportedReportKinds.map((kind) => {
  const recommendation = scheduleRecommendations[kind];
  return {
    kind,
    channel: 'dashboard',
    enabled: true,
    mode: 'draft',
    schedule: {
      enabled: recommendation !== undefined,
      frequency: recommendation?.frequency ?? 'weekly',
      weekday: recommendation?.weekday ?? 2,
      dayOfMonth: recommendation?.dayOfMonth ?? 1,
      time: recommendation?.time ?? '09:00',
      timezone: localTimezone,
    },
  };
});

/** Set suggested weekly timing while preserving each action's destination and delivery policy. */
export function applyScheduleRecommendations(actions: ActionSetting[]): ActionSetting[] {
  return actions.map((action) => {
    const recommendation = scheduleRecommendations[action.kind];
    if (!recommendation) return action;
    const schedule = {
      ...action.schedule,
      enabled: true,
      frequency: recommendation.frequency,
      time: recommendation.time,
      ...(recommendation.weekday !== undefined ? { weekday: recommendation.weekday } : {}),
      ...(recommendation.dayOfMonth !== undefined ? { dayOfMonth: recommendation.dayOfMonth } : {}),
    };
    delete schedule.date;
    delete schedule.completedAt;
    return { ...action, schedule };
  });
}

export const supportedMessageChannels: ActionSetting['channel'][] = [
  'dashboard',
  'email',
  'sms',
  'imessage',
];

export function isValidChannelBoundaries(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const boundaries = input as Record<string, unknown>;
  return Object.entries(boundaries).every(
    ([channel, text]) =>
      supportedMessageChannels.includes(channel as ActionSetting['channel']) &&
      typeof text === 'string' &&
      text.length <= 2_000,
  );
}

/** Keep channel-specific boundaries bounded and ignore unknown persisted keys. */
export function normalizeChannelBoundaries(
  input: unknown,
): NonNullable<AppSettings['channelBoundaries']> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  return Object.fromEntries(
    supportedMessageChannels.flatMap((channel) => {
      const value = source[channel];
      return typeof value === 'string' && value.length <= 2_000 ? [[channel, value]] : [];
    }),
  );
}

/** Return only the extra exclusions configured for a report's selected destination. */
export function channelBoundaryForReport(
  settings: Pick<AppSettings, 'channelBoundaries'>,
  channel: ActionSetting['channel'],
): string {
  return settings.channelBoundaries?.[channel]?.trim() ?? '';
}

/** Merge persisted settings over safe defaults so older local state gains new fields. */
export function normalizeActionSettings(input: unknown): ActionSetting[] {
  const stored = Array.isArray(input) ? input : [];
  return defaultActionSettings.map((defaults) => {
    const candidate = stored.find(
      (item): item is Record<string, unknown> =>
        !!item &&
        typeof item === 'object' &&
        (item as Record<string, unknown>).kind === defaults.kind,
    );
    if (!candidate) return structuredClone(defaults);

    const savedSchedule =
      candidate.schedule && typeof candidate.schedule === 'object'
        ? (candidate.schedule as Record<string, unknown>)
        : {};
    const timezone =
      typeof savedSchedule.timezone === 'string' && isValidTimezone(savedSchedule.timezone)
        ? savedSchedule.timezone
        : defaults.schedule.timezone;
    const date = isValidScheduleDate(savedSchedule.date) ? savedSchedule.date : undefined;
    const frequency =
      savedSchedule.frequency === 'once' && date
        ? 'once'
        : savedSchedule.frequency === 'daily'
          ? 'daily'
          : savedSchedule.frequency === 'monthly'
            ? 'monthly'
            : 'weekly';
    const completedAt =
      frequency === 'once' &&
      typeof savedSchedule.completedAt === 'string' &&
      Number.isFinite(Date.parse(savedSchedule.completedAt))
        ? savedSchedule.completedAt
        : undefined;
    return {
      ...defaults,
      ...(Array.isArray(candidate.leagueIds)
        ? {
            leagueIds: [...new Set(candidate.leagueIds.filter(isValidLeagueId))].slice(0, 100),
          }
        : {}),
      channel: isChannel(candidate.channel) ? candidate.channel : defaults.channel,
      enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : defaults.enabled,
      mode: candidate.mode === 'automatic' ? 'automatic' : 'draft',
      schedule: {
        enabled:
          typeof savedSchedule.enabled === 'boolean'
            ? savedSchedule.enabled
            : defaults.schedule.enabled,
        frequency,
        weekday:
          typeof savedSchedule.weekday === 'number' &&
          Number.isInteger(savedSchedule.weekday) &&
          savedSchedule.weekday >= 0 &&
          savedSchedule.weekday <= 6
            ? savedSchedule.weekday
            : defaults.schedule.weekday,
        dayOfMonth:
          typeof savedSchedule.dayOfMonth === 'number' &&
          Number.isInteger(savedSchedule.dayOfMonth) &&
          savedSchedule.dayOfMonth >= 1 &&
          savedSchedule.dayOfMonth <= 28
            ? savedSchedule.dayOfMonth
            : (defaults.schedule.dayOfMonth ?? 1),
        time:
          typeof savedSchedule.time === 'string' &&
          /^([01]\d|2[0-3]):[0-5]\d$/.test(savedSchedule.time)
            ? savedSchedule.time
            : defaults.schedule.time,
        timezone,
        ...(frequency === 'once' && date ? { date } : {}),
        ...(completedAt ? { completedAt } : {}),
      },
    };
  });
}

/** Resolve scheduled targets; legacy actions without a target list continue to include all leagues. */
export function leaguesForAction(
  action: ActionSetting,
  leagues: LeagueConnection[],
): LeagueConnection[] {
  const targets = action.leagueIds;
  return targets === undefined ? leagues : leagues.filter((league) => targets.includes(league.id));
}

export function normalizeLeagueCalendarEvents(
  input: unknown,
  connectedLeagueIds?: Set<string>,
): LeagueCalendarEvent[] {
  if (!Array.isArray(input)) return [];
  const events: LeagueCalendarEvent[] = [];
  const ids = new Set<string>();
  for (const item of input.slice(0, 500)) {
    if (!isValidLeagueCalendarEvent(item)) continue;
    if (ids.has(item.id) || (connectedLeagueIds && !connectedLeagueIds.has(item.leagueId)))
      continue;
    ids.add(item.id);
    events.push({
      id: item.id,
      leagueId: item.leagueId,
      title: item.title.trim(),
      kind: item.kind,
      date: item.date,
      time: item.time,
      timezone: item.timezone,
      ...(item.completedAt ? { completedAt: item.completedAt } : {}),
    });
  }
  return events;
}

export function isValidLeagueCalendarEvent(value: unknown): value is LeagueCalendarEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === 'string' &&
    /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(event.id) &&
    typeof event.leagueId === 'string' &&
    event.leagueId.length > 0 &&
    event.leagueId.length <= 200 &&
    typeof event.title === 'string' &&
    event.title.trim().length > 0 &&
    event.title.length <= 120 &&
    !/[\u0000-\u001f\u007f]/.test(event.title) &&
    supportedReportKinds.includes(event.kind as ReportKind) &&
    isValidScheduleDate(event.date) &&
    typeof event.time === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(event.time) &&
    typeof event.timezone === 'string' &&
    event.timezone.length <= 100 &&
    isValidTimezone(event.timezone) &&
    isValidLocalDateTime(event.date, event.time, event.timezone) &&
    (event.completedAt === undefined ||
      (typeof event.completedAt === 'string' && Number.isFinite(Date.parse(event.completedAt))))
  );
}

/** Preserve a completion claim if a settings save leaves the event's identity and time unchanged. */
export function preserveCompletedCalendarEvents(
  incoming: LeagueCalendarEvent[],
  existing: LeagueCalendarEvent[],
): LeagueCalendarEvent[] {
  return incoming.map((event) => {
    const previous = existing.find(
      (candidate) =>
        candidate.id === event.id &&
        candidate.leagueId === event.leagueId &&
        candidate.kind === event.kind &&
        candidate.date === event.date &&
        candidate.time === event.time &&
        candidate.timezone === event.timezone,
    );
    return previous?.completedAt ? { ...event, completedAt: previous.completedAt } : event;
  });
}

function isValidLeagueId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

export function isValidScheduleDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Add calendar days without letting local daylight-saving changes alter date arithmetic. */
export function addCalendarDays(date: string, days: number): string | undefined {
  if (!isValidScheduleDate(date) || !Number.isSafeInteger(days) || Math.abs(days) > 3660)
    return undefined;
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function platformDraftCalendarSuggestions(
  scheduledAt: string,
  timezone: string,
):
  | { draftHype: { date: string; time: string }; postDraftReview: { date: string; time: '09:00' } }
  | undefined {
  if (!isValidTimezone(timezone)) return undefined;
  const draftHype = localDateTimeInTimezone(scheduledAt, timezone);
  if (!draftHype) return undefined;
  const reviewDate = addCalendarDays(draftHype.date, 1);
  if (!reviewDate) return undefined;
  return {
    draftHype,
    postDraftReview: { date: reviewDate, time: '09:00' },
  };
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Reject wall-clock times skipped by a timezone's daylight-saving transition. */
export function isValidLocalDateTime(date: string, time: string, timezone: string): boolean {
  return localDateTimeInstants(date, time, timezone).length > 0;
}

/** Render a provider timestamp as calendar input values in the owner's selected timezone. */
export function localDateTimeInTimezone(
  instant: string,
  timezone: string,
): { date: string; time: string } | undefined {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return undefined;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      date: `${values.year}-${values.month}-${values.day}`,
      time: `${values.hour}:${values.minute}`,
    };
  } catch {
    return undefined;
  }
}

function isChannel(value: unknown): value is ActionSetting['channel'] {
  return ['dashboard', 'email', 'sms', 'imessage'].includes(String(value));
}
