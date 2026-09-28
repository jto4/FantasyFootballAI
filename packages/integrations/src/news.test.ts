import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFootballNews, fetchFootballNewsWithStatus, FootballNewsCache } from './news.js';

const headline = {
  title: 'Training camp opens',
  source: 'ESPN',
  url: 'https://example.com/story',
  publishedAt: '2026-07-20T12:00:00.000Z',
};

describe('football news cache', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reuses fresh feed results and exposes their refresh time', async () => {
    let now = Date.parse('2026-07-20T12:00:00.000Z');
    const load = vi.fn().mockResolvedValue([headline]);
    const cache = new FootballNewsCache(load, 60_000, () => now);

    const first = await cache.get();
    now += 30_000;
    const second = await cache.get();

    expect(first.refreshedAt).toBe('2026-07-20T12:00:00.000Z');
    expect(second.items).toEqual([headline]);
    expect(second.stale).toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });

  it('coalesces concurrent refreshes and serves stale stories after an error', async () => {
    let now = Date.parse('2026-07-20T12:00:00.000Z');
    let completeLoad!: (items: (typeof headline)[]) => void;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<(typeof headline)[]>((resolve) => (completeLoad = resolve)),
      )
      .mockRejectedValueOnce(new Error('provider detail'));
    const cache = new FootballNewsCache(load, 60_000, () => now);

    const requests = [cache.get(), cache.get()];
    await Promise.resolve();
    completeLoad([headline]);
    const [first, second] = await Promise.all(requests);
    expect(load).toHaveBeenCalledOnce();
    expect(first?.items).toEqual([headline]);
    expect(second?.items).toEqual([headline]);

    now += 61_000;
    const stale = await cache.get();
    expect(stale.items).toEqual([headline]);
    expect(stale.stale).toBe(true);
    expect(stale.error).toContain('showing the last cached headlines');
    expect(stale.error).not.toContain('provider detail');
    await cache.get();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('uses the configured refresh interval and parses cited links from the bounded RSS feed', async () => {
    let now = Date.parse('2026-07-20T12:00:00.000Z');
    const load = vi.fn().mockResolvedValue([headline]);
    const cache = new FootballNewsCache(load, 60_000, () => now);
    await cache.get();
    cache.setRefreshIntervalMinutes(5);
    now += 60_000;
    await cache.get();
    expect(load).toHaveBeenCalledOnce();
    now += 4 * 60_000;
    await cache.get();
    expect(load).toHaveBeenCalledTimes(2);
    expect(() => cache.setRefreshIntervalMinutes(4)).toThrow();

    const rss = `<rss><channel>
      <item><title><![CDATA[Camp &amp; roster news]]></title><link>https://example.com/story?a=1&amp;b=2</link><pubDate>Mon, 20 Jul 2026 12:00:00 GMT</pubDate></item>
      <item><title>Unsafe link</title><link>http://example.com/</link><pubDate>Mon, 20 Jul 2026 12:00:00 GMT</pubDate></item>
      <item><title>Credentialed link</title><link>https://user:password@example.com/story</link><pubDate>Mon, 20 Jul 2026 12:00:00 GMT</pubDate></item>
      <item><title>${'T'.repeat(501)}</title><link>https://example.com/long-title</link><pubDate>Mon, 20 Jul 2026 12:00:00 GMT</pubDate></item>
      <item><title>Long link</title><link>https://example.com/${'a'.repeat(2048)}</link><pubDate>Mon, 20 Jul 2026 12:00:00 GMT</pubDate></item>
    </channel></rss>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(rss, { status: 200 })));
    await expect(fetchFootballNews()).resolves.toMatchObject([
      {
        title: 'Camp & roster news',
        url: 'https://example.com/story?a=1&b=2',
        source: 'ESPN',
      },
    ]);
  });

  it('merges selected feeds, labels citations by source, and de-duplicates URLs', async () => {
    const rss = (title: string, url: string, date: string) =>
      `<rss><channel><item><title>${title}</title><link>${url}</link><pubDate>${date}</pubDate></item></channel></rss>`;
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      const body = url.includes('pff.com')
        ? rss('PFF feature', 'https://example.com/pff', 'Mon, 20 Jul 2026 13:00:00 GMT').replace(
            '</channel>',
            '<item><title>Duplicate link</title><link>https://example.com/espn</link><pubDate>Mon, 20 Jul 2026 11:00:00 GMT</pubDate></item></channel>',
          )
        : rss('ESPN headline', 'https://example.com/espn', 'Mon, 20 Jul 2026 12:00:00 GMT');
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const items = await fetchFootballNews(['espn', 'pff']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(items).toMatchObject([
      { title: 'PFF feature', source: 'PFF', url: 'https://example.com/pff' },
      { title: 'ESPN headline', source: 'ESPN', url: 'https://example.com/espn' },
    ]);
    expect(items).toHaveLength(2);
  });

  it('loads the selected FOX Sports RSS feed, attributes stories, and filters betting headlines', async () => {
    const rss = `<rss><channel>
      <item><title><![CDATA[Falcons injury update]]></title><link>https://www.foxsports.com/story/falcons</link><category>NFL</category><pubDate>Sat, 26 Sep 2026 20:44:42 -0400</pubDate></item>
      <item><title>Weekly parlay pick</title><link>https://www.foxsports.com/story/parlay</link><category>betting</category><pubDate>Sat, 26 Sep 2026 20:44:42 -0400</pubDate></item>
    </channel></rss>`;
    const fetchMock = vi.fn().mockResolvedValue(new Response(rss, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const stories = await fetchFootballNews(['fox']);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('tags=fs%2Fnfl');
    expect(stories).toMatchObject([
      {
        title: 'Falcons injury update',
        source: 'FOX Sports',
        url: 'https://www.foxsports.com/story/falcons',
      },
    ]);
    expect(stories.some((story) => story.url.endsWith('/parlay'))).toBe(false);
  });

  it('reports partial feed failures while keeping available headlines and cached status', async () => {
    const rss = `<rss><channel><item><title>ESPN headline</title><link>https://example.com/espn</link><pubDate>Mon, 20 Jul 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) =>
        Promise.resolve(
          String(input).includes('pff.com')
            ? new Response(null, { status: 503 })
            : new Response(rss, { status: 200 }),
        ),
      ),
    );

    const load = await fetchFootballNewsWithStatus(['espn', 'pff']);
    expect(load.items).toMatchObject([{ title: 'ESPN headline', source: 'ESPN' }]);
    expect(load.error).toContain('PFF is unavailable');
    expect(load.error).toContain('ESPN');

    const cache = new FootballNewsCache(async () => load);
    const first = await cache.get();
    const cached = await cache.get();
    expect(first.error).toBe(load.error);
    expect(cached.error).toBe(load.error);
    expect(cached.stale).toBe(false);
  });

  it('treats an empty successful HTTP response as a feed failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<rss><channel></channel></rss>', { status: 200 })),
    );

    await expect(fetchFootballNewsWithStatus(['espn'])).rejects.toThrow(
      'All selected football news sources failed (ESPN).',
    );
  });

  it('invalidates cached headlines when sources change and makes no requests when disabled', async () => {
    const load = vi.fn().mockResolvedValue([headline]);
    const cache = new FootballNewsCache(load);
    await cache.get();
    expect(load).toHaveBeenLastCalledWith(['espn']);

    cache.setSources(['pff']);
    expect((await cache.get()).items).toEqual([headline]);
    expect(load).toHaveBeenLastCalledWith(['pff']);

    cache.setSources([]);
    const disabled = await cache.get();
    expect(disabled.items).toEqual([]);
    expect(disabled.stale).toBe(false);
    expect(disabled.error).toContain('No football news source');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not let an in-flight response repopulate headlines after its source is removed', async () => {
    const pffHeadline = { ...headline, source: 'PFF', title: 'PFF feature' };
    let finishEspn!: (items: (typeof headline)[]) => void;
    const load = vi.fn((sources: string[]) =>
      sources[0] === 'espn'
        ? new Promise<(typeof headline)[]>((resolve) => {
            finishEspn = resolve;
          })
        : Promise.resolve([pffHeadline]),
    );
    const cache = new FootballNewsCache(load);
    const obsoleteRefresh = cache.get();
    await Promise.resolve();
    cache.setSources(['pff']);
    const current = await cache.get();
    finishEspn([headline]);
    await obsoleteRefresh;

    expect(current.items).toEqual([pffHeadline]);
    expect((await cache.get()).items).toEqual([pffHeadline]);
    expect(load).toHaveBeenNthCalledWith(1, ['espn']);
    expect(load).toHaveBeenNthCalledWith(2, ['pff']);
  });
});
