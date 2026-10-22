import { record } from '@sidekick/core';
import { requestJson, requestResponse } from './api-client';

export type ChatLookup = { tool: string; label: string; ok: boolean };
export type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  at: string;
  lookups?: ChatLookup[];
};
export type ChatConversation = {
  id: string;
  title: string;
  leagueId?: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};
export type ChatSummary = Omit<ChatConversation, 'messages'> & { messageCount: number };

const isMessage = (x: unknown): x is ChatMessage =>
  record(x) &&
  (x.role === 'user' || x.role === 'assistant') &&
  typeof x.text === 'string' &&
  typeof x.at === 'string' &&
  (x.lookups === undefined ||
    (Array.isArray(x.lookups) &&
      x.lookups.every(
        (l) => record(l) && typeof l.label === 'string' && typeof l.ok === 'boolean',
      )));
export const isConversation = (x: unknown): x is ChatConversation =>
  record(x) &&
  typeof x.id === 'string' &&
  typeof x.title === 'string' &&
  typeof x.updatedAt === 'string' &&
  Array.isArray(x.messages) &&
  x.messages.every(isMessage);
const isSummaryList = (x: unknown): x is { items: ChatSummary[] } =>
  record(x) &&
  Array.isArray(x.items) &&
  x.items.every(
    (i) =>
      record(i) &&
      typeof i.id === 'string' &&
      typeof i.title === 'string' &&
      typeof i.updatedAt === 'string',
  );

export const listChats = (signal?: AbortSignal) =>
  requestJson('/api/chat/conversations', isSummaryList, signal ? { signal } : undefined).then(
    (value) => value.items,
  );
export const loadChat = (id: string) =>
  requestJson(`/api/chat/conversations/${encodeURIComponent(id)}`, isConversation);
export const deleteChat = (id: string) =>
  requestResponse(`/api/chat/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });

/**
 * Sends one question and reads the newline-delimited progress stream. Several Codex rounds can
 * take minutes, so the timeout is long; the caller's signal still cancels at any time.
 */
export async function sendChat(
  body: {
    conversationId?: string;
    message: string;
    leagueId?: string;
    teamId?: string;
    page?: string;
  },
  onStep: (label: string) => void,
  signal: AbortSignal,
): Promise<ChatConversation> {
  const response = await requestResponse(
    '/api/chat',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    },
    600_000,
  );
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The chat answer could not be read.');
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event: unknown = JSON.parse(line);
      if (!record(event)) continue;
      if (event.type === 'step' && typeof event.label === 'string') onStep(event.label);
      if (event.type === 'error')
        throw new Error(typeof event.error === 'string' ? event.error : 'The AI didn’t answer.');
      if (event.type === 'done' && isConversation(event.conversation)) return event.conversation;
    }
    if (done) throw new Error('The chat answer ended early. Try again.');
  }
}
