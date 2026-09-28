import { isRetryableLeagueSyncError } from './sync-errors.js';

/** Retries only league reads; callers must keep report generation and delivery outside this boundary. */
export async function retryLeagueFetch<T>(
  fetch: () => Promise<T>,
  additionalRetries: number,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> {
  const retries = Number.isInteger(additionalRetries)
    ? Math.max(0, Math.min(3, additionalRetries))
    : 0;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetch();
    } catch (error) {
      if (attempt >= retries || !isRetryableLeagueSyncError(error)) throw error;
      await sleep(500 * 2 ** attempt);
    }
  }
}
