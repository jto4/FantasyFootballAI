import { useState } from 'react';
import { isNewsSnapshot, type NewsSnapshot } from '../app-state';

const unavailable = (current: NewsSnapshot): NewsSnapshot => ({
  ...current,
  stale: true,
  error: 'Football news is temporarily unavailable.',
});

/** The saved news feed, refreshed on demand; a failed read keeps the stories already shown. */
export function useFootballNews(onRefreshFailed: (error: unknown) => void) {
  const [news, setNews] = useState<NewsSnapshot>({ items: [], stale: true });
  const [refreshing, setRefreshing] = useState(false);
  return {
    news,
    refreshing,
    /** Takes the startup request's result, which runs alongside the app's other first reads. */
    async receive(response: PromiseSettledResult<Response>) {
      if (response.status !== 'fulfilled' || !response.value.ok) return setNews(unavailable);
      try {
        const snapshot: unknown = await response.value.json();
        setNews(
          isNewsSnapshot(snapshot)
            ? snapshot
            : { items: [], stale: true, error: 'Football news returned an invalid response.' },
        );
      } catch {
        setNews(unavailable);
      }
    },
    async refresh() {
      setRefreshing(true);
      try {
        const response = await fetch('/api/news/refresh', { method: 'POST' });
        const result = (await response.json()) as NewsSnapshot;
        if (!response.ok) throw new Error(result.error ?? 'Could not refresh football news.');
        setNews(result);
      } catch (error) {
        onRefreshFailed(error);
      } finally {
        setRefreshing(false);
      }
    },
  };
}
