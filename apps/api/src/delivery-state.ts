import type { DeliveryAttempt } from '@sidekick/core';

export type OutboundChannel = DeliveryAttempt['channel'];

/** Reuse Resend's key only when retrying the same uncertain email request. */
export function makeDeliveryAttempt(
  channel: OutboundChannel,
  startedAt: string,
  previous: DeliveryAttempt | undefined,
  newIdempotencyKey: string,
): DeliveryAttempt {
  const idempotencyKey =
    channel === 'email'
      ? previous?.status === 'uncertain' && previous.channel === 'email'
        ? (previous.idempotencyKey ?? newIdempotencyKey)
        : newIdempotencyKey
      : undefined;

  return {
    startedAt,
    channel,
    status: 'sending',
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };
}
