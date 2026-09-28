import type { BlueBubblesMessage } from '@sidekick/integrations';

export const blueBubblesMemorySource = 'BlueBubbles group chat';
const maxSourceCharacters = 250_000;

interface StoredMessage {
  guid: string;
  dateCreated: number;
  text: string;
}

interface StoredHistory {
  format: 'bluebubbles-v1';
  messages: StoredMessage[];
}

export function storedBlueBubblesHistory(sourceText: string): StoredHistory {
  try {
    const value = JSON.parse(sourceText) as Partial<StoredHistory>;
    if (
      value?.format === 'bluebubbles-v1' &&
      Array.isArray(value.messages) &&
      value.messages.every(
        (message) =>
          !!message &&
          typeof message.guid === 'string' &&
          typeof message.dateCreated === 'number' &&
          typeof message.text === 'string',
      )
    ) {
      return { format: 'bluebubbles-v1', messages: value.messages };
    }
  } catch {
    // Malformed local source data is treated as empty and never fed into the model.
  }
  return { format: 'bluebubbles-v1', messages: [] };
}

export interface BlueBubblesSyncCursor {
  chatGuid: string;
  dateCreated: number;
  messageGuids: string[];
}

export function unseenBlueBubblesMessages(
  history: BlueBubblesMessage[],
  cursor: BlueBubblesSyncCursor | undefined,
): BlueBubblesMessage[] {
  return history
    .filter((message) => {
      if (message.isAutoReply || message.isSystemMessage || message.isServiceMessage) return false;
      if (!cursor || message.dateCreated > cursor.dateCreated) return true;
      return (
        message.dateCreated === cursor.dateCreated && !cursor.messageGuids.includes(message.guid)
      );
    })
    .sort((left, right) => left.dateCreated - right.dateCreated);
}

export function blueBubblesCursorAfterHistory(
  chatGuid: string,
  history: BlueBubblesMessage[],
  previous: BlueBubblesSyncCursor | undefined,
): BlueBubblesSyncCursor | undefined {
  const latestDate = history.reduce((latest, message) => Math.max(latest, message.dateCreated), 0);
  if (!latestDate) return previous;
  const latestGuids = history
    .filter((message) => message.dateCreated === latestDate)
    .map((message) => message.guid);
  return {
    chatGuid,
    dateCreated: latestDate,
    messageGuids:
      previous?.dateCreated === latestDate
        ? [...new Set([...previous.messageGuids, ...latestGuids])].slice(-200)
        : [...new Set(latestGuids)].slice(-200),
  };
}

export function mergeBlueBubblesHistory(
  sourceText: string,
  messages: BlueBubblesMessage[],
): { sourceText: string; added: number } {
  const history = storedBlueBubblesHistory(sourceText);
  const known = new Set(history.messages.map((message) => message.guid));
  const combined = [...history.messages];
  let added = 0;
  for (const message of messages) {
    if (known.has(message.guid)) continue;
    known.add(message.guid);
    combined.push({
      guid: message.guid,
      dateCreated: message.dateCreated,
      text: `${message.isFromMe ? 'Me' : (message.author ?? 'Unknown participant')}: ${message.text}`,
    });
    added += 1;
  }
  combined.sort((left, right) => left.dateCreated - right.dateCreated);

  let output = JSON.stringify({
    format: 'bluebubbles-v1',
    messages: combined,
  } satisfies StoredHistory);
  while (output.length > maxSourceCharacters && combined.length > 0) {
    combined.shift();
    output = JSON.stringify({
      format: 'bluebubbles-v1',
      messages: combined,
    } satisfies StoredHistory);
  }
  return { sourceText: output, added };
}

export function pruneBlueBubblesHistory(
  sourceText: string,
  cutoff: number,
): {
  sourceText: string;
  removed: number;
} {
  const history = storedBlueBubblesHistory(sourceText);
  const retained = history.messages.filter((message) => message.dateCreated >= cutoff);
  const removed = history.messages.length - retained.length;
  return {
    sourceText:
      retained.length > 0 ? JSON.stringify({ format: 'bluebubbles-v1', messages: retained }) : '',
    removed,
  };
}
