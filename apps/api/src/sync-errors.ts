/** Convert provider failures into useful guidance without persisting remote response text. */
export function leagueSyncErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/\b401\b|unauthori[sz]ed|token.*(?:expired|rejected)/i.test(message))
    return 'Platform access expired or was rejected. Reconnect the league account.';
  if (/\b403\b|forbidden|access denied/i.test(message))
    return 'The connected account cannot access this league. Check membership and platform permissions.';
  if (/\b429\b|rate.?limit/i.test(message))
    return 'The platform is rate limiting requests. Wait a moment before refreshing again.';
  if (/\b5\d\d\b|temporar(?:y|ily)|unavailable/i.test(message))
    return 'The fantasy platform is temporarily unavailable. Try refreshing again later.';
  if (
    error instanceof TypeError ||
    (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
  )
    return 'The fantasy platform could not be reached before the request timed out. Check your connection and try again.';
  return 'League refresh failed. Check platform access and try again.';
}

/** Only retry failures that may clear without changing credentials or permissions. */
export function isRetryableLeagueSyncError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  if (
    /\b401\b|unauthori[sz]ed|token.*(?:expired|rejected)|\b403\b|forbidden|access denied/i.test(
      message,
    )
  )
    return false;
  if (/\b429\b|rate.?limit|\b5\d\d\b|temporar(?:y|ily)|unavailable/i.test(message)) return true;
  return (
    error instanceof TypeError ||
    (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
  );
}
