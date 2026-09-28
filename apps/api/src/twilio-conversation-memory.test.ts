import { describe, expect, it } from 'vitest';
import type { TwilioConversationMessage } from '@sidekick/integrations';
import {
  canReplyToTwilioMentions,
  messagesAfterTwilioCursor,
  mergeTwilioConversationHistory,
  nextTwilioConversationCursor,
  pruneTwilioConversationHistory,
  unseenTwilioConversationMessages,
} from './twilio-conversation-memory.js';

const message = (sid: string, index: number, createdAt: string): TwilioConversationMessage => ({
  sid,
  index,
  author: '+15555550111',
  body: `Message ${index}`,
  createdAt,
});

describe('Twilio conversation memory', () => {
  it('establishes a no-reply backfill baseline before treating messages as new', () => {
    const firstFullPage = nextTwilioConversationCursor('CH' + 'a'.repeat(32), undefined, 100, 99);
    expect(firstFullPage).toMatchObject({ page: 1, lastIndex: 99, initialized: false });
    expect(canReplyToTwilioMentions(firstFullPage)).toBe(false);

    const lastBackfillPage = nextTwilioConversationCursor(
      firstFullPage.conversationSid,
      firstFullPage,
      24,
      123,
    );
    expect(lastBackfillPage).toMatchObject({ page: 0, lastIndex: 123, initialized: true });
    expect(canReplyToTwilioMentions(lastBackfillPage)).toBe(true);
  });

  it('scans new pages until the prior latest message overlaps, then resets for polling', () => {
    const cursor = {
      conversationSid: 'CH' + 'a'.repeat(32),
      page: 0,
      lastIndex: 99,
      initialized: true,
    };
    const fullPage = nextTwilioConversationCursor(cursor.conversationSid, cursor, 100, 199, false);
    expect(fullPage).toMatchObject({ page: 1, lastIndex: 199, initialized: true });

    const overlapPage = nextTwilioConversationCursor(
      cursor.conversationSid,
      fullPage,
      100,
      299,
      true,
    );
    expect(overlapPage).toMatchObject({ page: 0, lastIndex: 299, initialized: true });
  });

  it('deduplicates message SIDs while preserving chronological order', () => {
    const first = message(`IM${'a'.repeat(32)}`, 1, '2026-09-27T10:00:00.000Z');
    const second = message(`IM${'b'.repeat(32)}`, 2, '2026-09-27T10:01:00.000Z');
    const merged = mergeTwilioConversationHistory('', [second, first, second]);

    expect(merged.added).toBe(2);
    expect(unseenTwilioConversationMessages(merged.sourceText, [first, second])).toEqual([]);
    expect(mergeTwilioConversationHistory(merged.sourceText, [second]).added).toBe(0);
    expect(
      JSON.parse(merged.sourceText).messages.map((item: { index: number }) => item.index),
    ).toEqual([1, 2]);
    expect(messagesAfterTwilioCursor([first, second], 1)).toEqual([second]);
  });

  it('purges original message text by each message timestamp', () => {
    const oldMessage = message(`IM${'a'.repeat(32)}`, 1, '2025-01-01T00:00:00.000Z');
    const recentMessage = message(`IM${'b'.repeat(32)}`, 2, '2026-09-27T10:00:00.000Z');
    const merged = mergeTwilioConversationHistory('', [oldMessage, recentMessage]);
    const pruned = pruneTwilioConversationHistory(
      merged.sourceText,
      Date.parse('2026-01-01T00:00:00Z'),
    );

    expect(pruned.removed).toBe(1);
    expect(JSON.parse(pruned.sourceText).messages.map((item: { sid: string }) => item.sid)).toEqual(
      [recentMessage.sid],
    );
  });
});
