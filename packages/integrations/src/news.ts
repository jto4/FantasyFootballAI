import {
  defaultNewsSources,
  normalizeNewsSources,
  type NewsItem,
  type NewsSourceId,
} from '@sidekick/core';
import { readBoundedText } from './http.js';

const requestTimeoutMs = 8_000;
const defaultCacheMs = 15 * 60 * 1000;
const sourceDetails: Record<NewsSourceId, { name: string; url: string }> = {
  espn: { name: 'ESPN', url: 'https://www.espn.com/espn/rss/nfl/news' },
  pff: { name: 'PFF', url: 'https://www.pff.com/feed' },
  fox: {
    name: 'FOX Sports',
    url: 'https://api.foxsports.com/v2/content/optimized-rss?partnerKey=MB0Wehpmuj2lUhuRhQaafhBjAJqaPU244mlTDK1i&size=30&tags=fs%2Fnfl',
  },
};

export interface FootballNewsSnapshot {
  items: NewsItem[];
  refreshedAt?: string;
  stale: boolean;
  error?: string;
}

export interface FootballNewsLoad {
  items: NewsItem[];
  error?: string;
}

export async function fetchFootballNews(
  selectedSources: NewsSourceId[] = [...defaultNewsSources],
): Promise<NewsItem[]> {
  return (await fetchFootballNewsWithStatus(selectedSources)).items;
}

export async function fetchFootballNewsWithStatus(
  selectedSources: NewsSourceId[] = [...defaultNewsSources],
): Promise<FootballNewsLoad> {
  const sources = normalizeNewsSources(selectedSources);
  if (!sources.length) return { items: [] };
  const results = await Promise.allSettled(sources.map((source) => fetchFeed(source)));
  const successful = results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  );
  const failedSources: NewsSourceId[] = [];
  const successfulSources: NewsSourceId[] = [];
  results.forEach((result, index) => {
    const source = sources[index];
    if (!source) return;
    (result.status === 'fulfilled' ? successfulSources : failedSources).push(source);
  });
  if (!successfulSources.length)
    throw new Error(`All selected football news sources failed (${sourceNames(failedSources)}).`);

  const unique = new Map<string, NewsItem>();
  for (const item of successful) if (!unique.has(item.url)) unique.set(item.url, item);
  const items = [...unique.values()]
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, 10);
  return {
    items,
    ...(failedSources.length
      ? {
          error: `${sourceNames(failedSources)} ${failedSources.length === 1 ? 'is' : 'are'} unavailable; showing available headlines from ${sourceNames(successfulSources)}.`,
        }
      : {}),
  };
}

function sourceNames(sources: NewsSourceId[]): string {
  return sources.map((source) => sourceDetails[source].name).join(' and ');
}

async function fetchFeed(source: NewsSourceId): Promise<NewsItem[]> {
  const details = sourceDetails[source];
  const response = await fetch(details.url, {
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: { accept: 'application/rss+xml, application/xml, text/xml' },
  });
  if (!response.ok) throw new Error(`${details.name} news source failed (${response.status}).`);
  const xml = await readBoundedText(response, 1_000_000);
  const entries = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  if (!entries.length) throw new Error(`${details.name} news source returned no RSS entries.`);
  const items = entries
    .slice(0, 20)
    .flatMap((match) => {
      const item = match[1];
      if (!item) return [];
      const title = xmlText(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
      const url = xmlText(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1]);
      const publishedAt = xmlText(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]);
      if (source === 'fox' && /<category>\s*betting\s*<\/category>/i.test(item)) return [];
      return {
        title,
        url,
        publishedAt: Number.isNaN(Date.parse(publishedAt))
          ? new Date().toISOString()
          : new Date(publishedAt).toISOString(),
        source: details.name,
      };
    })
    .filter((item) => item.title.length > 0 && item.title.length <= 500 && isSafeNewsUrl(item.url));
  if (!items.length) throw new Error(`${details.name} news source returned no usable headlines.`);
  return items;
}

function isSafeNewsUrl(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Cache and coalesce feed requests; a failed refresh keeps usable cached headlines. */
export class FootballNewsCache {
  private cachedItems: NewsItem[] = [];
  private refreshedAtMs = 0;
  private refreshRequest: Promise<FootballNewsSnapshot> | undefined;
  private lastFailureAtMs: number | undefined;
  private lastFailureMessage: string | undefined;
  private lastPartialError: string | undefined;
  private sources: NewsSourceId[] = [...defaultNewsSources];
  private sourceVersion = 0;

  constructor(
    private readonly load: (
      sources: NewsSourceId[],
    ) => Promise<NewsItem[] | FootballNewsLoad> = fetchFootballNewsWithStatus,
    private maxAgeMs = defaultCacheMs,
    private readonly now: () => number = Date.now,
  ) {}

  setRefreshIntervalMinutes(minutes: number): void {
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440)
      throw new Error('News refresh interval must be between 5 and 1,440 minutes.');
    this.maxAgeMs = minutes * 60_000;
  }

  setSources(input: unknown): void {
    const sources = normalizeNewsSources(input);
    if (
      sources.length === this.sources.length &&
      sources.every((source, index) => source === this.sources[index])
    )
      return;
    this.sources = sources;
    this.sourceVersion += 1;
    this.cachedItems = [];
    this.refreshedAtMs = 0;
    this.lastFailureAtMs = undefined;
    this.lastFailureMessage = undefined;
    this.lastPartialError = undefined;
    this.refreshRequest = undefined;
  }

  async get(forceRefresh = false): Promise<FootballNewsSnapshot> {
    if (!this.sources.length) return this.snapshot('No football news source is enabled.');
    const isStale = !this.refreshedAtMs || this.now() - this.refreshedAtMs >= this.maxAgeMs;
    if (!forceRefresh && !isStale) return this.snapshot(this.lastPartialError);
    if (
      !forceRefresh &&
      this.lastFailureAtMs !== undefined &&
      this.now() - this.lastFailureAtMs < Math.min(this.maxAgeMs, 60_000)
    )
      return this.snapshot(this.lastFailureMessage);
    if (this.refreshRequest) return this.refreshRequest;

    const version = this.sourceVersion;
    const sources = [...this.sources];
    const request = Promise.resolve()
      .then(() => this.load(sources))
      .then((loaded) => {
        if (version !== this.sourceVersion)
          return this.snapshot(
            'News source selection changed; refresh the feed to load current sources.',
          );
        const result = Array.isArray(loaded) ? { items: loaded } : loaded;
        this.cachedItems = result.items;
        this.refreshedAtMs = this.now();
        this.lastFailureAtMs = undefined;
        this.lastFailureMessage = undefined;
        this.lastPartialError = result.error;
        return this.snapshot(this.lastPartialError);
      })
      .catch(() => {
        if (version !== this.sourceVersion)
          return this.snapshot(
            'News source selection changed; refresh the feed to load current sources.',
          );
        this.lastFailureAtMs = this.now();
        this.lastFailureMessage = this.cachedItems.length
          ? 'News refresh failed; showing the last cached headlines.'
          : 'Football news is temporarily unavailable.';
        this.lastPartialError = undefined;
        return this.snapshot(this.lastFailureMessage);
      })
      .finally(() => {
        if (this.refreshRequest === request) this.refreshRequest = undefined;
      });
    this.refreshRequest = request;
    return request;
  }

  private snapshot(error?: string): FootballNewsSnapshot {
    const refreshedAtMs = this.refreshedAtMs;
    const result: FootballNewsSnapshot = {
      items: structuredClone(this.cachedItems),
      stale:
        this.sources.length > 0 && (!refreshedAtMs || this.now() - refreshedAtMs >= this.maxAgeMs),
      ...(refreshedAtMs ? { refreshedAt: new Date(refreshedAtMs).toISOString() } : {}),
      ...(error ? { error } : {}),
    };
    return result;
  }
}

function xmlText(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}
