import type { TwilioConversationMessage } from '@sidekick/integrations';

const sourceLimit = 250_000;
export const twilioConversationMemorySource = 'Twilio Conversations group chat';

interface StoredMessage {
  sid: string;
  index: number;
  createdAt: string;
  text: string;
}

interface StoredHistory {
  format: 'twilio-conversations-v1';
  messages: StoredMessage[];
}

export interface TwilioConversationSyncCursor {
  conversationSid: string;
  page: number;
  lastIndex: number;
  initialized?: boolean;
}

export function canReplyToTwilioMentions(
  cursor: TwilioConversationSyncCursor | undefined,
): boolean {
  return cursor?.initialized === true;
}

/** Advance paging and mark the initial history baseline only after the final short page. */
export function nextTwilioConversationCursor(
  conversationSid: string,
  cursor: TwilioConversationSyncCursor | undefined,
  pageCount: number,
  lastIndex: number | undefined,
  overlapsKnownHistory = false,
): TwilioConversationSyncCursor {
  const initialized = cursor?.initialized === true || pageCount < 100;
  // Once initialized, scan forward from page zero until the old history overlaps.
  // This avoids missing new messages as earlier provider pages fill up.
  const page =
    initialized && (pageCount < 100 || overlapsKnownHistory)
      ? 0
      : (cursor?.page ?? 0) + (pageCount === 100 ? 1 : 0);
  return {
    conversationSid,
    page,
    lastIndex: lastIndex ?? cursor?.lastIndex ?? -1,
    initialized,
  };
}

export function storedTwilioConversationHistory(sourceText: string): StoredHistory {
  try {
    const value = JSON.parse(sourceText) as Partial<StoredHistory>;
    if (
      value?.format === 'twilio-conversations-v1' &&
      Array.isArray(value.messages) &&
      value.messages.every(
        (message) =>
          !!message &&
          typeof message.sid === 'string' &&
          typeof message.index === 'number' &&
          typeof message.createdAt === 'string' &&
          typeof message.text === 'string',
      )
    )
      return { format: 'twilio-conversations-v1', messages: value.messages };
  } catch {
    // Corrupt source data is excluded from AI context; fresh provider data can still be imported.
  }
  return { format: 'twilio-conversations-v1', messages: [] };
}

export function unseenTwilioConversationMessages(
  sourceText: string,
  messages: TwilioConversationMessage[],
): TwilioConversationMessage[] {
  const known = new Set(
    storedTwilioConversationHistory(sourceText).messages.map((item) => item.sid),
  );
  return messages.filter((message) => !known.has(message.sid));
}

export function messagesAfterTwilioCursor(
  messages: TwilioConversationMessage[],
  lastIndex: number,
): TwilioConversationMessage[] {
  return messages.filter((message) => message.index > lastIndex);
}

export function mergeTwilioConversationHistory(
  sourceText: string,
  messages: TwilioConversationMessage[],
): { sourceText: string; added: number } {
  const history = storedTwilioConversationHistory(sourceText);
  const known = new Set(history.messages.map((message) => message.sid));
  const combined = [...history.messages];
  let added = 0;
  for (const message of messages) {
    if (known.has(message.sid)) continue;
    known.add(message.sid);
    combined.push({
      sid: message.sid,
      index: message.index,
      createdAt: message.createdAt,
      text: `${message.createdAt} ${message.body}`,
    });
    added += 1;
  }
  combined.sort((left, right) => left.index - right.index || left.sid.localeCompare(right.sid));
  let output = JSON.stringify({
    format: 'twilio-conversations-v1',
    messages: combined,
  } satisfies StoredHistory);
  while (output.length > sourceLimit && combined.length > 0) {
    combined.shift();
    output = JSON.stringify({
      format: 'twilio-conversations-v1',
      messages: combined,
    } satisfies StoredHistory);
  }
  return { sourceText: output, added };
}

export function pruneTwilioConversationHistory(
  sourceText: string,
  cutoff: number,
): { sourceText: string; removed: number } {
  const history = storedTwilioConversationHistory(sourceText);
  const retained = history.messages.filter((message) => {
    const createdAt = Date.parse(message.createdAt);
    return !Number.isFinite(createdAt) || createdAt >= cutoff;
  });
  const removed = history.messages.length - retained.length;
  return {
    sourceText:
      retained.length > 0
        ? JSON.stringify({ format: 'twilio-conversations-v1', messages: retained })
        : '',
    removed,
  };
}
