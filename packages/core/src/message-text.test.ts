import { describe, expect, it } from 'vitest';
import { deliveryText } from './message-text.js';

describe('deliveryText', () => {
  it('preserves unlimited email/dashboard and exact-fit phone text', () => {
    const body = 'F'.repeat(10001);
    expect(deliveryText(body, 'email', '')).toBe(body);
    expect(deliveryText(body, 'dashboard', '')).toBe(body);
    const exact = 'F'.repeat(1498) + '🏈';
    expect(deliveryText(exact, 'sms', '+15555550123')).toBe(exact);
  });
  it('uses the group limit only for a valid Conversation SID', () => {
    const body = 'F'.repeat(1700);
    expect(deliveryText(body, 'sms', 'CH' + 'a'.repeat(32))).toHaveLength(1600);
    expect(deliveryText(body, 'sms', 'CHinvalid')).toHaveLength(1500);
    expect(deliveryText(body, 'sms', '+15555550123')).toHaveLength(1500);
  });
  it.each([
    ['sms', '+15555550123', 1500],
    ['sms', 'CH' + '1'.repeat(32), 1600],
    ['imessage', 'fictional-chat', 10000],
  ] as const)('keeps an emoji intact at %s boundaries', (channel, destination, limit) => {
    const prefix = 'F'.repeat(limit - 1);
    expect(deliveryText(prefix + '🏈 More', channel, destination)).toBe(prefix);
  });
  it('preserves combining accents, skin tones, and joined emoji as whole graphemes', () => {
    for (const suffix of ['e\u0301', '👍🏽', '👨‍👩‍👧‍👦', '🇺🇸']) {
      const prefix = 'F'.repeat(1499);
      expect(deliveryText(prefix + suffix + ' More', 'sms', '+15555550123')).toBe(prefix);
    }
  });
});
