import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cachedDownload, configureDownloadCache } from './download-cache.js';
import { compactDepthCharts } from './usage-data.js';

afterEach(() => configureDownloadCache(undefined));

function server(body: string) {
  const calls: (string | null)[] = [];
  let failing = false;
  let current = body;
  const fetcher = (async (_url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push(headers.get('if-none-match'));
    if (failing) throw new TypeError('Failed to fetch');
    const etag = `"${current.length}"`;
    if (headers.get('if-none-match') === etag) return new Response(null, { status: 304 });
    return new Response(current, { status: 200, headers: { etag } });
  }) as typeof fetch;
  return {
    fetcher,
    calls,
    fail: () => (failing = true),
    change: (next: string) => (current = next),
  };
}

it('revalidates with ETags, reads unchanged files from disk and falls back when offline', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-cache-'));
  configureDownloadCache(directory);
  const remote = server('a,b\n1,2\n');
  let parses = 0;
  const get = (now: number) =>
    cachedDownload('https://example.test/file.csv', {
      fetcher: remote.fetcher,
      maxBytes: 1_000,
      now: () => now,
      parse: (text) => {
        parses++;
        return text.split('\n')[1];
      },
    });
  expect(await get(1_000)).toMatchObject({ value: '1,2', stale: false });
  const second = await get(2_000);
  expect(second.value).toBe('1,2');
  expect(second.validatedAt).toBe(new Date(2_000).toISOString());
  expect(remote.calls).toEqual([null, '"8"']);
  remote.change('a,b\n3,4,5\n');
  expect((await get(3_000)).value).toBe('3,4,5');
  remote.fail();
  const offline = await get(4_000);
  expect(offline).toMatchObject({ value: '3,4,5', stale: true });
  expect(offline.validatedAt).toBe(new Date(3_000).toISOString());
  expect(parses).toBe(4);
  // Private files only.
  for (const name of await readdir(directory))
    expect((await stat(join(directory, name))).mode & 0o077).toBe(0);
});

it('stores a derived form, and without a cache folder simply downloads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-cache-'));
  configureDownloadCache(directory);
  const remote = server('x'.repeat(50));
  const options = {
    fetcher: remote.fetcher,
    maxBytes: 1_000,
    parse: (text: string) => new Map([['length', text.length]]),
    derive: {
      version: 'v1',
      encode: (value: Map<string, number>) => [...value],
      decode: (stored: unknown) => new Map(stored as [string, number][]),
    },
  };
  await cachedDownload('https://example.test/big.csv', options);
  const again = await cachedDownload('https://example.test/big.csv', options);
  expect(again.value.get('length')).toBe(50);
  configureDownloadCache(undefined);
  const plain = server('hello');
  expect(
    (
      await cachedDownload('https://example.test/p', {
        fetcher: plain.fetcher,
        maxBytes: 100,
        parse: (t) => t,
      })
    ).value,
  ).toBe('hello');
  expect(plain.calls).toEqual([null]);
});

it('keeps only depth-chart rank changes', () => {
  const day = (d: number) => `2026-09-${String(d).padStart(2, '0')}T12:00:00Z`;
  const compact = compactDepthCharts(
    new Map([
      [
        '00-0000001',
        [
          { pos: 'WR' as const, rank: 2, at: day(1) },
          { pos: 'WR' as const, rank: 2, at: day(2) },
          { pos: 'WR' as const, rank: 1, at: day(3) },
          { pos: 'WR' as const, rank: 1, at: day(4) },
          { pos: 'TE' as const, rank: 3, at: day(4) },
        ],
      ],
    ]),
  );
  expect(compact.get('00-0000001')!.map((e) => `${e.pos}${e.rank}@${e.at!.slice(8, 10)}`)).toEqual([
    'WR2@01',
    'WR1@03',
    'TE3@04',
  ]);
});
