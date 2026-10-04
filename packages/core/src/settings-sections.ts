import type { AppSettings } from './index.js';
/** Each settings save may change only one owner's task, including optional-field removal. */
export const settingsSectionFields = {
  ai: ['aiRuntime'],
  voice: [
    'writingStyle',
    'customWritingStylePresets',
    'reportLength',
    'allowProfanity',
    'excludedTopics',
    'channelBoundaries',
  ],
  delivery: [
    'emailRecipient',
    'smsRecipient',
    'imessageChatGuid',
    'imessageOwnerName',
    'imessageAutoSyncEnabled',
    'imessageSyncIntervalMinutes',
    'twilioConversationAutoSyncEnabled',
    'twilioConversationSyncIntervalMinutes',
    'chatRepliesEnabled',
    'chatRepliesAutoSend',
    'chatAgentName',
    'chatReplyLeagueId',
  ],
  schedules: [
    'actions',
    'calendarEvents',
    'mcpDeliveryEnabled',
    'leagueStaleAfterHours',
    'scheduledSyncRetries',
    'newsRefreshMinutes',
    'newsSources',
    'nflInjuryReportsEnabled',
  ],
  privacy: [
    'memoryEnabled',
    'analyzeImportsWithAI',
    'includeMemberContextInReports',
    'includeMemberContextInChatReplies',
    'conversationRetentionDays',
  ],
  storage: [],
} as const satisfies Record<string, readonly (keyof AppSettings)[]>;
export type SettingsSection = keyof typeof settingsSectionFields;
export function isSettingsSection(value: string): value is SettingsSection {
  return Object.hasOwn(settingsSectionFields, value);
}
export function settingsSectionPatch(
  settings: AppSettings,
  section: SettingsSection,
): Record<string, unknown> {
  return Object.fromEntries(
    settingsSectionFields[section].map((key) => [key, settings[key] ?? null]),
  );
}
