import { describe, expect, it } from 'vitest';
import type { BlueBubblesMessage } from '@sidekick/integrations';
import {
  blueBubblesCursorAfterHistory,
  mergeBlueBubblesHistory,
  pruneBlueBubblesHistory,
  storedBlueBubblesHistory,
  unseenBlueBubblesMessages,
} from './bluebubbles-memory.js';

const messages: BlueBubblesMessage[] = [
  {
    guid: 'one',
    text: 'Starting my rookie over the first rounder.',
    dateCreated: 1_000,
    isFromMe: false,
    author: '+15555550123',
    isAutoReply: false,
    isSystemMessage: false,
    isServiceMessage: false,
  },
  {
    guid: 'two',
    text: 'Bold Tuesday move.',
    dateCreated: 2_000,
    isFromMe: true,
    isAutoReply: false,
    isSystemMessage: false,
    isServiceMessage: false,
  },
];

describe('BlueBubbles memory history', () => {
  it('merges by stable message GUID and keeps only a bounded source transcript', () => {
    const first = mergeBlueBubblesHistory('', messages);
    const repeated = mergeBlueBubblesHistory(first.sourceText, messages);
    expect(first.added).toBe(2);
    expect(repeated.added).toBe(0);
    expect(storedBlueBubblesHistory(repeated.sourceText).messages).toEqual([
      {
        guid: 'one',
        dateCreated: 1_000,
        text: '+15555550123: Starting my rookie over the first rounder.',
      },
      { guid: 'two', dateCreated: 2_000, text: 'Me: Bold Tuesday move.' },
    ]);
    expect(repeated.sourceText.length).toBeLessThanOrEqual(250_000);
  });

  it('purges expired live messages individually while retaining recent source text', () => {
    const source = mergeBlueBubblesHistory('', messages).sourceText;
    const pruned = pruneBlueBubblesHistory(source, 1_500);
    expect(pruned.removed).toBe(1);
    expect(storedBlueBubblesHistory(pruned.sourceText).messages.map(({ guid }) => guid)).toEqual([
      'two',
    ]);
    expect(pruneBlueBubblesHistory(pruned.sourceText, 3_000).sourceText).toBe('');
  });

  it('skips repeated message IDs and advances a timestamp cursor without losing ties', () => {
    const cursor = { chatGuid: 'chat', dateCreated: 2_000, messageGuids: ['two'] };
    const sameTimeMessage = { ...messages[1]!, guid: 'same-time-third' };
    expect(
      unseenBlueBubblesMessages([...messages, sameTimeMessage], cursor).map(({ guid }) => guid),
    ).toEqual(['same-time-third']);
    const next = blueBubblesCursorAfterHistory('chat', [...messages, sameTimeMessage], cursor);
    expect(next).toEqual({
      chatGuid: 'chat',
      dateCreated: 2_000,
      messageGuids: ['two', 'same-time-third'],
    });
  });
});
