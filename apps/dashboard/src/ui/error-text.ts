import { ApiError } from './api-client';

const referencePattern =
  / ?Reference: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.?$/i;

/**
 * One way to show any failure: a plain sentence for the reader, and the technical part (request
 * reference, error code, HTTP status, raw browser text) kept for a "Details for support" toggle.
 * Accepts an error object or an already-formatted message string.
 */
export function describeError(
  failure: unknown,
  fallback = 'Something went wrong. Try again.',
): { message: string; detail?: string } {
  const raw =
    typeof failure === 'string' ? failure : failure instanceof Error ? failure.message : '';
  const details: string[] = [];
  let message = raw.trim();
  const reference = referencePattern.exec(message);
  if (reference) {
    message = message.slice(0, reference.index).trim();
    details.push(`Reference: ${reference[1]}`);
  }
  if (failure instanceof ApiError) {
    if (failure.code && failure.code !== 'invalid_response') details.push(`Code: ${failure.code}`);
    if (failure.status) details.push(`HTTP ${failure.status}`);
  }
  // Raw browser network errors mean nothing to a reader; keep them for support only.
  const network = /(failed to fetch|networkerror|load failed|network request failed)/i;
  const timeout = /(timed? ?out|signal timed out|timeouterror)/i;
  if (network.test(message)) {
    details.push(message);
    const prefix = message
      .replace(network, '')
      .replace(/[.:\s]+$/, '')
      .trim();
    const reach =
      'Could not reach the local service. Check that Sunday Sidekick is still running, then try again.';
    message = prefix ? `${prefix}. ${reach}` : reach;
  } else if (timeout.test(message) && !/local request timed out/i.test(message)) {
    details.push(message);
    message = 'This is taking longer than expected. Try again in a moment.';
  }
  if (!message) message = fallback;
  return details.length ? { message, detail: details.join(' · ') } : { message };
}

/** A custom message for a failure that keeps the failure's request reference, if it had one. */
export function withReference(message: string, failure: unknown): string {
  const raw =
    failure instanceof Error ? failure.message : typeof failure === 'string' ? failure : '';
  const reference = referencePattern.exec(raw);
  return reference ? `${message} Reference: ${reference[1]}.` : message;
}
