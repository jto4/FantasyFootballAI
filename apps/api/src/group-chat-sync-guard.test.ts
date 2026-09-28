import { describe, expect, it } from 'vitest';
import type { AppSettings } from '@sidekick/core';
import { groupChatSyncBlockReason } from './group-chat-sync-guard.js';

function settings(overrides: Partial<AppSettings>): AppSettings {
  return {
    ...overrides,
    memoryEnabled: overrides.memoryEnabled ?? true,
  } as AppSettings;
}

describe('group-chat sync consent guard', () => {
  it('allows manual sync for the saved target while member memory is enabled', () => {
    expect(
      groupChatSyncBlockReason(
        settings({ imessageChatGuid: 'chat-guid' }),
        'imessage',
        'chat-guid',
        false,
      ),
    ).toBeUndefined();
  });

  it('blocks a provider response when memory was disabled during the request', () => {
    expect(
      groupChatSyncBlockReason(
        settings({ memoryEnabled: false, smsRecipient: 'CH123' }),
        'sms',
        'CH123',
        false,
      ),
    ).toContain('Member memory was disabled');
  });

  it('blocks stale chat targets and background polls that were disabled in flight', () => {
    expect(
      groupChatSyncBlockReason(
        settings({ imessageChatGuid: 'new-chat' }),
        'imessage',
        'old-chat',
        false,
      ),
    ).toContain('group changed');
    expect(
      groupChatSyncBlockReason(
        settings({ smsRecipient: 'CH123', twilioConversationAutoSyncEnabled: false }),
        'sms',
        'CH123',
        true,
      ),
    ).toContain('sync was disabled');
  });
});
