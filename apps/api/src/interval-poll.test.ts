import { afterEach, describe, expect, it, vi } from 'vitest';
import { startIntervalPoll, type IntervalPollStatus } from './interval-poll.js';

describe('startIntervalPoll', () => {
  afterEach(() => vi.useRealTimers());

  it('does not schedule disabled polls or unsupported intervals', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => ({ addedMessages: 1 }));
    const status: IntervalPollStatus = {};
    const stopDisabled = startIntervalPoll({
      enabled: false,
      intervalMinutes: 5,
      status,
      failureMessage: 'sync unavailable',
      run,
    });
    const stopInvalid = startIntervalPoll({
      enabled: true,
      intervalMinutes: 10,
      status,
      failureMessage: 'sync unavailable',
      run,
    });

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    stopDisabled();
    stopInvalid();
    expect(run).not.toHaveBeenCalled();
    expect(status).toEqual({});
  });

  it('records successful results and clears a previous error', async () => {
    vi.useFakeTimers();
    const status: IntervalPollStatus = { lastError: 'previous failure' };
    const stop = startIntervalPoll({
      enabled: true,
      intervalMinutes: 5,
      status,
      failureMessage: 'sync unavailable',
      now: () => new Date('2026-09-27T12:00:00.000Z'),
      run: async () => ({ addedMessages: 3 }),
    });

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    stop();
    expect(status).toEqual({
      lastCheckedAt: '2026-09-27T12:00:00.000Z',
      lastAddedMessages: 3,
    });
  });

  it('does not overlap a running poll', async () => {
    vi.useFakeTimers();
    let finish: ((result: { addedMessages: number }) => void) | undefined;
    const run = vi.fn(
      () =>
        new Promise<{ addedMessages: number }>((resolve) => {
          finish = resolve;
        }),
    );
    const stop = startIntervalPoll({
      enabled: true,
      intervalMinutes: 5,
      status: {},
      failureMessage: 'sync unavailable',
      run,
    });

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(run).toHaveBeenCalledTimes(1);
    finish?.({ addedMessages: 0 });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it('records provider failures with sanitized status and stops cleanly', async () => {
    vi.useFakeTimers();
    const status: IntervalPollStatus = {};
    const run = vi.fn(() => {
      throw new Error('raw provider response must not be shown');
    });
    const stop = startIntervalPoll({
      enabled: true,
      intervalMinutes: 15,
      status,
      failureMessage: 'Twilio history could not be reached.',
      now: () => new Date('2026-09-27T13:00:00.000Z'),
      run,
    });

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(status).toEqual({
      lastCheckedAt: '2026-09-27T13:00:00.000Z',
      lastError: 'Twilio history could not be reached.',
    });
    stop();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(status.lastError).not.toContain('raw provider response');
  });
});
