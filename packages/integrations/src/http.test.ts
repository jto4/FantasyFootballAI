import { describe, expect, it } from 'vitest';
import { fetchRetryingJson, readBoundedJson, readBoundedText } from './http.js';

describe('bounded provider responses', () => {
  it('reads text within its byte budget', async () => {
    await expect(readBoundedText(new Response('small response'), 32)).resolves.toBe(
      'small response',
    );
  });

  it('rejects a declared response length before buffering it', async () => {
    const response = new Response('ignored', { headers: { 'content-length': '1000' } });
    await expect(readBoundedText(response, 10)).rejects.toThrow('size limit');
  });

  it('stops streaming an oversized body without requiring Content-Length', async () => {
    const response = new Response(new Uint8Array(1024));
    await expect(readBoundedText(response, 64)).rejects.toThrow('size limit');
  });

  it('parses bounded JSON', async () => {
    await expect(readBoundedJson(new Response('{"ready":true}'), 32)).resolves.toEqual({
      ready: true,
    });
  });
});

describe('retrying JSON requests', () => {
  it('retries transient network errors for GET requests', async () => {
    let calls = 0;
    const delays: number[] = [];
    const result = await fetchRetryingJson<{ ready: boolean }>(
      'https://example.test/data',
      {},
      {
        fetcher: async () => {
          calls += 1;
          if (calls < 3) throw new TypeError('network unavailable');
          return new Response('{"ready":true}');
        },
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
        },
      },
    );

    expect(result).toEqual({ ready: true });
    expect(calls).toBe(3);
    expect(delays).toEqual([250, 500]);
  });

  it('honors Retry-After for a retryable response', async () => {
    let calls = 0;
    const delays: number[] = [];
    const result = await fetchRetryingJson<{ ok: boolean }>(
      'https://example.test/data',
      {},
      {
        fetcher: async () => {
          calls += 1;
          return calls === 1
            ? new Response('busy', { status: 429, headers: { 'retry-after': '1' } })
            : new Response('{"ok":true}');
        },
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
        },
      },
    );

    expect(result).toEqual({ ok: true });
    expect(delays).toEqual([1_000]);
  });

  it('does not retry requests with unsafe methods', async () => {
    let calls = 0;
    await expect(
      fetchRetryingJson(
        'https://example.test/data',
        { method: 'POST' },
        {
          fetcher: async () => {
            calls += 1;
            throw new TypeError('network unavailable');
          },
          sleep: async () => undefined,
        },
      ),
    ).rejects.toThrow('network unavailable');
    expect(calls).toBe(1);
  });
});
