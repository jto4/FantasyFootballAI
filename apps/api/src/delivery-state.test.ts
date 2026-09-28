import { describe, expect, it } from 'vitest';
import { makeDeliveryAttempt } from './delivery-state.js';

describe('delivery attempt creation', () => {
  it('reuses an uncertain Resend key and gives a new request its own key', () => {
    const previous = {
      startedAt: '2026-09-25T10:00:00.000Z',
      finishedAt: '2026-09-25T10:00:05.000Z',
      channel: 'email' as const,
      status: 'uncertain' as const,
      idempotencyKey: 'prior-key',
    };

    expect(
      makeDeliveryAttempt('email', '2026-09-25T10:01:00.000Z', previous, 'new-key'),
    ).toMatchObject({ status: 'sending', channel: 'email', idempotencyKey: 'prior-key' });
    expect(
      makeDeliveryAttempt('email', '2026-09-25T10:01:00.000Z', undefined, 'new-key'),
    ).toMatchObject({ status: 'sending', channel: 'email', idempotencyKey: 'new-key' });
  });

  it('does not pass an email idempotency key to the SMS channel', () => {
    const attempt = makeDeliveryAttempt('sms', '2026-09-25T10:01:00.000Z', undefined, 'new-key');
    expect(attempt).toEqual({
      startedAt: '2026-09-25T10:01:00.000Z',
      channel: 'sms',
      status: 'sending',
    });
  });
});
