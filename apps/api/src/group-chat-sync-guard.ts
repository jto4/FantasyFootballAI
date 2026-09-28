import type { AppSettings } from '@sidekick/core';

export type GroupChatSyncChannel = 'imessage' | 'sms';

/** Recheck owner consent and the selected destination after every awaited provider step. */
export function groupChatSyncBlockReason(
  settings: AppSettings,
  channel: GroupChatSyncChannel,
  target: string,
  isBackgroundPoll: boolean,
): string | undefined {
  if (!settings.memoryEnabled) return 'Member memory was disabled while retrieving chat history.';

  const currentTarget =
    channel === 'imessage' ? settings.imessageChatGuid?.trim() : settings.smsRecipient?.trim();
  if (currentTarget !== target)
    return `The ${channel === 'imessage' ? 'iMessage group' : 'Twilio conversation target'} changed during sync. Try again.`;

  if (isBackgroundPoll) {
    const pollingEnabled =
      channel === 'imessage'
        ? settings.imessageAutoSyncEnabled
        : settings.twilioConversationAutoSyncEnabled;
    if (!pollingEnabled)
      return `Automatic ${channel === 'imessage' ? 'iMessage' : 'Twilio Conversations'} sync was disabled while syncing.`;
  }

  return undefined;
}
