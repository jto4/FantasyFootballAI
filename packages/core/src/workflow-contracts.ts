import { isValidLeagueCalendarEvent, isValidTimezone } from './schedules.js';
import { isValidWritingStylePresets } from './index.js';
import type { AppSettings, LeagueConnection, ReportKind, SavedReport } from './index.js';

/** Durable outbound data contains public routing identity, never provider credentials. */
export interface DeliveryEnvelope {
  channel: 'email' | 'sms' | 'imessage';
  destination: string;
  sender: string;
  providerIdentity?: string;
  /** A hash detects a changed Resend credential without retaining its API key. */
  credentialFingerprint?: string;
  subject: string;
  body: string;
  replyToId?: string;
}
export interface GenerationRequest {
  requestId: string;
  leagueId: string;
  kind: ReportKind;
}
export interface GenerationJob extends GenerationRequest {
  id: string;
  automaticDelivery?: boolean;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted';
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  reportId?: string;
  error?: string;
}
export type ReportSummary = Pick<
  SavedReport,
  | 'id'
  | 'leagueId'
  | 'kind'
  | 'createdAt'
  | 'title'
  | 'status'
  | 'deliveryState'
  | 'revision'
  | 'editedAt'
>;
export interface ReportPage {
  items: ReportSummary[];
  nextCursor?: string;
  total: number;
}
export const reportKinds: readonly ReportKind[] = [
  'offseason-update',
  'draft-hype',
  'draft-review',
  'power-rankings',
  'matchup-preview',
];
export function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
const text = (value: unknown, max: number, empty = false): value is string =>
  typeof value === 'string' && value.length <= max && (empty || value.length > 0);
const date = (value: unknown) => text(value, 64) && Number.isFinite(Date.parse(value));
const boundedNumber = (value: unknown, min: number, max: number, integer = false) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max &&
  (!integer || Number.isSafeInteger(value));
const optionalText = (value: unknown, max: number) => value === undefined || text(value, max, true);
const stringList = (value: unknown, maxItems: number, maxLength: number) =>
  Array.isArray(value) && value.length <= maxItems && value.every((item) => text(item, maxLength));
const safeHttpUrl = (value: unknown) => {
  if (!text(value, 2048)) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
};
const revision = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function isGenerationRequest(value: unknown): value is GenerationRequest {
  return (
    record(value) &&
    Object.keys(value).every((key) => ['requestId', 'leagueId', 'kind'].includes(key)) &&
    text(value.requestId, 128) &&
    /^[a-zA-Z0-9_-]{8,128}$/.test(value.requestId) &&
    text(value.leagueId, 256) &&
    reportKinds.includes(value.kind as ReportKind)
  );
}
export function isGenerationJob(value: unknown): value is GenerationJob {
  return (
    record(value) &&
    Object.keys(value).every((key) =>
      [
        'id',
        'requestId',
        'leagueId',
        'kind',
        'automaticDelivery',
        'status',
        'createdAt',
        'startedAt',
        'finishedAt',
        'reportId',
        'error',
      ].includes(key),
    ) &&
    text(value.id, 128) &&
    text(value.requestId, 128) &&
    text(value.leagueId, 256) &&
    reportKinds.includes(value.kind as ReportKind) &&
    ['queued', 'running', 'completed', 'failed', 'interrupted'].includes(String(value.status)) &&
    (value.automaticDelivery === undefined || typeof value.automaticDelivery === 'boolean') &&
    date(value.createdAt) &&
    (value.startedAt === undefined || date(value.startedAt)) &&
    (value.finishedAt === undefined || date(value.finishedAt)) &&
    (value.reportId === undefined || text(value.reportId, 128)) &&
    (value.error === undefined || text(value.error, 500, true)) &&
    (value.status !== 'completed' || text(value.reportId, 128))
  );
}
export function reportSummary(report: SavedReport): ReportSummary {
  const { id, leagueId, kind, createdAt, title, status, deliveryState, revision, editedAt } =
    report;
  return {
    id,
    leagueId,
    kind,
    createdAt,
    title,
    status,
    ...(deliveryState ? { deliveryState } : {}),
    ...(revision === undefined ? {} : { revision }),
    ...(editedAt ? { editedAt } : {}),
  };
}
export function isReportSummary(value: unknown): value is ReportSummary {
  return (
    record(value) &&
    text(value.id, 256) &&
    text(value.leagueId, 256) &&
    [...reportKinds, 'chat-reply'].includes(String(value.kind)) &&
    date(value.createdAt) &&
    text(value.title, 500) &&
    ['draft', 'sent'].includes(String(value.status)) &&
    (value.deliveryState === undefined ||
      ['sending', 'failed', 'uncertain'].includes(String(value.deliveryState))) &&
    (value.revision === undefined || revision(value.revision)) &&
    (value.editedAt === undefined || date(value.editedAt))
  );
}
export function isDeliveryEnvelope(value: unknown): value is DeliveryEnvelope {
  return (
    record(value) &&
    Object.keys(value).every((key) =>
      [
        'channel',
        'destination',
        'sender',
        'providerIdentity',
        'credentialFingerprint',
        'subject',
        'body',
        'replyToId',
      ].includes(key),
    ) &&
    ['email', 'sms', 'imessage'].includes(String(value.channel)) &&
    text(value.destination, 500) &&
    !/[\r\n]/.test(value.destination) &&
    text(value.sender, 500, true) &&
    !/[\r\n]/.test(value.sender) &&
    text(value.subject, 500, true) &&
    !/[\r\n]/.test(value.subject) &&
    text(value.body, 100_000, true) &&
    (value.providerIdentity === undefined || text(value.providerIdentity, 500)) &&
    (value.credentialFingerprint === undefined ||
      (typeof value.credentialFingerprint === 'string' &&
        /^[a-f0-9]{64}$/.test(value.credentialFingerprint))) &&
    (value.replyToId === undefined || isEmailMessageId(value.replyToId))
  );
}
export function isSavedReport(value: unknown): value is SavedReport {
  return (
    record(value) &&
    isReportSummary(value as unknown) &&
    text(value.body, 100_000, true) &&
    Array.isArray(value.citations) &&
    value.citations.length <= 20 &&
    value.citations.every(
      (item) => record(item) && text(item.title, 500, true) && safeHttpUrl(item.url),
    ) &&
    (value.deliveryEnvelope === undefined || isDeliveryEnvelope(value.deliveryEnvelope)) &&
    (value.deliveryAttempts === undefined ||
      (Array.isArray(value.deliveryAttempts) &&
        value.deliveryAttempts.length <= 50 &&
        value.deliveryAttempts.every(
          (item) =>
            record(item) &&
            date(item.startedAt) &&
            ['email', 'sms', 'imessage'].includes(String(item.channel)) &&
            ['sending', 'sent', 'failed', 'uncertain'].includes(String(item.status)) &&
            (item.finishedAt === undefined || date(item.finishedAt)) &&
            optionalText(item.providerMessageId, 300) &&
            optionalText(item.idempotencyKey, 256),
        ))) &&
    optionalText(value.sourceMessageId, 500) &&
    optionalText(value.replyDestination, 500) &&
    (value.replyChannel === undefined ||
      ['sms', 'imessage'].includes(String(value.replyChannel))) &&
    (value.aiUsage === undefined ||
      (record(value.aiUsage) &&
        text(value.aiUsage.model, 120) &&
        ['inputTokens', 'outputTokens'].every((key) =>
          boundedNumber((value.aiUsage as Record<string, unknown>)[key], 0, 1_000_000_000, true),
        ) &&
        ['inputUsdPerMillionTokens', 'outputUsdPerMillionTokens', 'estimatedCostUsd'].every(
          (key) =>
            (value.aiUsage as Record<string, unknown>)[key] === undefined ||
            boundedNumber((value.aiUsage as Record<string, unknown>)[key], 0, 1_000_000),
        ))) &&
    (value.evidence === undefined ||
      (record(value.evidence) &&
        text(value.evidence.guidance, 6000, true) &&
        [value.evidence.leagueSyncedAt, value.evidence.newsRefreshedAt].every(
          (item) => item === undefined || date(item),
        )))
  );
}
export function isReportPage(value: unknown): value is ReportPage {
  return (
    record(value) &&
    Array.isArray(value.items) &&
    value.items.length <= 50 &&
    value.items.every(isReportSummary) &&
    revision(value.total) &&
    (value.nextCursor === undefined || text(value.nextCursor, 512))
  );
}
export function isAppSettings(value: unknown): value is AppSettings {
  if (
    !record(value) ||
    !text(value.writingStyle, 1000, true) ||
    !['short', 'standard', 'long'].includes(String(value.reportLength)) ||
    typeof value.allowProfanity !== 'boolean' ||
    !text(value.excludedTopics, 4000, true) ||
    typeof value.memoryEnabled !== 'boolean' ||
    typeof value.analyzeImportsWithAI !== 'boolean' ||
    typeof value.includeMemberContextInReports !== 'boolean' ||
    typeof value.newsRefreshMinutes !== 'number' ||
    !Number.isInteger(value.newsRefreshMinutes) ||
    value.newsRefreshMinutes < 5 ||
    value.newsRefreshMinutes > 1440 ||
    !Array.isArray(value.actions) ||
    value.actions.length > 5
  )
    return false;
  if (
    !value.actions.every(
      (action) =>
        record(action) &&
        reportKinds.includes(action.kind as ReportKind) &&
        typeof action.enabled === 'boolean' &&
        ['draft', 'automatic'].includes(String(action.mode)) &&
        ['dashboard', 'email', 'sms', 'imessage'].includes(String(action.channel)) &&
        record(action.schedule) &&
        typeof action.schedule.enabled === 'boolean' &&
        ['daily', 'weekly', 'monthly', 'once'].includes(String(action.schedule.frequency)) &&
        text(action.schedule.time, 5) &&
        /^\d{2}:\d{2}$/.test(action.schedule.time) &&
        text(action.schedule.timezone, 100) &&
        isValidTimezone(action.schedule.timezone) &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(action.schedule.time) &&
        boundedNumber(action.schedule.weekday, 0, 6, true) &&
        (action.schedule.dayOfMonth === undefined ||
          boundedNumber(action.schedule.dayOfMonth, 1, 28, true)) &&
        (action.schedule.completedAt === undefined || date(action.schedule.completedAt)) &&
        (action.leagueIds === undefined || stringList(action.leagueIds, 200, 256)),
    )
  )
    return false;
  if (
    value.aiRuntime !== undefined &&
    (!record(value.aiRuntime) ||
      !['api', 'cli', 'apple-cli'].includes(String(value.aiRuntime.mode)) ||
      !['model', 'command', 'args', 'baseUrl'].every((key) =>
        text((value.aiRuntime as Record<string, unknown>)[key], 2048, true),
      ))
  )
    return false;
  if (
    ![
      'includeMemberContextInChatReplies',
      'nflInjuryReportsEnabled',
      'imessageAutoSyncEnabled',
      'twilioConversationAutoSyncEnabled',
      'chatRepliesEnabled',
      'chatRepliesAutoSend',
      'mcpDeliveryEnabled',
    ].every((key) => value[key] === undefined || typeof value[key] === 'boolean')
  )
    return false;
  if (
    ![
      'emailRecipient',
      'smsRecipient',
      'imessageChatGuid',
      'imessageOwnerName',
      'chatAgentName',
      'chatReplyLeagueId',
    ].every((key) => optionalText(value[key], 500))
  )
    return false;
  if (
    value.newsSources !== undefined &&
    (!Array.isArray(value.newsSources) ||
      value.newsSources.length > 5 ||
      !value.newsSources.every((item) =>
        ['espn', 'pff', 'fox', 'cbs', 'pft'].includes(String(item)),
      ))
  )
    return false;
  if (
    value.customWritingStylePresets !== undefined &&
    !isValidWritingStylePresets(value.customWritingStylePresets)
  )
    return false;
  if (
    value.calendarEvents !== undefined &&
    (!Array.isArray(value.calendarEvents) ||
      value.calendarEvents.length > 200 ||
      !value.calendarEvents.every(isValidLeagueCalendarEvent))
  )
    return false;
  if (
    value.channelBoundaries !== undefined &&
    (!record(value.channelBoundaries) ||
      !Object.entries(value.channelBoundaries).every(
        ([key, boundary]) =>
          ['dashboard', 'email', 'sms', 'imessage'].includes(key) && text(boundary, 4000, true),
      ))
  )
    return false;
  if (
    value.conversationRetentionDays !== undefined &&
    ![30, 90, 365].includes(Number(value.conversationRetentionDays))
  )
    return false;
  if (
    value.scheduledSyncRetries !== undefined &&
    !boundedNumber(value.scheduledSyncRetries, 0, 3, true)
  )
    return false;
  if (
    !['imessageSyncIntervalMinutes', 'twilioConversationSyncIntervalMinutes'].every(
      (key) => value[key] === undefined || [5, 15, 30, 60].includes(Number(value[key])),
    )
  )
    return false;
  if (
    value.leagueStaleAfterHours !== undefined &&
    ![6, 12, 24, 48, 72, 168].includes(Number(value.leagueStaleAfterHours))
  )
    return false;
  return (
    value.sectionRevisions === undefined ||
    (record(value.sectionRevisions) &&
      Object.entries(value.sectionRevisions).every(
        ([key, val]) =>
          ['ai', 'voice', 'delivery', 'schedules', 'privacy', 'storage'].includes(key) &&
          revision(val),
      ))
  );
}
export function isLeagueConnection(value: unknown): value is LeagueConnection {
  const base =
    record(value) &&
    text(value.id, 256) &&
    ['sleeper', 'espn', 'yahoo'].includes(String(value.platform)) &&
    text(value.name, 500) &&
    text(value.displayName, 500) &&
    typeof value.teamCount === 'number' &&
    Number.isSafeInteger(value.teamCount) &&
    value.teamCount >= 0 &&
    record(value.scoring) &&
    Object.values(value.scoring).every(
      (item) => typeof item === 'number' && Number.isFinite(item),
    ) &&
    record(value.settings) &&
    date(value.connectedAt) &&
    (value.lastSyncedAt === undefined || date(value.lastSyncedAt)) &&
    Array.isArray(value.teams) &&
    value.teams.every(
      (team) =>
        record(team) &&
        text(team.id, 256) &&
        text(team.name, 500) &&
        optionalText(team.owner, 500) &&
        (team.rosterPlayerIds === undefined || stringList(team.rosterPlayerIds, 200, 256)) &&
        ['wins', 'losses', 'pointsFor', 'rosterSize'].every(
          (key) =>
            team[key] === undefined ||
            (typeof team[key] === 'number' && Number.isFinite(team[key])),
        ) &&
        (team.roster === undefined ||
          (Array.isArray(team.roster) &&
            team.roster.every(
              (player) =>
                record(player) &&
                text(player.id, 256) &&
                text(player.name, 500) &&
                ['position', 'rosterPosition', 'nflTeam', 'status'].every((key) =>
                  optionalText(player[key], 100),
                ),
            ))),
    );
  if (!base || !record(value)) return false;
  if (value.season !== undefined && !boundedNumber(value.season, 2000, 2099, true)) return false;
  if (
    !optionalText(value.lastSyncError, 2000) ||
    (value.status !== undefined && !['connected', 'limited'].includes(String(value.status)))
  )
    return false;
  if (value.draftScheduledAt !== undefined && !date(value.draftScheduledAt)) return false;
  if (
    value.draft !== undefined &&
    (!record(value.draft) ||
      !text(value.draft.id, 256) ||
      !optionalText(value.draft.status, 120) ||
      (value.draft.scheduledAt !== undefined && !date(value.draft.scheduledAt)) ||
      !Array.isArray(value.draft.picks) ||
      value.draft.picks.length > 2000 ||
      !value.draft.picks.every(
        (pick) =>
          record(pick) &&
          text(pick.playerId, 256) &&
          ['playerName', 'teamId', 'position', 'nflTeam'].every((key) =>
            optionalText(pick[key], 500),
          ) &&
          ['round', 'pickNumber', 'draftSlot'].every(
            (key) => pick[key] === undefined || boundedNumber(pick[key], 0, 10000, true),
          ) &&
          (pick.isKeeper === undefined || typeof pick.isKeeper === 'boolean'),
      ))
  )
    return false;
  return (
    value.matchups === undefined ||
    (Array.isArray(value.matchups) &&
      value.matchups.length <= 30 &&
      value.matchups.every(
        (matchup) =>
          record(matchup) &&
          boundedNumber(matchup.week, 1, 30, true) &&
          Array.isArray(matchup.teams) &&
          matchup.teams.length <= 200 &&
          matchup.teams.every(
            (team) =>
              record(team) &&
              text(team.teamId, 256) &&
              (team.points === undefined ||
                (typeof team.points === 'number' && Number.isFinite(team.points))) &&
              ['playerIds', 'starters'].every(
                (key) => team[key] === undefined || stringList(team[key], 200, 256),
              ),
          ),
      ))
  );
}
export function isDraftEdit(
  value: unknown,
): value is { title: string; body: string; revision: number } {
  return (
    record(value) &&
    Object.keys(value).every((key) => ['title', 'body', 'revision'].includes(key)) &&
    text(value.title, 120) &&
    value.title.trim().length > 0 &&
    !/[\u0000-\u001f\u007f]/.test(value.title) &&
    text(value.body, 100_000) &&
    value.body.trim().length > 0 &&
    revision(value.revision)
  );
}
export type ApiErrorCode =
  | 'invalid_request'
  | 'not_found'
  | 'revision_conflict'
  | 'request_conflict'
  | 'queue_full'
  | 'delivery_conflict'
  | 'provider_failure'
  | 'service_unavailable'
  | 'access_denied'
  | 'internal_error';
export interface ApiErrorResponse {
  error: string;
  code: ApiErrorCode;
}
export function isApiError(value: unknown): value is ApiErrorResponse {
  return (
    record(value) &&
    text(value.error, 2000) &&
    [
      'invalid_request',
      'not_found',
      'revision_conflict',
      'request_conflict',
      'queue_full',
      'delivery_conflict',
      'provider_failure',
      'service_unavailable',
      'access_denied',
      'internal_error',
    ].includes(String(value.code))
  );
}

export function isReportSendRequest(value: unknown): value is {
  revision?: number;
  expectedChannel?: string;
  expectedDestination?: string;
  retryUncertain?: boolean;
  replyToId?: string;
  emailSubject?: string;
} {
  return (
    record(value) &&
    Object.keys(value).every((key) =>
      [
        'revision',
        'expectedChannel',
        'expectedDestination',
        'retryUncertain',
        'replyToId',
        'emailSubject',
      ].includes(key),
    ) &&
    (value.revision === undefined || revision(value.revision)) &&
    (value.retryUncertain === undefined || typeof value.retryUncertain === 'boolean') &&
    (value.expectedChannel === undefined ||
      ['email', 'sms', 'imessage'].includes(String(value.expectedChannel))) &&
    (value.expectedDestination === undefined || text(value.expectedDestination, 500)) &&
    (value.replyToId === undefined || text(value.replyToId, 998)) &&
    (value.emailSubject === undefined || text(value.emailSubject, 200))
  );
}

export interface ScheduledRun {
  id: string;
  kind: string;
  startedAt: string;
  /** Local recurring wall-clock occurrence claimed by the scheduler, if any. */
  occurrenceKey?: string;
  finishedAt?: string;
  status: 'running' | 'succeeded' | 'failed';
  detail?: string;
  leagueResults?: ScheduledLeagueResult[];
  retryOf?: string;
  calendarEventId?: string;
  calendarEventTitle?: string;
}

export interface ScheduledLeagueResult {
  leagueId: string;
  displayName: string;
  status: 'succeeded' | 'failed' | 'skipped';
  detail?: string;
}

export function isScheduledRun(value: unknown): value is ScheduledRun {
  return (
    record(value) &&
    text(value.id, 128) &&
    text(value.kind, 120) &&
    date(value.startedAt) &&
    ['running', 'succeeded', 'failed'].includes(String(value.status)) &&
    (value.finishedAt === undefined || date(value.finishedAt)) &&
    optionalText(value.detail, 2000) &&
    optionalText(value.occurrenceKey, 500) &&
    optionalText(value.retryOf, 128) &&
    optionalText(value.calendarEventId, 128) &&
    optionalText(value.calendarEventTitle, 120) &&
    (value.leagueResults === undefined ||
      (Array.isArray(value.leagueResults) &&
        value.leagueResults.length <= 200 &&
        value.leagueResults.every(
          (item) =>
            record(item) &&
            text(item.leagueId, 256) &&
            text(item.displayName, 500) &&
            ['succeeded', 'failed', 'skipped'].includes(String(item.status)) &&
            optionalText(item.detail, 2000),
        )))
  );
}

/** Validate outbound thread headers identically at API, persistence, and browser boundaries. */
export function isEmailMessageId(value: unknown): value is string {
  if (!text(value, 998)) return false;
  const id = value.startsWith('<') && value.endsWith('>') ? value.slice(1, -1) : value;
  return id.length > 2 && !/[\x00-\x20\x7f<>]/.test(id) && id.includes('@');
}
export function isEmailSubject(value: unknown): value is string {
  return text(value, 200) && !/[\r\n\x00]/.test(value);
}
