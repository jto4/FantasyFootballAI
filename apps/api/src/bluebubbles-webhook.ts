/** BlueBubbles webhook payloads are treated as untrusted hints to fetch current chat history. */
export function isRelevantBlueBubblesMessageEvent(input: unknown, chatGuid: string): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const event = input as Record<string, unknown>;
  if (event.type !== 'new-message' || !event.data || typeof event.data !== 'object') return false;

  const data = event.data as Record<string, unknown>;
  if (data.isFromMe !== true && data.isFromMe !== false) return false;
  if (typeof data.guid !== 'string' || !data.guid.trim() || data.guid.length > 300) return false;
  if (!Array.isArray(data.chats) || data.chats.length > 20) return false;
  return data.chats.some((chat) => {
    if (!chat || typeof chat !== 'object' || Array.isArray(chat)) return false;
    const guid = (chat as Record<string, unknown>).guid;
    return typeof guid === 'string' && guid === chatGuid;
  });
}

export function sameWebhookToken(candidate: string, expected: string): boolean {
  // Keep token comparison constant-time for equal-length values and reject malformed lengths.
  if (candidate.length !== expected.length || !/^[A-Za-z0-9_-]{40,100}$/.test(candidate))
    return false;
  let difference = 0;
  for (let index = 0; index < candidate.length; index += 1)
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}
