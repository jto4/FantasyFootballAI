import Database from 'better-sqlite3';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChatMessage } from './chat-service.js';

export interface ChatConversation {
  id: string;
  title: string;
  leagueId?: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}
export type ChatConversationSummary = Omit<ChatConversation, 'messages'> & { messageCount: number };

const maxConversations = 50;
const maxMessages = 80;

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    (m.role === 'user' || m.role === 'assistant') &&
    typeof m.text === 'string' &&
    typeof m.at === 'string' &&
    (m.lookups === undefined || Array.isArray(m.lookups))
  );
}
function isConversation(value: unknown): value is ChatConversation {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.createdAt === 'string' &&
    typeof c.updatedAt === 'string' &&
    (c.leagueId === undefined || typeof c.leagueId === 'string') &&
    Array.isArray(c.messages) &&
    c.messages.every(isMessage)
  );
}

/**
 * Chat history, kept apart from app state so it never enters reports, exports or backups of the
 * main store. Only the newest conversations and messages are kept.
 */
export class ChatStore {
  private db: Database.Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, payload TEXT NOT NULL) STRICT',
    );
    if (path !== ':memory:') chmodSync(path, 0o600);
  }
  list(): ChatConversationSummary[] {
    return (
      this.db
        .prepare('SELECT payload FROM conversations ORDER BY updated_at DESC LIMIT ?')
        .all(maxConversations) as { payload: string }[]
    ).flatMap((row) => {
      const value: unknown = JSON.parse(row.payload);
      if (!isConversation(value)) return [];
      const { messages, ...summary } = value;
      return [{ ...summary, messageCount: messages.length }];
    });
  }
  get(id: string): ChatConversation | undefined {
    const row = this.db.prepare('SELECT payload FROM conversations WHERE id = ?').get(id) as
      { payload: string } | undefined;
    if (!row) return undefined;
    const value: unknown = JSON.parse(row.payload);
    return isConversation(value) ? value : undefined;
  }
  save(conversation: ChatConversation) {
    const next = { ...conversation, messages: conversation.messages.slice(-maxMessages) };
    if (!isConversation(next)) throw new Error('Invalid chat conversation.');
    this.db
      .prepare(
        'INSERT INTO conversations (id, updated_at, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload',
      )
      .run(next.id, next.updatedAt, JSON.stringify(next));
    this.db
      .prepare(
        'DELETE FROM conversations WHERE id NOT IN (SELECT id FROM conversations ORDER BY updated_at DESC LIMIT ?)',
      )
      .run(maxConversations);
    return next;
  }
  delete(id: string) {
    return this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id).changes > 0;
  }
  clear() {
    this.db.prepare('DELETE FROM conversations').run();
  }
  close() {
    this.db.close();
  }
}
