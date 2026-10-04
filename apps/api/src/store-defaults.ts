import {
  defaultActionSettings,
  defaultLeagueStaleAfterHours,
  defaultNewsSources,
} from '@sidekick/core';
import type { AppState } from './store-types.js';
export const initialState: AppState = {
  settings: {
    actions: structuredClone(defaultActionSettings),
    calendarEvents: [],
    writingStyle: 'Funny, sharp league banter',
    customWritingStylePresets: [],
    reportLength: 'standard',
    leagueStaleAfterHours: defaultLeagueStaleAfterHours,
    allowProfanity: false,
    excludedTopics: '',
    channelBoundaries: {},
    memoryEnabled: true,
    analyzeImportsWithAI: false,
    includeMemberContextInReports: false,
    includeMemberContextInChatReplies: false,
    newsRefreshMinutes: 15,
    newsSources: [...defaultNewsSources],
    nflInjuryReportsEnabled: false,
    scheduledSyncRetries: 0,
    imessageOwnerName: 'League owner',
    imessageAutoSyncEnabled: false,
    imessageSyncIntervalMinutes: 15,
    twilioConversationAutoSyncEnabled: false,
    twilioConversationSyncIntervalMinutes: 15,
    chatRepliesEnabled: false,
    chatRepliesAutoSend: false,
    chatAgentName: 'Sunday Sidekick',
    mcpDeliveryEnabled: false,
    aiRuntime: {
      mode: 'api',
      model: 'gpt-4o-mini',
      command: '',
      args: '',
      baseUrl: 'https://api.openai.com/v1',
      temperature: 0.8,
      maxOutputTokens: 1200,
    },
  },
  leagues: [],
  reports: [],
  memories: [],
  playerProjections: [],
  scheduledRuns: [],
};

/**
 * Conversation source text is immutable string data. Share those string values across state
 * snapshots while cloning the profile objects that callers may mutate.
 */
