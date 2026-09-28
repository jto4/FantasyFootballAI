import {
  defaultActionSettings,
  defaultNewsSources,
  type AppSettings,
  type LeagueConnection,
  type NewsItem,
  type SavedReport,
} from '@sidekick/core';
import type { ScheduledRun } from './SchedulePage.js';

export type AppState = {
  leagues: LeagueConnection[];
  reports: SavedReport[];
  settings: AppSettings;
  scheduledRuns: ScheduledRun[];
};

export type CredentialProvider = { provider: string; configured: boolean };

export type NewsSnapshot = {
  items: NewsItem[];
  refreshedAt?: string;
  stale: boolean;
  error?: string;
};

export const initialAppState: AppState = {
  leagues: [],
  reports: [],
  settings: {
    writingStyle: 'Funny, sharp league banter',
    reportLength: 'standard',
    allowProfanity: false,
    excludedTopics: '',
    memoryEnabled: true,
    actions: structuredClone(defaultActionSettings),
    analyzeImportsWithAI: false,
    includeMemberContextInReports: false,
    includeMemberContextInChatReplies: false,
    newsRefreshMinutes: 15,
    newsSources: [...defaultNewsSources],
    nflInjuryReportsEnabled: false,
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
    },
  },
  scheduledRuns: [],
};

/** Validate the minimum state contract before rendering data-dependent pages. */
export function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  const settings = snapshot.settings as Record<string, unknown> | null;
  return (
    Array.isArray(snapshot.leagues) &&
    Array.isArray(snapshot.reports) &&
    Array.isArray(snapshot.scheduledRuns) &&
    settings !== null &&
    typeof settings === 'object' &&
    Array.isArray(settings.actions)
  );
}

export function isNewsSnapshot(value: unknown): value is NewsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  return (
    Array.isArray(snapshot.items) &&
    snapshot.items.every(isNewsItem) &&
    typeof snapshot.stale === 'boolean' &&
    (snapshot.refreshedAt === undefined || typeof snapshot.refreshedAt === 'string') &&
    (snapshot.error === undefined || typeof snapshot.error === 'string')
  );
}

function isNewsItem(value: unknown): value is NewsItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (
    typeof item.title !== 'string' ||
    item.title.length === 0 ||
    item.title.length > 500 ||
    typeof item.source !== 'string' ||
    item.source.length === 0 ||
    item.source.length > 120 ||
    typeof item.url !== 'string' ||
    item.url.length > 2_048 ||
    typeof item.publishedAt !== 'string' ||
    !Number.isFinite(Date.parse(item.publishedAt)) ||
    (item.summary !== undefined &&
      (typeof item.summary !== 'string' || item.summary.length > 4_000))
  )
    return false;
  try {
    const url = new URL(item.url);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isCredentialProviders(value: unknown): value is CredentialProvider[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as CredentialProvider).provider === 'string' &&
        typeof (item as CredentialProvider).configured === 'boolean',
    )
  );
}
