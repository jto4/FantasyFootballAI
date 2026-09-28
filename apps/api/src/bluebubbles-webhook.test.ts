import { describe, expect, it } from 'vitest';
import { isRelevantBlueBubblesMessageEvent, sameWebhookToken } from './bluebubbles-webhook.js';

describe('BlueBubbles webhook validation', () => {
  const event = {
    type: 'new-message',
    data: { guid: 'message-guid', isFromMe: false, chats: [{ guid: 'group-guid' }] },
  };

  it('accepts only a new message from the configured group chat', () => {
    expect(isRelevantBlueBubblesMessageEvent(event, 'group-guid')).toBe(true);
    expect(isRelevantBlueBubblesMessageEvent(event, 'other-group')).toBe(false);
    expect(
      isRelevantBlueBubblesMessageEvent({ ...event, type: 'updated-message' }, 'group-guid'),
    ).toBe(false);
    expect(
      isRelevantBlueBubblesMessageEvent(
        { ...event, data: { ...event.data, guid: '' } },
        'group-guid',
      ),
    ).toBe(false);
  });

  it('rejects malformed webhook bodies and bounded-array violations', () => {
    expect(isRelevantBlueBubblesMessageEvent(null, 'group-guid')).toBe(false);
    expect(
      isRelevantBlueBubblesMessageEvent(
        {
          ...event,
          data: { ...event.data, chats: Array.from({ length: 21 }, () => ({ guid: 'x' })) },
        },
        'group-guid',
      ),
    ).toBe(false);
  });

  it('compares bearer tokens without accepting malformed or unequal values', () => {
    const token = 'a'.repeat(43);
    expect(sameWebhookToken(token, token)).toBe(true);
    expect(sameWebhookToken(`${token.slice(0, -1)}b`, token)).toBe(false);
    expect(sameWebhookToken('short', token)).toBe(false);
  });
});
