import type { DeliveryEnvelope } from './workflow-contracts.js';
import type { leagueStaleAfterHoursOptions } from './league-status.js';

export type Platform = 'sleeper' | 'espn' | 'yahoo';

export type NewsSourceId = 'espn' | 'pff' | 'fox' | 'cbs' | 'pft';

export type ReportKind =
  'offseason-update' | 'draft-hype' | 'draft-review' | 'power-rankings' | 'matchup-preview';

export type ReportLength = 'short' | 'standard' | 'long';

export interface WritingStylePreset {
  name: string;
  value: string;
}

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

export type LeagueStaleAfterHours = (typeof leagueStaleAfterHoursOptions)[number];

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
  /** Optimistic editing token; omitted legacy drafts start at zero. */
  revision?: number;
  editedAt?: string;
  /** Evidence timestamps captured at generation, not the currently connected snapshot. */
  evidence?: { leagueSyncedAt?: string; newsRefreshedAt?: string; guidance: string };
  status: 'draft' | 'sent';
  deliveryState?: 'sending' | 'failed' | 'uncertain';
  deliveryUpdatedAt?: string;
  deliveryAttempts?: DeliveryAttempt[];
  deliveryEnvelope?: DeliveryEnvelope;
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
  sectionRevisions?: Partial<Record<import('./settings-sections.js').SettingsSection, number>>;
  writingStyle: string;
  /** Locally stored owner-named voices that can be applied to the active writing style. */
  customWritingStylePresets?: WritingStylePreset[];
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
