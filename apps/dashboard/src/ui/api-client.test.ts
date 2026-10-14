import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, requestJson } from './api-client.js';
afterEach(() => vi.unstubAllGlobals());
it('combines a caller abort signal with the shared deadline', async () => {
  const caller = new AbortController();
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) => {
      signal = options.signal;
      return new Response('{"ok":true}');
    }),
  );
  await requestJson(
    '/api/test',
    (value): value is { ok: true } =>
      Boolean(value && typeof value === 'object' && 'ok' in value && value.ok === true),
    { signal: caller.signal },
  );
  expect(signal).not.toBe(caller.signal);
  caller.abort();
  expect(signal?.aborted).toBe(true);
});
it('rejects malformed successful payloads and adds only safe error correlation IDs', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"wrong":true}')),
  );
  await expect(
    requestJson('/api/test', (value): value is number => typeof value === 'number'),
  ).rejects.toBeInstanceOf(ApiError);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response('{"error":"Unavailable","code":"service_unavailable"}', {
          status: 503,
          headers: { 'x-sidekick-request-id': '00000000-0000-4000-8000-000000000000' },
        }),
    ),
  );
  await expect(
    requestJson('/api/test', (value): value is number => typeof value === 'number'),
  ).rejects.toThrow('Reference: 00000000-0000-4000-8000-000000000000');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response('{}', {
          status: 500,
          headers: { 'x-sidekick-request-id': 'private-token-fixture' },
        }),
    ),
  );
  await expect(
    requestJson('/api/test', (value): value is number => typeof value === 'number'),
  ).rejects.not.toThrow('private-token-fixture');
});
