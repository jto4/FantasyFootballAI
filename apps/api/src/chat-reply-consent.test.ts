import { describe, expect, it } from 'vitest';
import { defaultActionSettings, type AppSettings, type LeagueConnection } from '@sidekick/core';
import { assertChatReplyConsent, type ChatReplyConsentState } from './chat-reply-consent.js';
import { memberContextForChatReply } from './privacy.js';

const league: LeagueConnection = {
  id: 'league-1',
  platform: 'sleeper',
  name: 'league',
  displayName: 'Sunday League',
  teamCount: 2,
  scoring: { pass_td: 4 },
  settings: {},
  teams: [],
  connectedAt: '2026-09-01T00:00:00Z',
};

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    actions: structuredClone(defaultActionSettings),
    writingStyle: 'Dry and funny',
    reportLength: 'short',
    allowProfanity: true,
    excludedTopics: '',
    memoryEnabled: true,
    analyzeImportsWithAI: false,
    includeMemberContextInReports: false,
    includeMemberContextInChatReplies: false,
    chatRepliesEnabled: true,
    chatAgentName: 'Sunday Sidekick',
    chatReplyLeagueId: league.id,
    imessageChatGuid: 'chat-guid',
    imessageSyncIntervalMinutes: 15,
    smsRecipient: `CH${'a'.repeat(32)}`,
    imessageAutoSyncEnabled: true,
    twilioConversationAutoSyncEnabled: true,
    ...overrides,
  };
}

function state(settingsOverrides: Partial<AppSettings> = {}): ChatReplyConsentState {
  return { settings: settings(settingsOverrides), leagues: [league], memories: [] };
}

function check(overrides: Partial<Parameters<typeof assertChatReplyConsent>[0]> = {}) {
  const currentState = state();
  const memberContext = memberContextForChatReply(
    currentState.settings,
    currentState.memories,
    league.id,
  );
  return assertChatReplyConsent({
    currentState,
    expectedLeagueId: league.id,
    memberContext,
    channel: 'imessage',
    target: 'chat-guid',
    isBackgroundPoll: false,
    ...overrides,
  });
}

describe('chat reply consent guard', () => {
  it('allows generation when current settings still match the context', () => {
    expect(() => check()).not.toThrow();
  });

  it('blocks if chat replies were disabled during provider initialization', () => {
    expect(() => check({ currentState: state({ chatRepliesEnabled: false }) })).toThrow(
      'Group chat replies were disabled',
    );
  });

  it('blocks a changed destination or background polling setting', () => {
    expect(() => check({ currentState: state({ imessageChatGuid: 'different-chat' }) })).toThrow(
      'group changed',
    );
    expect(() =>
      check({
        currentState: state({ imessageAutoSyncEnabled: false }),
        isBackgroundPoll: true,
      }),
    ).toThrow('sync was disabled');
  });

  it('blocks a changed selected league or member-context consent', () => {
    expect(() => check({ currentState: state({ chatReplyLeagueId: 'other-league' }) })).toThrow(
      'selected chat reply league changed',
    );
    expect(() =>
      check({
        currentState: state({ includeMemberContextInChatReplies: true }),
      }),
    ).toThrow('memory sharing changed');
  });
});
