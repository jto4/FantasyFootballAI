import type { DeliveryAttempt } from '@sidekick/core';

export type OutboundChannel = DeliveryAttempt['channel'];

/** Attempted reports are immutable: every email retry keeps its saved request key. */
export function makeDeliveryAttempt(
  channel: OutboundChannel,
  startedAt: string,
  previous: DeliveryAttempt | undefined,
  newIdempotencyKey: string,
): DeliveryAttempt {
  const idempotencyKey =
    channel === 'email'
      ? previous?.channel === 'email'
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
