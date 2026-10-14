import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFootballNews, fetchFootballNewsWithStatus, FootballNewsCache } from './news.js';

const headline = {
  title: 'Training camp opens',
  source: 'ESPN',
  url: 'https://example.com/story',
  publishedAt: '2026-07-20T12:00:00.000Z',
};

describe('football news cache', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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

  it('keeps a bounded relevance pool for advice while ordinary news stays at ten and shares the same refresh', async () => {
    const load = vi.fn().mockResolvedValue(
      Array.from({ length: 120 }, (_, i) => ({
        ...headline,
        title: `Fictional story ${i}`,
        url: `https://example.com/story-${i}`,
      })),
    );
    let now = Date.parse(headline.publishedAt);
    const cache = new FootballNewsCache(load, 60_000, () => now);
    const [ordinary, advice] = await Promise.all([cache.get(), cache.getForAdvice()]);
    expect(load).toHaveBeenCalledOnce();
    expect(ordinary.items).toHaveLength(10);
    expect(advice.items).toHaveLength(100);
    expect(advice.items[20]!.title).toBe('Fictional story 20');
    advice.items[20]!.title = 'Changed by caller';
    expect((await cache.getForAdvice()).items[20]!.title).toBe('Fictional story 20');
    now += 61_000;
    load.mockRejectedValue(new Error('private provider detail'));
    const stale = await cache.getForAdvice();
    expect(stale.stale).toBe(true);
    expect(stale.items).toHaveLength(100);
    expect(stale.error).not.toContain('private provider detail');
    cache.setSources(['pff']);
    expect((await cache.getForAdvice()).items).toEqual([]);
  });

  it('retains stories below the ordinary ten-story cutoff for bounded advisor relevance selection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    const rss = `<rss><channel>${Array.from(
      { length: 20 },
      (_, i) =>
        `<item><title>Fictional story ${i}</title><link>https://example.com/${i}</link><pubDate>Wed, 07 Oct 2026 ${String(11 - Math.floor(i / 10)).padStart(2, '0')}:${String(59 - i).padStart(2, '0')}:00 GMT</pubDate></item>`,
    ).join('')}</channel></rss>`;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response(rss)),
    );
    expect((await fetchFootballNewsWithStatus(['espn'])).items).toHaveLength(10);
    expect((await fetchFootballNewsWithStatus(['espn'], 100)).items).toHaveLength(20);
    await expect(fetchFootballNewsWithStatus(['espn'], 101)).rejects.toThrow(
      'News selection limit',
    );
  });

  it('keeps advice headlines paired with their actual retrieval date if another refresh completes while awaiting the ordinary view', async () => {
    let now = Date.parse(headline.publishedAt);
    const newer = {
      ...headline,
      title: 'Newer football practice report',
      publishedAt: new Date(now + 60_000).toISOString(),
    };
    const load = vi.fn().mockResolvedValueOnce([headline]).mockResolvedValueOnce([newer]);
    const cache = new FootballNewsCache(load, 60_000, () => now);
    const get = cache.get.bind(cache);
    vi.spyOn(cache, 'get').mockImplementation(async () => {
      const old = await get();
      now += 61_000;
      await get(true);
      return old;
    });
    const result = await cache.getForAdvice();
    expect(result.items).toEqual([newer]);
    expect(result.refreshedAt).toBe(new Date(now).toISOString());
    expect(result.stale).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not turn missing or malformed publication dates into fresh headlines', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    const rss = `<rss><channel>
      <item><title>Verified date</title><link>https://example.com/dated</link><pubDate>Wed, 07 Oct 2026 11:00:00 GMT</pubDate></item>
      <item><title>Missing date</title><link>https://example.com/missing</link></item>
      <item><title>Bad date</title><link>https://example.com/bad</link><pubDate>not a date</pubDate></item>
    </channel></rss>`;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response(rss)),
    );
    expect(
      (await fetchFootballNewsWithStatus(['espn'], 100)).items.map((item) => item.url),
    ).toEqual(['https://example.com/dated']);
  });

  it('decodes padded decimal and hexadecimal headline entities so player names remain matchable', async () => {
    const rss = `<rss><channel><item>
      <title>Ja&#039;Marr Chase &amp; A.J. Brown&#x27;s NFL practice update</title>
      <link>https://example.com/football?a=1&amp;b=2</link>
      <pubDate>Wed, 07 Oct 2026 11:00:00 GMT</pubDate>
    </item></channel></rss>`;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response(rss)),
    );
    expect((await fetchFootballNewsWithStatus(['espn'], 100)).items[0]).toMatchObject({
      title: "Ja'Marr Chase & A.J. Brown's NFL practice update",
      url: 'https://example.com/football?a=1&b=2',
    });
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

  it('filters publication times too far in the future while tolerating small feed clock skew', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const rss = `<rss><channel>
      <item><title>Recently published</title><link>https://example.com/recent</link><pubDate>Mon, 28 Sep 2026 11:55:00 GMT</pubDate></item>
      <item><title>Minor publisher clock skew</title><link>https://example.com/skew</link><pubDate>Mon, 28 Sep 2026 12:04:00 GMT</pubDate></item>
      <item><title>Scheduled for later</title><link>https://example.com/future</link><pubDate>Mon, 28 Sep 2026 12:06:00 GMT</pubDate></item>
    </channel></rss>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(rss, { status: 200 })));

    const stories = await fetchFootballNews(['espn']);

    expect(stories.map(({ url }) => url)).toEqual([
      'https://example.com/skew',
      'https://example.com/recent',
    ]);

    const futureOnly = `<rss><channel><item><title>Scheduled for later</title><link>https://example.com/future</link><pubDate>Mon, 28 Sep 2026 12:30:00 GMT</pubDate></item></channel></rss>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(futureOnly, { status: 200 })));
    await expect(fetchFootballNewsWithStatus(['espn'])).rejects.toThrow(
      'All selected football news sources failed (ESPN).',
    );
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

  it('loads and attributes the selected CBS Sports NFL RSS feed', async () => {
    const rss = `<rss><channel><item><title>CBS injury roundup</title><link>https://www.cbssports.com/nfl/news/injury-roundup/</link><pubDate>Mon, 28 Sep 2026 06:00:00 GMT</pubDate></item></channel></rss>`;
    const fetchMock = vi.fn().mockResolvedValue(new Response(rss, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const stories = await fetchFootballNews(['cbs']);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://www.cbssports.com/rss/headlines/nfl/',
    );
    expect(stories).toMatchObject([
      {
        title: 'CBS injury roundup',
        source: 'CBS Sports',
        url: 'https://www.cbssports.com/nfl/news/injury-roundup/',
      },
    ]);
  });

  it('loads Pro Football Talk stories as attributed headline links', async () => {
    const rss = `<rss><channel><item><title>Sunday Night Football recap</title><link>https://www.nbcsports.com/nfl/profootballtalk/story</link><pubDate>Mon, 28 Sep 2026 00:13:31 -0400</pubDate></item></channel></rss>`;
    const fetchMock = vi.fn().mockResolvedValue(new Response(rss, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const stories = await fetchFootballNews(['pft']);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://www.nbcsports.com/profootballtalk.rss',
    );
    expect(stories).toMatchObject([
      {
        title: 'Sunday Night Football recap',
        source: 'Pro Football Talk',
        url: 'https://www.nbcsports.com/nfl/profootballtalk/story',
        publishedAt: '2026-09-28T04:13:31.000Z',
      },
    ]);
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

  it('retries a transient feed connection failure before reporting news unavailable', async () => {
    const rss = `<rss><channel><item><title>Recovered feed</title><link>https://example.com/recovered</link><pubDate>Mon, 20 Jul 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('temporary network failure'))
      .mockResolvedValueOnce(new Response(rss, { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    await expect(fetchFootballNews(['espn'])).resolves.toMatchObject([
      { title: 'Recovered feed', source: 'ESPN' },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
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
