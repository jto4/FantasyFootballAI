export type Platform = 'sleeper' | 'espn' | 'yahoo';
export const espnSeasonBounds = { min: 2000, max: 2099 } as const;

export function isValidEspnSeason(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= espnSeasonBounds.min &&
    value <= espnSeasonBounds.max
  );
}

export type NewsSourceId = 'espn' | 'pff' | 'fox';
export const supportedNewsSources: Array<{ id: NewsSourceId; name: string }> = [
  { id: 'espn', name: 'ESPN NFL' },
  { id: 'pff', name: 'PFF football' },
  { id: 'fox', name: 'FOX Sports NFL' },
];
export const defaultNewsSources = ['espn'] as const satisfies readonly NewsSourceId[];
export type ReportKind =
  'offseason-update' | 'draft-hype' | 'draft-review' | 'power-rankings' | 'matchup-preview';
export type ReportLength = 'short' | 'standard' | 'long';
export const reportLengthGuidance: Record<ReportLength, string> = {
  short: 'Keep the report to about 120–180 words. Prioritize the strongest league-specific point.',
  standard: 'Aim for about 250–400 words. Balance useful analysis with a few sharp jokes.',
  long: 'Aim for about 450–650 words. Add detail only when league data supports it; avoid padding.',
};
export interface RosterPlayer {
  id: string;
  name: string;
  position?: string;
  rosterPosition?: string;
  nflTeam?: string;
  status?: string;
}
export interface Team {
  id: string;
  name: string;
  owner?: string;
  wins?: number | undefined;
  losses?: number | undefined;
  pointsFor?: number | undefined;
  rosterSize?: number | undefined;
  rosterPlayerIds?: string[] | undefined;
  roster?: RosterPlayer[] | undefined;
}
export interface LeagueConnection {
  id: string;
  platform: Platform;
  name: string;
  displayName: string;
  season?: number | undefined;
  teamCount: number;
  scoring: Record<string, number>;
  settings: Record<string, unknown>;
  teams: Team[];
  draft?: LeagueDraft | undefined;
  /** Absolute platform-reported draft start time when exposed outside draft metadata. */
  draftScheduledAt?: string;
  matchups?: WeeklyMatchup[];
  connectedAt: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
  status?: 'connected' | 'limited';
}
export type LeagueSyncFreshness = 'fresh' | 'stale' | 'unknown';
export type LeagueSeasonPhase =
  'offseason' | 'regular-season' | 'playoffs' | 'complete' | 'unknown';
export const leagueStaleAfterHoursOptions = [6, 12, 24, 48, 72, 168] as const;
export type LeagueStaleAfterHours = (typeof leagueStaleAfterHoursOptions)[number];
export const defaultLeagueStaleAfterHours: LeagueStaleAfterHours = 24;
/** A stale snapshot remains usable, but the dashboard prompts its owner to refresh it. */
export const leagueSyncStaleAfterMs = defaultLeagueStaleAfterHours * 60 * 60 * 1_000;

export function isLeagueStaleAfterHours(value: unknown): value is LeagueStaleAfterHours {
  return leagueStaleAfterHoursOptions.some((hours) => hours === value);
}

export function leagueSyncFreshness(
  league: Pick<LeagueConnection, 'lastSyncedAt'>,
  now = Date.now(),
  staleAfterMs = leagueSyncStaleAfterMs,
): LeagueSyncFreshness {
  const syncedAt = league.lastSyncedAt ? Date.parse(league.lastSyncedAt) : Number.NaN;
  if (
    !Number.isFinite(syncedAt) ||
    !Number.isFinite(now) ||
    !Number.isFinite(staleAfterMs) ||
    staleAfterMs <= 0 ||
    syncedAt > now
  )
    return 'unknown';
  return now - syncedAt >= staleAfterMs ? 'stale' : 'fresh';
}

/** Classify season phase only from an explicit completion flag and a bounded current/playoff week. */
export function leagueSeasonPhase(league: Pick<LeagueConnection, 'settings'>): LeagueSeasonPhase {
  const settings = league.settings;
  if (
    settings.seasonComplete === true ||
    settings.seasonStatus === 'complete' ||
    settings.seasonStatus === 'finished'
  )
    return 'complete';
  if (settings.seasonStatus === 'pre_draft' || settings.seasonStatus === 'drafting')
    return 'offseason';
  const currentWeek = boundedSettingInteger(settings.currentWeek);
  const playoffStartWeek =
    boundedSettingInteger(settings.playoffStartWeek) ??
    boundedSettingInteger(settings.playoff_start_week) ??
    boundedSettingInteger(settings.playoff_week_start);
  if (currentWeek === undefined || playoffStartWeek === undefined) return 'unknown';
  return currentWeek >= playoffStartWeek ? 'playoffs' : 'regular-season';
}

/** Keep scheduled season-specific reports quiet when a fresh platform snapshot contradicts them. */
export function scheduledReportPhaseSkipReason(
  kind: ReportKind,
  phase: LeagueSeasonPhase,
  frequency: ReportSchedule['frequency'] = 'weekly',
): string | undefined {
  if (frequency === 'once') return undefined;
  if ((kind === 'power-rankings' || kind === 'matchup-preview') && phase === 'offseason')
    return 'The platform reports a pre-draft or draft phase; recurring in-season reports are paused until the league season starts.';
  if (kind === 'offseason-update' && (phase === 'regular-season' || phase === 'playoffs'))
    return 'This league is still active; offseason updates are paused until the platform marks the season complete.';
  if ((kind === 'power-rankings' || kind === 'matchup-preview') && phase === 'complete')
    return 'The platform marks this league season complete; weekly in-season reports are paused.';
  return undefined;
}

function boundedSettingInteger(value: unknown): number | undefined {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 30 ? numeric : undefined;
}
export interface LeagueDraft {
  id: string;
  status?: string;
  season?: number;
  /** Absolute platform-provided draft start time when the source exposes one. */
  scheduledAt?: string;
  picks: DraftPick[];
}
export interface DraftPick {
  playerId: string;
  playerName?: string;
  teamId?: string;
  round?: number;
  pickNumber?: number;
  draftSlot?: number;
  position?: string;
  nflTeam?: string;
  isKeeper?: boolean;
}
export interface PlayerProjection {
  id: string;
  leagueId: string;
  /** Stable ID for one replaceable owner-imported source set; absent on legacy rows. */
  sourceId?: string;
  /** Owner confirmation that imported point totals use this league's scoring settings. */
  scoringMatched?: boolean;
  playerId?: string;
  playerName: string;
  position?: string;
  nflTeam?: string;
  projectedPoints: number;
  /** Owner-supplied average overall draft position; compared only with logged overall picks. */
  averageDraftPosition?: number;
  /** Omitted for season-total estimates; 1–30 identifies a specific NFL week. */
  week?: number;
  sourceName: string;
  sourceUrl?: string;
  importedAt: string;
}
export interface WeeklyMatchup {
  week: number;
  teams: Array<{
    teamId: string;
    points?: number;
    playerIds?: string[];
    starters?: string[];
  }>;
}
export interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary?: string;
}
export interface SavedReport {
  id: string;
  leagueId: string;
  kind: ReportKind | 'chat-reply';
  createdAt: string;
  title: string;
  body: string;
  citations: { title: string; url: string }[];
  aiUsage?: AIUsageSummary;
  /** Provider message id which caused this review-only group chat reply draft. */
  sourceMessageId?: string;
  /** Group destination selected when this chat reply was generated. */
  replyChannel?: 'sms' | 'imessage';
  /** Existing group identifier which supplied the triggering message. */
  replyDestination?: string;
  status: 'draft' | 'sent';
  deliveryState?: 'sending' | 'failed' | 'uncertain';
  deliveryUpdatedAt?: string;
  deliveryAttempts?: DeliveryAttempt[];
}
export interface AIUsageSummary {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputUsdPerMillionTokens?: number;
  outputUsdPerMillionTokens?: number;
  estimatedCostUsd?: number;
}
export interface DeliveryAttempt {
  startedAt: string;
  finishedAt?: string;
  channel: 'email' | 'sms' | 'imessage';
  status: 'sending' | 'sent' | 'failed' | 'uncertain';
  providerMessageId?: string;
  idempotencyKey?: string;
}
export interface MemberMemory {
  id: string;
  name: string;
  sourceName: string;
  importedAt: string;
  /** Most recent import merged into this profile; importedAt remains the original creation date. */
  updatedAt?: string;
  sourceText: string;
  styleNotes: string;
  contextNotes: string;
  banterPreference?: string;
  avoidTopics?: string;
  /** Owner can exclude this member's saved notes from generated report prompts. */
  includeInReports?: boolean;
  /** Omitted means all leagues for backwards compatibility; an empty list scopes the profile nowhere. */
  leagueIds?: string[];
  /** Stable handle identifier used to merge messages from a connected chat. */
  sourceAuthorId?: string;
}
export interface ActionSetting {
  kind: ReportKind;
  channel: 'dashboard' | 'email' | 'sms' | 'imessage';
  enabled: boolean;
  mode: 'draft' | 'automatic';
  schedule: ReportSchedule;
  /** Omitted means every connected league; an explicit list scopes scheduled reports. */
  leagueIds?: string[];
}
export interface ReportSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly' | 'once';
  weekday: number;
  /** Monthly schedules run on a numeric day from 1 through 28 to exist in every month. */
  dayOfMonth?: number;
  time: string;
  timezone: string;
  date?: string;
  completedAt?: string;
}
export interface LeagueCalendarEvent {
  id: string;
  leagueId: string;
  title: string;
  kind: ReportKind;
  date: string;
  time: string;
  timezone: string;
  completedAt?: string;
}
export interface AppSettings {
  writingStyle: string;
  reportLength: ReportLength;
  allowProfanity: boolean;
  excludedTopics: string;
  /** Additional topics to avoid for each destination; omitted entries mean no extra limits. */
  channelBoundaries?: Partial<Record<ActionSetting['channel'], string>>;
  actions: ActionSetting[];
  /** Owner-authored league milestones that create drafts at a single local date and time. */
  calendarEvents?: LeagueCalendarEvent[];
  /** Master control for importing, analyzing, and using member memories. */
  memoryEnabled: boolean;
  /** Imported message contents may be sent to the selected AI runtime for analysis. */
  analyzeImportsWithAI: boolean;
  /** Reviewed member notes may be included in generated reports sent to the AI runtime. */
  includeMemberContextInReports: boolean;
  /** Reviewed member notes may be included in group-chat reply prompts sent to the AI runtime. */
  includeMemberContextInChatReplies?: boolean;
  /** Days to retain imported conversation source text; omitted means keep until deleted. */
  conversationRetentionDays?: 30 | 90 | 365;
  /** Minimum interval, in minutes, between automatic football RSS refreshes. */
  newsRefreshMinutes?: number;
  /** Dashboard warning threshold for snapshots that have not been refreshed. */
  leagueStaleAfterHours?: LeagueStaleAfterHours;
  /** Allow-listed football news feeds. Empty disables external news requests. */
  newsSources?: NewsSourceId[];
  /** Fetch a cited, CC BY 4.0 nflverse injury dataset for matchup previews. Defaults off. */
  nflInjuryReportsEnabled?: boolean;
  /** Additional retries for transient scheduled league refresh failures; defaults to off. */
  scheduledSyncRetries?: 0 | 1 | 2 | 3;
  aiRuntime?: {
    mode: 'api' | 'cli' | 'apple-cli';
    model: string;
    command: string;
    args: string;
    baseUrl: string;
    /** API-only sampling control; omitted uses the provider's standard 0.8 default. */
    temperature?: number;
    /** API-only completion cap; omitted leaves the provider model limit in control. */
    maxOutputTokens?: number;
    /** Owner-entered USD prices for approximate cost reporting, per million tokens. */
    inputUsdPerMillionTokens?: number;
    outputUsdPerMillionTokens?: number;
  };
  emailRecipient?: string;
  smsRecipient?: string;
  /** BlueBubbles chat GUID for the configured iMessage destination. */
  imessageChatGuid?: string;
  /** Name to use for owner-authored messages in a live iMessage chat. */
  imessageOwnerName?: string;
  /** Poll only the configured group when explicitly enabled by the owner. */
  imessageAutoSyncEnabled: boolean;
  /** Minutes between automatic BlueBubbles history checks. */
  imessageSyncIntervalMinutes: 5 | 15 | 30 | 60;
  /** High-water mark for the last explicitly synced BlueBubbles chat. */
  imessageSyncCursor?: {
    chatGuid: string;
    dateCreated: number;
    messageGuids: string[];
  };
  /** Next Twilio Conversations API page to read from the selected group, oldest first. */
  twilioConversationSyncCursor?: {
    conversationSid: string;
    page: number;
    lastIndex: number;
    /** Initial history has been exhausted; subsequent higher indices are newly arrived messages. */
    initialized?: boolean;
  };
  /** Poll the configured Twilio Conversations group for new member-memory messages. */
  twilioConversationAutoSyncEnabled?: boolean;
  /** Minutes between automatic Twilio Conversations history checks. */
  twilioConversationSyncIntervalMinutes?: 5 | 15 | 30 | 60;
  /** Explicitly allow direct agent mentions to create local chat reply drafts. */
  chatRepliesEnabled?: boolean;
  /** Sends mention replies immediately only after a separate explicit owner opt-in. */
  chatRepliesAutoSend?: boolean;
  /** Name or @mention prefix that activates a draft reply. */
  chatAgentName?: string;
  /** League context used when preparing group chat replies. */
  chatReplyLeagueId?: string;
  /** Explicitly permit MCP clients to send an existing draft through its configured channel. */
  mcpDeliveryEnabled?: boolean;
}
export interface LeagueSnapshot {
  id: string;
  name: string;
  season?: number;
  teamCount: number;
  scoring: Record<string, number>;
  settings: Record<string, unknown>;
  teams: Team[];
}
export interface LeagueConnector {
  platform: Platform;
  fetchLeague(id: string): Promise<LeagueConnection>;
}
export interface AIRequest {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}
export interface AICompletion {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}
export interface AIProvider {
  id: string;
  generate(request: AIRequest): Promise<string>;
  generateDetailed?(request: AIRequest): Promise<AICompletion>;
}
export interface OutboundMessage {
  to: string;
  subject?: string;
  body: string;
  replyToId?: string;
  idempotencyKey?: string;
}
export interface MessageChannel {
  id: string;
  send(message: OutboundMessage): Promise<{ providerMessageId: string }>;
}

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
  if (!isValidScheduleDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
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
    return false;
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
  return [...offsets].some((offset) => {
    const candidate = desired - offset;
    const values = Object.fromEntries(
      formatter.formatToParts(candidate).map((part) => [part.type, part.value]),
    );
    return (
      `${values.year}-${values.month}-${values.day}` === date &&
      `${values.hour}:${values.minute}` === time
    );
  });
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

export function analyzeLeague(league: LeagueConnection, kind: ReportKind, style: string) {
  const titleByKind: Record<ReportKind, string> = {
    'offseason-update': `${league.displayName}: offseason check-in`,
    'draft-hype': `${league.displayName}: draft day is here`,
    'draft-review': `${league.displayName}: the draft receipts`,
    'power-rankings': `${league.displayName}: power rankings`,
    'matchup-preview': `${league.displayName}: matchup preview`,
  };
  const lead = `${league.teamCount}-team ${league.platform.toUpperCase()} league`;
  const scoring =
    Object.entries(league.scoring)
      .map(([key, value]) => `${key} ${value} pts`)
      .join(', ') || 'standard scoring settings';
  const ranking = rankTeams(league);
  const rankingText = ranking.basis
    ? ranking.teams
        .slice(0, 5)
        .map((team, index) => {
          const record =
            ranking.basis === 'wins'
              ? `, ${team.wins} wins${team.losses !== undefined ? `, ${team.losses} losses` : ''}${team.pointsFor !== undefined ? `, ${team.pointsFor.toFixed(1)} points for` : ''}`
              : `, ${team.pointsFor?.toFixed(1)} points for`;
          return `${index + 1}. ${team.name}${team.owner ? ` (${team.owner})` : ''}${record}`;
        })
        .join('\n')
    : 'Team data is incomplete; there is no reliable common metric for a standings ranking.';
  const body =
    kind === 'power-rankings'
      ? `${lead}, using ${scoring}.\n\n${rankingText}\n\nRanking basis: ${ranking.basis ?? 'unavailable'}. This is a standings-based snapshot, not a projection. Voice: ${style}.`
      : `${lead}, using ${scoring}.\n\n${kind === 'draft-hype' ? 'Draft board: clear your calendar, charge your phone, and prepare your best confident reach.' : kind === 'draft-review' ? 'Draft review: the picks are in. Let’s see who built a contender and who drafted purely for the group chat.' : kind === 'matchup-preview' ? 'Matchup preview: bring the receipts, check the lineups, and get ready for a week of questionable confidence.' : 'Offseason check-in: rosters are taking shape and the group chat is about to become a full-time job.'}\n\nVoice: ${style}. Connect an AI provider to generate a personalized breakdown from current player projections and news.`;
  return { title: titleByKind[kind], body, citations: [] as { title: string; url: string }[] };
}

/** Rank only when every team has a comparable primary metric; break ties with points for. */
export function rankTeams(league: LeagueConnection) {
  const hasStandingsSignal = league.teams.some(
    (team) => (team.wins ?? 0) > 0 || (team.losses ?? 0) > 0 || (team.pointsFor ?? 0) > 0,
  );
  const basis =
    hasStandingsSignal &&
    league.teams.length > 0 &&
    league.teams.every((team) => Number.isFinite(team.wins))
      ? 'wins'
      : hasStandingsSignal &&
          league.teams.length > 0 &&
          league.teams.every((team) => Number.isFinite(team.pointsFor))
        ? 'pointsFor'
        : undefined;
  const teams = [...league.teams].sort((left, right) => {
    if (basis === 'wins' && right.wins !== left.wins) return (right.wins ?? 0) - (left.wins ?? 0);
    if (basis === 'pointsFor' && right.pointsFor !== left.pointsFor)
      return (right.pointsFor ?? 0) - (left.pointsFor ?? 0);
    return (right.pointsFor ?? 0) - (left.pointsFor ?? 0);
  });
  return { basis, teams };
}

/** Provide cautious preseason power-ranking evidence from one complete owner-confirmed source. */
function preseasonRosterProjectionEvidence(
  league: LeagueConnection,
  projections: PlayerProjection[],
): string | undefined {
  if (
    league.teams.length === 0 ||
    league.teams.length > 32 ||
    league.teams.length !== league.teamCount
  )
    return undefined;

  const sources = projectionSourceGroups(projections)
    .map((source) => ({
      ...source,
      projections: source.projections.filter((projection) => projection.week === undefined),
    }))
    .filter(
      (source) =>
        source.projections.length > 0 &&
        source.projections.every((projection) => projection.scoringMatched === true),
    )
    .sort((left, right) => right.importedAt.localeCompare(left.importedAt));
  const source = sources[0];
  if (!source) return undefined;

  const projectionsById = new Map<string, PlayerProjection[]>();
  const projectionsByName = new Map<string, PlayerProjection[]>();
  for (const projection of source.projections) {
    if (projection.playerId) {
      const matches = projectionsById.get(projection.playerId) ?? [];
      matches.push(projection);
      projectionsById.set(projection.playerId, matches);
    }
    const name = projectionNameKey(projection.playerName);
    if (name) {
      const matches = projectionsByName.get(name) ?? [];
      matches.push(projection);
      projectionsByName.set(name, matches);
    }
  }

  const projectedTeams = [] as Array<{ name: string; total: number; rosterSize: number }>;
  const rosterSizes = new Set<number>();
  for (const team of league.teams) {
    const roster = team.roster;
    if (
      !roster?.length ||
      roster.length > 100 ||
      team.rosterSize !== roster.length ||
      !Number.isInteger(team.rosterSize)
    )
      return undefined;
    const teamProjections: PlayerProjection[] = [];
    for (const player of roster) {
      const byId = projectionsById.get(player.id) ?? [];
      const byName = projectionsByName.get(projectionNameKey(player.name)) ?? [];
      const matched =
        byId.length === 1 &&
        projectionNameKey(byId[0]!.playerName) === projectionNameKey(player.name)
          ? byId[0]
          : byId.length === 0 && byName.length === 1
            ? byName[0]
            : undefined;
      if (!matched || !Number.isFinite(matched.projectedPoints)) return undefined;
      teamProjections.push(matched);
    }
    rosterSizes.add(roster.length);
    projectedTeams.push({
      name: team.name,
      total: teamProjections.reduce((total, projection) => total + projection.projectedPoints, 0),
      rosterSize: roster.length,
    });
  }
  if (rosterSizes.size !== 1) return undefined;

  const ordered = projectedTeams
    .sort((left, right) => right.total - left.total)
    .map(
      (team, index) =>
        `${index + 1}. ${JSON.stringify(team.name)}: ${team.total.toFixed(1)} projected points across ${team.rosterSize} rostered players`,
    );
  return `No comparable played-season standings are available. The newest owner-confirmed season projection source is ${JSON.stringify(source.sourceName)}${source.sourceUrl ? ` (${source.sourceUrl})` : ''}, imported ${source.importedAt}. Exact player IDs or unique normalized names matched every player in complete, equal-size roster snapshots. Full-roster projection totals (bench included), ordered high to low: ${ordered.join('; ')}. Use this only for a clearly labeled AI preseason power ranking, not as a starting-lineup projection, standings result, or win forecast. Treat the owner-confirmed scoring alignment and projection source as unverified estimates.`;
}

/** Tell the model what the connected snapshot cannot support, report by report. */
export function reportEvidenceGuidance(
  league: LeagueConnection,
  kind: ReportKind,
  projections: PlayerProjection[] = [],
): string {
  if (kind === 'power-rankings') {
    const { basis } = rankTeams(league);
    const preseasonEvidence = basis
      ? undefined
      : preseasonRosterProjectionEvidence(league, projections);
    const rankingGuidance = basis
      ? `Rank only from the comparable team snapshot using ${basis}${basis === 'wins' ? ' and use pointsFor as the tie-breaker when present' : ''}; state that this is not a projection.`
      : (preseasonEvidence ??
        'There is no complete shared record or points-for metric across all teams, and complete owner-confirmed roster projections are unavailable; say rankings are unavailable instead of inventing an order.');
    return `${rankingGuidance} ${leagueSeasonPhaseGuidance(league)}`;
  }
  const hasRosterPlayers = league.teams.some((team) => (team.roster?.length ?? 0) > 0);
  if (kind === 'matchup-preview') {
    const matchups = league.matchups ?? [];
    if (!matchups.length)
      return 'No current matchup data is available. Say so and do not invent opponents, projections, or lineup details.';

    const teamNames = new Map(league.teams.map((team) => [team.id, team.name]));
    const pairings = matchups.slice(0, 24).map((matchup) => {
      const sides = matchup.teams.slice(0, 2).map((side) => {
        const label = teamNames.get(side.teamId);
        const name = label ? JSON.stringify(label) : `team ID ${JSON.stringify(side.teamId)}`;
        return `${name}${side.points !== undefined ? ` (${side.points} platform-reported points)` : ''}`;
      });
      return `week ${matchup.week}: ${sides.join(' vs ')}`;
    });
    const scoreContext = matchups.some((matchup) =>
      matchup.teams.some((side) => side.points !== undefined),
    )
      ? 'Scores are the platform snapshot only; the connection does not establish whether they are live or final.'
      : 'No scores are available in this snapshot.';
    const injuryEvidence = platformAvailabilityEvidence(league);
    return `Available pairings: ${pairings.join('; ')}. ${scoreContext} ${leagueSeasonPhaseGuidance(league)} ${hasRosterPlayers ? 'Roster snapshots are available for player-name context.' : 'Player-level rosters are not available.'} ${injuryEvidence} ${matchupProjectionEvidence(league, projections)} Do not call platform scores projections, infer winners from an in-progress score, give unsupported lineup advice, or infer diagnosis or return dates from a roster status.`;
  }
  if (kind === 'draft-review')
    return league.draft?.picks.length
      ? `The draft pick log contains ${league.draft.picks.length} ${league.draft.picks.length === 1 ? 'pick' : 'picks'}${league.draft.status ? ` and draft status ${league.draft.status}` : ''}. Discuss the logged picks and current roster context. ${draftProjectionEvidence(league, projections)}`
      : hasRosterPlayers
        ? `Current roster players are available, but this snapshot has no draft pick log or pick order. Discuss current roster construction only; do not attribute players to draft rounds. ${draftProjectionEvidence(league, projections)}`
        : `This snapshot has no draft pick log or player-level roster data. Explain the data gap. ${draftProjectionEvidence(league, projections)}`;
  if (kind === 'draft-hype')
    return 'No draft date, draft order, or live draft room status is available. Keep this as general draft-day hype and do not invent logistics.';
  return hasRosterPlayers
    ? 'Current roster players are available, but there is no transaction history or historical roster snapshot. Keep offseason claims limited to current roster construction, standings, and supplied news.'
    : 'This snapshot has no transaction history or player-level roster data. Keep offseason claims general unless supported by the supplied standings or news.';
}

function leagueSeasonPhaseGuidance(league: LeagueConnection): string {
  const currentWeek = boundedSettingInteger(league.settings.currentWeek);
  const playoffStartWeek =
    boundedSettingInteger(league.settings.playoffStartWeek) ??
    boundedSettingInteger(league.settings.playoff_start_week) ??
    boundedSettingInteger(league.settings.playoff_week_start);
  switch (leagueSeasonPhase(league)) {
    case 'offseason':
      return 'Sleeper reports a pre-draft or draft phase. Do not describe weekly matchups as underway; owner-scheduled one-time draft reports remain available.';
    case 'regular-season':
      return `The platform settings identify regular-season week ${currentWeek}; do not describe playoff stakes.`;
    case 'playoffs':
      if (league.settings.playoffStartWeekSource === 'derived')
        return `ESPN's schedule settings suggest playoff week ${currentWeek} (estimated start week ${playoffStartWeek}). Treat this phase as inferred; discuss postseason stakes only when supported by supplied matchups and standings, and do not infer elimination or bracket rules.`;
      return `The platform settings identify playoff week ${currentWeek} (playoffs start in week ${playoffStartWeek}). Discuss postseason stakes only when supported by supplied matchups and standings; do not infer elimination or bracket rules.`;
    case 'complete':
      return 'The platform marks this league season complete; do not describe matchups as upcoming.';
    default:
      return 'The platform snapshot does not confirm season phase. Do not claim a team is in or out of the playoffs or invent postseason stakes.';
  }
}

/** Match owner-imported season projections to picks and compute conservative points-above-replacement evidence. */
function draftProjectionEvidence(
  league: LeagueConnection,
  projections: PlayerProjection[],
): string {
  if (!projections.length)
    return 'No owner-imported projections are available; do not invent projections or grade pick value.';
  const seasonSources = projectionSourceGroups(projections)
    .map((source) => ({
      ...source,
      projections: source.projections.filter((projection) => projection.week === undefined),
    }))
    .filter((source) => source.projections.length > 0)
    .sort((left, right) => right.importedAt.localeCompare(left.importedAt));
  const scoringMatchedSources = seasonSources.filter((source) =>
    source.projections.every((projection) => projection.scoringMatched === true),
  );
  const primarySource = scoringMatchedSources[0];
  const seasonProjections = primarySource?.projections ?? [];
  if (!seasonProjections.length)
    return seasonSources.length
      ? 'Season projection files are available, but none is confirmed by the owner as matching this league’s scoring settings. Do not use their point totals, ADP, or positional baselines for draft grades.'
      : 'Only week-specific projections were imported; there are no season projections for draft value analysis.';
  const adpSources = scoringMatchedSources.filter((source) =>
    source.projections.some((projection) => projection.averageDraftPosition !== undefined),
  );
  const adpSourceDetails = adpSources.map(
    (source) =>
      `${JSON.stringify(source.sourceName)}${source.sourceUrl ? ` (${JSON.stringify(source.sourceUrl)})` : ''}, imported ${source.importedAt}`,
  );
  const metadata = `Owner-imported season projections from ${JSON.stringify(primarySource!.sourceName)}, imported ${primarySource!.importedAt}${primarySource!.sourceUrl ? `, source URL ${JSON.stringify(primarySource!.sourceUrl)}` : ''}; the owner confirms this source uses the league's scoring settings, which is not independently verified. ${adpSources.length ? `Owner-supplied ADP sources: ${adpSourceDetails.join('; ')}. ADP source independence and accuracy are not independently verified.` : 'These are estimates, not ADP or actual outcomes.'} ${adpSources.length >= 3 ? 'Player ADP evidence uses the median across at least three distinct imported source sets when the player is matched in each.' : `Only ${adpSources.length} scoring-matched ADP source set(s) are available; multi-source ADP evidence requires at least 3.`}`;
  const picks = league.draft?.picks ?? [];
  if (!picks.length) return `${metadata} No draft picks can be matched in this snapshot.`;

  const byId = new Map(
    seasonProjections.flatMap((projection) =>
      projection.playerId ? [[projection.playerId, projection] as const] : [],
    ),
  );
  const byName = new Map<string, PlayerProjection[]>();
  for (const projection of seasonProjections) {
    const name = projectionNameKey(projection.playerName);
    const matches = byName.get(name) ?? [];
    matches.push(projection);
    byName.set(name, matches);
  }

  const slots = Array.isArray(league.settings.roster_positions)
    ? league.settings.roster_positions
    : [];
  const includesFlexibleStarters = slots.some((slot) => {
    if (typeof slot !== 'string') return false;
    return [
      'FLEX',
      'FLX',
      'WRT',
      'RECFLEX',
      'WRRBFLEX',
      'WRTQB',
      'QBRBWRTE',
      'SUPERFLEX',
      'OP',
    ].includes(
      slot
        .trim()
        .toUpperCase()
        .replace(/[\s/_-]/g, ''),
    );
  });
  const pools = new Map<string, PlayerProjection[]>();
  for (const projection of seasonProjections) {
    const position = normalizeProjectionPosition(projection.position ?? '');
    if (!position) continue;
    const pool = pools.get(position) ?? [];
    pool.push(projection);
    pools.set(position, pool);
  }
  for (const pool of pools.values())
    pool.sort((left, right) => right.projectedPoints - left.projectedPoints);
  const replacementBaselines = draftReplacementBaselines(league.teamCount, slots, pools);

  const teamValue = new Map<
    string,
    { points: number; picks: number; complete: boolean; adpDelta: number; adpPicks: number }
  >();
  let allLoggedPicksSupported = picks.length <= 240;
  let allLoggedPicksHaveAdp = picks.length > 0 && picks.length <= 240;
  const pickEvidence = picks.slice(0, 240).flatMap((pick) => {
    const teamTotal = pick.teamId
      ? (teamValue.get(pick.teamId) ?? {
          points: 0,
          picks: 0,
          complete: true,
          adpDelta: 0,
          adpPicks: 0,
        })
      : undefined;
    if (teamTotal) {
      teamTotal.picks += 1;
      teamValue.set(pick.teamId!, teamTotal);
    } else {
      allLoggedPicksSupported = false;
    }
    const name = pick.playerName?.trim();
    const projection =
      byId.get(pick.playerId) ??
      (name
        ? byName.get(projectionNameKey(name))?.length === 1
          ? byName.get(projectionNameKey(name))![0]
          : undefined
        : undefined);
    if (!projection) {
      allLoggedPicksSupported = false;
      allLoggedPicksHaveAdp = false;
      if (teamTotal) teamTotal.complete = false;
      return [];
    }
    const position = normalizeProjectionPosition(projection.position ?? pick.position ?? '');
    let replacement = '';
    let pointsAboveReplacement: number | undefined;
    if (position) {
      const baseline = replacementBaselines.get(position);
      if (baseline) {
        const value = projection.projectedPoints - baseline.projectedPoints;
        pointsAboveReplacement = value;
        replacement = `; ${value >= 0 ? '+' : ''}${value.toFixed(1)} projected points versus ${position} replacement (${baseline.projectedPoints.toFixed(1)})`;
      }
    }
    if (teamTotal) {
      if (pointsAboveReplacement === undefined) {
        teamTotal.complete = false;
        allLoggedPicksSupported = false;
      } else {
        teamTotal.points += pointsAboveReplacement;
      }
    }
    const pickLabel =
      pick.pickNumber !== undefined ? `pick ${pick.pickNumber}` : `round ${pick.round ?? '?'}`;
    const adpConsensus = multiSourceAdp(projection, adpSources);
    const adpComparison =
      adpConsensus && pick.pickNumber !== undefined
        ? `; selected ${pick.pickNumber - adpConsensus.median >= 0 ? `${(pick.pickNumber - adpConsensus.median).toFixed(1)} picks later` : `${(adpConsensus.median - pick.pickNumber).toFixed(1)} picks earlier`} than the ${adpConsensus.median.toFixed(1)} median ADP from ${adpConsensus.sourceCount} sources`
        : '';
    if (!adpConsensus || pick.pickNumber === undefined) {
      allLoggedPicksHaveAdp = false;
    } else if (teamTotal) {
      // Positive means the player was selected later than the multi-source median ADP.
      teamTotal.adpDelta += pick.pickNumber - adpConsensus.median;
      teamTotal.adpPicks += 1;
    } else {
      allLoggedPicksHaveAdp = false;
    }
    return [
      `${pickLabel}: ${JSON.stringify(projection.playerName)} (${position || 'position unavailable'}), ${projection.projectedPoints.toFixed(1)} projected season points${replacement}${adpComparison}`,
    ];
  });
  const lines = pickEvidence.length
    ? pickEvidence.join('; ')
    : 'No logged picks matched unambiguously to an imported projection.';
  const teamNames = new Map(league.teams.map((team) => [team.id, team.name]));
  const teamTotals = [...teamValue.entries()];
  const supportedTeamTotals =
    allLoggedPicksSupported &&
    teamTotals.length > 0 &&
    teamTotals.every(([, value]) => value.complete);
  const teamSummary = supportedTeamTotals
    ? ` Logged-pick projected surplus versus positional replacement by team: ${teamTotals
        .map(
          ([teamId, value]) =>
            `${JSON.stringify(teamNames.get(teamId) ?? teamId)} ${value.points >= 0 ? '+' : ''}${value.points.toFixed(1)} points across ${value.picks} picks`,
        )
        .join(
          '; ',
        )}. This compares only logged picks against the imported positional baseline; it is not a full-season outcome grade.`
    : 'A comparable team-level draft total is unavailable because one or more logged picks lack an unambiguous projection, team, position, or supported positional replacement baseline.';
  const confirmedComplete = /^(complete|completed|finished)$/i.test(league.draft?.status ?? '');
  const teamAdpTotals =
    confirmedComplete && allLoggedPicksHaveAdp && teamTotals.length > 0
      ? ` Team-level ADP timing across all logged picks: ${teamTotals
          .map(([teamId, value]) => {
            const averageDelta = value.adpDelta / value.adpPicks;
            const direction =
              averageDelta >= 0
                ? `${averageDelta.toFixed(1)} overall picks later`
                : `${Math.abs(averageDelta).toFixed(1)} overall picks earlier`;
            return `${JSON.stringify(teamNames.get(teamId) ?? teamId)} averaged ${direction} than the multi-source median ADP across ${value.adpPicks} matched picks`;
          })
          .join('; ')}. This is descriptive timing, not an outcome grade.`
      : ' A team-level ADP timing summary is withheld because the platform does not confirm a completed draft, every pick lacks an overall pick number or a player matched across at least three imported ADP sources, or team assignment is incomplete.';
  const hasCompleteGradeEvidence =
    confirmedComplete && supportedTeamTotals && allLoggedPicksHaveAdp && teamTotals.length > 0;
  const gradeGuidance = hasCompleteGradeEvidence
    ? 'If giving tentative team process grades, base them only on the complete owner-supplied points-above-replacement and ADP evidence above; label both as estimates and do not present a process grade as a player outcome.'
    : 'Do not assign team draft grades because the confirmed completed draft, three-source ADP matches, or positional replacement evidence is incomplete.';
  const flexibleStarterNote = includesFlexibleStarters
    ? 'Flex, receiver-flex, and superflex replacement slots are allocated to the eligible position with the strongest next imported projection; this is a projection-based approximation.'
    : '';
  return `${metadata} ${flexibleStarterNote} Matched pick evidence: ${lines}.${teamSummary}${teamAdpTotals} ${gradeGuidance} Use points-above-replacement only when the positional baseline is present; without a baseline, discuss the imported projected points without assigning a value grade. Treat ADP comparisons as descriptive timing only, not proof that a selection was good or bad. The multi-source ADP median is owner-supplied and not independently verified market consensus, a guarantee, or injury information.`;
}

type ProjectionSourceGroup = {
  id: string;
  sourceName: string;
  sourceUrl?: string;
  importedAt: string;
  projections: PlayerProjection[];
};

function projectionSourceGroups(projections: PlayerProjection[]): ProjectionSourceGroup[] {
  const groups = new Map<string, ProjectionSourceGroup>();
  for (const projection of projections) {
    const id =
      projection.sourceId ??
      `legacy:${projection.sourceName.trim().toLowerCase()}\u0000${projection.sourceUrl ?? ''}`;
    const group = groups.get(id) ?? {
      id,
      sourceName: projection.sourceName,
      ...(projection.sourceUrl ? { sourceUrl: projection.sourceUrl } : {}),
      importedAt: projection.importedAt,
      projections: [],
    };
    group.projections.push(projection);
    if (projection.importedAt > group.importedAt) group.importedAt = projection.importedAt;
    groups.set(id, group);
  }
  return [...groups.values()];
}

function multiSourceAdp(
  target: PlayerProjection,
  sources: ProjectionSourceGroup[],
): { median: number; sourceCount: number } | undefined {
  const values: number[] = [];
  for (const source of sources) {
    const exactMatches = target.playerId
      ? source.projections.filter((projection) => projection.playerId === target.playerId)
      : [];
    const nameMatches = source.projections.filter(
      (projection) =>
        projectionNameKey(projection.playerName) === projectionNameKey(target.playerName),
    );
    const match =
      exactMatches.length === 1
        ? exactMatches[0]
        : exactMatches.length > 1
          ? undefined
          : nameMatches.length === 1
            ? nameMatches[0]
            : undefined;
    if (match?.averageDraftPosition !== undefined) values.push(match.averageDraftPosition);
  }
  if (values.length < 3) return undefined;
  values.sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 0 ? (values[middle - 1]! + values[middle]!) / 2 : values[middle]!;
  return { median, sourceCount: values.length };
}

/** Compare imported weekly projections only for a complete, platform-reported lineup snapshot. */
function matchupProjectionEvidence(
  league: LeagueConnection,
  projections: PlayerProjection[],
): string {
  const allWeeklySources = projectionSourceGroups(projections)
    .map((source) => ({
      ...source,
      projections: source.projections.filter((projection) => projection.week !== undefined),
    }))
    .filter((source) => source.projections.length > 0)
    .sort((left, right) => right.importedAt.localeCompare(left.importedAt));
  const weeklySources = allWeeklySources.filter((source) =>
    source.projections.every((projection) => projection.scoringMatched === true),
  );
  if (!weeklySources.length)
    return allWeeklySources.length
      ? 'Week-specific projection files exist, but none is confirmed by the owner as matching this league’s scoring settings; do not calculate matchup totals or winners from them.'
      : 'No owner-imported week-specific projections are available; do not invent projected scores or winners.';
  const teamNames = new Map(league.teams.map((team) => [team.id, team.name]));
  const selectedSources = new Map<string, ProjectionSourceGroup>();
  const estimates = (league.matchups ?? []).slice(0, 24).flatMap((matchup) => {
    const source = weeklySources.find((candidate) =>
      candidate.projections.some((projection) => projection.week === matchup.week),
    );
    if (!source) return [];
    selectedSources.set(source.id, source);
    const weekProjections = source.projections.filter(
      (projection) => projection.week === matchup.week,
    );
    if (weekProjections.length === 0) return [];
    const byId = new Map(
      weekProjections.flatMap((projection) =>
        projection.playerId ? [[projection.playerId, projection] as const] : [],
      ),
    );
    const sides = matchup.teams.slice(0, 2).map((team) => {
      const starters = matchupStarterIds(league, team.teamId, team.starters);
      if (starters.length === 0) return undefined;
      const matched = starters.map((id) => byId.get(id));
      if (matched.some((projection) => projection === undefined)) return undefined;
      const total = matched.reduce((sum, projection) => sum + projection!.projectedPoints, 0);
      return `${JSON.stringify(teamNames.get(team.teamId) ?? team.teamId)} ${total.toFixed(1)}`;
    });
    if (sides.length !== 2 || sides.some((side) => side === undefined)) return [];
    return [`week ${matchup.week}: ${sides[0]} vs ${sides[1]}`];
  });
  if (!estimates.length)
    return 'Week-specific projections are imported, but no matchup has a complete starter-ID and projection match; do not estimate a team total or winner.';
  const sourcesText = [...selectedSources.values()]
    .map(
      (source) =>
        `${JSON.stringify(source.sourceName)}${source.sourceUrl ? ` (${JSON.stringify(source.sourceUrl)})` : ''}, imported ${source.importedAt}`,
    )
    .join('; ');
  const lineupFreshness = league.lastSyncedAt
    ? `Starter assignments came from the platform snapshot last synced ${league.lastSyncedAt}; confirm current lineups before kickoff.`
    : 'The starter snapshot has no recorded sync time; confirm current lineups before kickoff.';
  return `Imported week-specific projection estimates from ${sourcesText}; the owner confirms these sources use the league's scoring settings, which is not independently verified. Complete starter-based totals: ${estimates.join('; ')}. ${lineupFreshness} These are model-independent sums of the owner's imported estimates, not platform scores or guaranteed outcomes. Do not treat incomplete or unmatched lineups as projected totals.`;
}

function matchupStarterIds(
  league: LeagueConnection,
  teamId: string,
  reportedStarters: string[] | undefined,
): string[] {
  if (reportedStarters !== undefined) {
    if (
      reportedStarters.length === 0 ||
      reportedStarters.some((id) => id === '0' || id.trim() === '') ||
      new Set(reportedStarters).size !== reportedStarters.length
    )
      return [];
    return reportedStarters;
  }
  const team = league.teams.find((candidate) => candidate.id === teamId);
  const roster = team?.roster;
  if (!team || !roster?.length || team.rosterSize !== roster.length) return [];
  const starters: string[] = [];
  for (const player of roster) {
    const slot = player.rosterPosition?.trim().toUpperCase().replace(/[ _-]/g, '') ?? '';
    if (['BN', 'BENCH', 'BE', 'IR', 'IR+', 'NA', 'RES', 'SUSP'].includes(slot)) continue;
    // An unrecognized or missing slot makes the whole roster snapshot incomplete for projections.
    if (!slot || !normalizeProjectionPosition(slot)) return [];
    starters.push(player.id);
  }
  return new Set(starters).size === starters.length ? starters : [];
}

/**
 * Allocate flex starters to the strongest next projected player across eligible positions.
 * Unknown slots or incomplete pools for a flex-eligible position invalidate the model; a
 * missing fixed-position pool only withholds that position's baseline.
 */
function draftReplacementBaselines(
  teamCount: number,
  slots: unknown[],
  pools: ReadonlyMap<string, PlayerProjection[]>,
): Map<string, PlayerProjection> {
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 32 || !slots.length)
    return new Map();

  const fixedStarters = new Map<string, number>();
  const flexibleSlots: string[][] = [];
  const reservedSlots = new Set([
    'BN',
    'BE',
    'BENCH',
    'IR',
    'IR+',
    'NA',
    'RES',
    'SUSP',
    'TAXI',
    'PUP',
    'NFI',
  ]);
  const flexEligibility: Record<string, string[]> = {
    FLEX: ['RB', 'WR', 'TE'],
    FLX: ['RB', 'WR', 'TE'],
    WRT: ['RB', 'WR', 'TE'],
    RECFLEX: ['WR', 'TE'],
    WRRBFLEX: ['RB', 'WR'],
    WRTQB: ['QB', 'RB', 'WR', 'TE'],
    QBRBWRTE: ['QB', 'RB', 'WR', 'TE'],
    SUPERFLEX: ['QB', 'RB', 'WR', 'TE'],
    OP: ['QB', 'RB', 'WR', 'TE'],
  };

  for (const rawSlot of slots) {
    if (typeof rawSlot !== 'string') return new Map();
    const compactSlot = rawSlot
      .trim()
      .toUpperCase()
      .replace(/[\s/_-]/g, '');
    if (reservedSlots.has(compactSlot)) continue;
    const eligibility = flexEligibility[compactSlot];
    if (eligibility) {
      flexibleSlots.push(eligibility);
      continue;
    }
    const position = normalizeProjectionPosition(rawSlot);
    if (!['QB', 'RB', 'WR', 'TE', 'DST', 'K'].includes(position)) return new Map();
    fixedStarters.set(position, (fixedStarters.get(position) ?? 0) + 1);
  }

  if (fixedStarters.size === 0 && flexibleSlots.length === 0) return new Map();
  const starterCounts = new Map(
    [...fixedStarters].map(([position, count]) => [position, count * teamCount]),
  );
  for (const eligibility of flexibleSlots) {
    for (let teamSlot = 0; teamSlot < teamCount; teamSlot += 1) {
      if (eligibility.some((position) => !pools.get(position)?.[starterCounts.get(position) ?? 0]))
        return new Map();
      let selected: { position: string; projectedPoints: number } | undefined;
      for (const position of eligibility) {
        const candidate = pools.get(position)?.[starterCounts.get(position) ?? 0];
        if (candidate && (!selected || candidate.projectedPoints > selected.projectedPoints))
          selected = { position, projectedPoints: candidate.projectedPoints };
      }
      if (!selected) return new Map();
      starterCounts.set(selected.position, (starterCounts.get(selected.position) ?? 0) + 1);
    }
  }

  const baselines = new Map<string, PlayerProjection>();
  for (const [position, count] of starterCounts) {
    const baseline = pools.get(position)?.[count - 1];
    if (baseline) baselines.set(position, baseline);
  }
  return baselines;
}

function projectionNameKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeProjectionPosition(value: string): string {
  const position = value
    .trim()
    .toUpperCase()
    .replace(/[\/ -]+/g, '');
  if (position === 'DEF' || position === 'DST') return 'DST';
  if (['QB', 'RB', 'WR', 'TE', 'K'].includes(position)) return position;
  if (['SUPERFLEX', 'WRTQB', 'QBRBWRTE', 'OP'].includes(position)) return 'SUPERFLEX';
  if (['FLEX', 'FLX', 'WRT', 'RECFLEX', 'WRRBFLEX'].includes(position)) return 'FLEX';
  if (position === 'BN' || position === 'BENCH') return 'BENCH';
  if (position === 'IR') return 'IR';
  return '';
}

/** Include only known availability labels; provider roster status is not a medical report. */
function platformAvailabilityEvidence(league: LeagueConnection): string {
  const allowed = new Set([
    'QUESTIONABLE',
    'DOUBTFUL',
    'OUT',
    'IR',
    'INJURED RESERVE',
    'INJURY RESERVE',
    'PUP',
    'PUP LIST',
    'PHYSICALLY UNABLE TO PERFORM',
    'NFI',
    'NON FOOTBALL INJURY',
    'SUSPENDED',
  ]);
  const statuses = league.teams.flatMap((team) =>
    (team.roster ?? []).flatMap((player) => {
      const status = player.status
        ?.trim()
        .replace(/[\s_-]+/g, ' ')
        .toUpperCase();
      if (!status || !allowed.has(status)) return [];
      return [`${JSON.stringify(player.name)}: ${JSON.stringify(status)}`];
    }),
  );
  if (!statuses.length)
    return 'No non-active availability tags were supplied by the connected platform.';
  const evidence = statuses.slice(0, 30).join('; ');
  const omitted = statuses.length > 30 ? `; ${statuses.length - 30} additional tags omitted` : '';
  const synced = league.lastSyncedAt ? ` at ${league.lastSyncedAt}` : ' (sync time unavailable)';
  return `Platform-reported roster availability as of the last league sync${synced}: ${evidence}${omitted}. Treat these labels as potentially stale roster data, not verified injury reports.`;
}

export function normalizeScoring(raw: Record<string, unknown> | undefined): Record<string, number> {
  if (!raw) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1]) &&
        entry[0].length > 0 &&
        entry[0].length <= 120 &&
        !/[\u0000-\u001f\u007f]/.test(entry[0]),
    ),
  );
}

/** Keep saved source selection inside the built-in feed allow-list. */
export function normalizeNewsSources(input: unknown): NewsSourceId[] {
  if (!Array.isArray(input)) return [...defaultNewsSources];
  return [
    ...new Set(
      input.filter(
        (value): value is NewsSourceId => value === 'espn' || value === 'pff' || value === 'fox',
      ),
    ),
  ];
}
