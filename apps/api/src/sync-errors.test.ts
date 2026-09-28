import { describe, expect, it } from 'vitest';
import { isRetryableLeagueSyncError, leagueSyncErrorMessage } from './sync-errors.js';
import { retryLeagueFetch } from './sync-retry.js';

describe('league sync failure guidance', () => {
  it('distinguishes access, rate-limit, availability, and network failures', () => {
    expect(leagueSyncErrorMessage(new Error('Yahoo rejected token (401)'))).toContain('Reconnect');
    expect(leagueSyncErrorMessage(new Error('Provider request failed (429)'))).toContain(
      'rate limiting',
    );
    expect(leagueSyncErrorMessage(new Error('Provider request failed (503)'))).toContain(
      'temporarily unavailable',
    );
    expect(leagueSyncErrorMessage(new TypeError('fetch failed'))).toContain('could not be reached');
  });

  it('never returns provider errors, URLs, or credential fragments', () => {
    const result = leagueSyncErrorMessage(
      new Error('request https://secret.example/?token=supersecret failed with (429)'),
    );
    expect(result).toContain('rate limiting');
    expect(result).not.toContain('secret.example');
    expect(result).not.toContain('supersecret');
  });
});

describe('scheduled league refresh retries', () => {
  it('retries transient errors with bounded backoff and stops after the configured count', async () => {
    let calls = 0;
    const waits: number[] = [];
    const value = await retryLeagueFetch(
      async () => {
        calls += 1;
        if (calls < 4) throw new Error('Provider request failed (503)');
        return 'league';
      },
      3,
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    );
    expect(value).toBe('league');
    expect(calls).toBe(4);
    expect(waits).toEqual([500, 1000, 2000]);
  });

  it('does not retry access failures, and defaults invalid retry counts to zero', async () => {
    expect(isRetryableLeagueSyncError(new Error('unauthorized (401)'))).toBe(false);
    expect(isRetryableLeagueSyncError(new Error('forbidden (403)'))).toBe(false);
    let calls = 0;
    await expect(
      retryLeagueFetch(
        async () => {
          calls += 1;
          throw new Error('Provider request failed (503)');
        },
        99,
        async () => undefined,
      ),
    ).rejects.toThrow('(503)');
    expect(calls).toBe(4);
  });
});
