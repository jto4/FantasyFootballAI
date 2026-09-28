import type { LocalStore } from './store.js';
import {
  isLeagueStaleAfterHours,
  isValidChannelBoundaries,
  isValidLeagueCalendarEvent,
  isValidNewsSources,
  isValidWritingStylePresets,
  type LeagueCalendarEvent,
} from '@sidekick/core';
import { isValidReportSchedule } from './scheduler.js';

type Settings = ReturnType<LocalStore['snapshot']>['settings'];

/** Validate persisted AI runtime settings before they can select a process or endpoint. */
export function isValidRuntime(value: unknown): value is NonNullable<Settings['aiRuntime']> {
  if (!value || typeof value !== 'object') return false;
  const runtime = value as Record<string, unknown>;
  return (
    (runtime.mode === 'api' || runtime.mode === 'cli' || runtime.mode === 'apple-cli') &&
    typeof runtime.model === 'string' &&
    runtime.model.length <= 120 &&
    typeof runtime.command === 'string' &&
    runtime.command.length <= 300 &&
    typeof runtime.args === 'string' &&
    runtime.args.length <= 1000 &&
    typeof runtime.baseUrl === 'string' &&
    /^https:\/\//.test(runtime.baseUrl) &&
    (runtime.temperature === undefined ||
      (typeof runtime.temperature === 'number' &&
        Number.isFinite(runtime.temperature) &&
        runtime.temperature >= 0 &&
        runtime.temperature <= 2)) &&
    (runtime.maxOutputTokens === undefined ||
      (typeof runtime.maxOutputTokens === 'number' &&
        Number.isInteger(runtime.maxOutputTokens) &&
        runtime.maxOutputTokens >= 128 &&
        runtime.maxOutputTokens <= 16_384)) &&
    (runtime.inputUsdPerMillionTokens === undefined ||
      (typeof runtime.inputUsdPerMillionTokens === 'number' &&
        Number.isFinite(runtime.inputUsdPerMillionTokens) &&
        runtime.inputUsdPerMillionTokens >= 0 &&
        runtime.inputUsdPerMillionTokens <= 1_000)) &&
    (runtime.outputUsdPerMillionTokens === undefined ||
      (typeof runtime.outputUsdPerMillionTokens === 'number' &&
        Number.isFinite(runtime.outputUsdPerMillionTokens) &&
        runtime.outputUsdPerMillionTokens >= 0 &&
        runtime.outputUsdPerMillionTokens <= 1_000))
  );
}

/** Validate each scheduled action as an independent untrusted settings value. */
export function isValidAction(value: unknown): value is NonNullable<Settings['actions']>[number] {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  return (
    [
      'offseason-update',
      'draft-hype',
      'draft-review',
      'power-rankings',
      'matchup-preview',
    ].includes(String(action.kind)) &&
    ['dashboard', 'email', 'sms', 'imessage'].includes(String(action.channel)) &&
    typeof action.enabled === 'boolean' &&
    ['draft', 'automatic'].includes(String(action.mode)) &&
    (action.leagueIds === undefined ||
      (Array.isArray(action.leagueIds) &&
        action.leagueIds.length <= 100 &&
        new Set(action.leagueIds).size === action.leagueIds.length &&
        action.leagueIds.every(
          (leagueId) =>
            typeof leagueId === 'string' && leagueId.length > 0 && leagueId.length <= 200,
        ))) &&
    isValidReportSchedule(action.schedule)
  );
}

/** Validate an untrusted dashboard settings update against the current league set. */
export function isValidSettingsUpdate(value: unknown, leagueIds: ReadonlySet<string>): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  const {
    writingStyle,
    customWritingStylePresets,
    reportLength,
    allowProfanity,
    excludedTopics,
    channelBoundaries,
    actions,
    calendarEvents,
    aiRuntime,
    emailRecipient,
    smsRecipient,
    imessageChatGuid,
    imessageOwnerName,
    imessageAutoSyncEnabled,
    imessageSyncIntervalMinutes,
    twilioConversationAutoSyncEnabled,
    twilioConversationSyncIntervalMinutes,
    chatRepliesEnabled,
    chatRepliesAutoSend,
    chatAgentName,
    chatReplyLeagueId,
    mcpDeliveryEnabled,
    memoryEnabled,
    analyzeImportsWithAI,
    includeMemberContextInReports,
    includeMemberContextInChatReplies,
    nflInjuryReportsEnabled,
    conversationRetentionDays,
    newsRefreshMinutes,
    leagueStaleAfterHours,
    newsSources,
  } = settings;
  const optionalAddress = (item: unknown) =>
    item === undefined ||
    item === '' ||
    (typeof item === 'string' && item.length < 320 && !/[\r\n]/.test(item));
  const optionalChatGuid = (item: unknown) =>
    item === undefined ||
    item === '' ||
    (typeof item === 'string' &&
      item.length <= 500 &&
      Boolean(item.trim()) &&
      !/[\r\n]/.test(item));
  const validEvents = (items: unknown): items is LeagueCalendarEvent[] =>
    items === undefined ||
    (Array.isArray(items) &&
      items.length <= 500 &&
      items.every(isValidLeagueCalendarEvent) &&
      new Set(items.map((event) => event.id)).size === items.length &&
      items.every((event) => leagueIds.has(event.leagueId)));

  return (
    typeof writingStyle === 'string' &&
    writingStyle.length <= 1000 &&
    (customWritingStylePresets === undefined ||
      isValidWritingStylePresets(customWritingStylePresets)) &&
    (reportLength === undefined || ['short', 'standard', 'long'].includes(String(reportLength))) &&
    (allowProfanity === undefined || typeof allowProfanity === 'boolean') &&
    (excludedTopics === undefined ||
      (typeof excludedTopics === 'string' && excludedTopics.length <= 2000)) &&
    (channelBoundaries === undefined || isValidChannelBoundaries(channelBoundaries)) &&
    Array.isArray(actions) &&
    actions.every(isValidAction) &&
    validEvents(calendarEvents) &&
    isValidRuntime(aiRuntime) &&
    optionalAddress(emailRecipient) &&
    optionalAddress(smsRecipient) &&
    optionalChatGuid(imessageChatGuid) &&
    (imessageOwnerName === undefined ||
      (typeof imessageOwnerName === 'string' &&
        Boolean(imessageOwnerName.trim()) &&
        imessageOwnerName.length <= 100)) &&
    (imessageAutoSyncEnabled === undefined || typeof imessageAutoSyncEnabled === 'boolean') &&
    (imessageSyncIntervalMinutes === undefined ||
      [5, 15, 30, 60].some((minutes) => minutes === imessageSyncIntervalMinutes)) &&
    (twilioConversationAutoSyncEnabled === undefined ||
      typeof twilioConversationAutoSyncEnabled === 'boolean') &&
    (twilioConversationSyncIntervalMinutes === undefined ||
      [5, 15, 30, 60].some((minutes) => minutes === twilioConversationSyncIntervalMinutes)) &&
    (chatRepliesEnabled === undefined || typeof chatRepliesEnabled === 'boolean') &&
    (chatRepliesAutoSend === undefined || typeof chatRepliesAutoSend === 'boolean') &&
    (chatAgentName === undefined ||
      (typeof chatAgentName === 'string' &&
        Boolean(chatAgentName.trim()) &&
        chatAgentName.length <= 60 &&
        !/[\r\n\u0000-\u001f\u007f]/.test(chatAgentName))) &&
    (chatReplyLeagueId === undefined ||
      (typeof chatReplyLeagueId === 'string' &&
        (chatReplyLeagueId === '' || leagueIds.has(chatReplyLeagueId)))) &&
    (mcpDeliveryEnabled === undefined || typeof mcpDeliveryEnabled === 'boolean') &&
    (memoryEnabled === undefined || typeof memoryEnabled === 'boolean') &&
    (analyzeImportsWithAI === undefined || typeof analyzeImportsWithAI === 'boolean') &&
    (includeMemberContextInReports === undefined ||
      typeof includeMemberContextInReports === 'boolean') &&
    (includeMemberContextInChatReplies === undefined ||
      typeof includeMemberContextInChatReplies === 'boolean') &&
    (nflInjuryReportsEnabled === undefined || typeof nflInjuryReportsEnabled === 'boolean') &&
    (conversationRetentionDays === undefined ||
      conversationRetentionDays === 30 ||
      conversationRetentionDays === 90 ||
      conversationRetentionDays === 365) &&
    (newsSources === undefined || isValidNewsSources(newsSources)) &&
    typeof newsRefreshMinutes === 'number' &&
    Number.isInteger(newsRefreshMinutes) &&
    newsRefreshMinutes >= 5 &&
    newsRefreshMinutes <= 1440 &&
    (leagueStaleAfterHours === undefined || isLeagueStaleAfterHours(leagueStaleAfterHours))
  );
}
