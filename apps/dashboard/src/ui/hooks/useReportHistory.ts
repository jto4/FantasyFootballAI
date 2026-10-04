import { useEffect, useState } from 'react';
import { isReportPage, type ReportSummary } from '@sidekick/core';
import { requestJson } from '../api-client';
export function useReportHistory(league: string, status: string, revision: string) {
  const [items, setItems] = useState<ReportSummary[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [pageCursor, setPageCursor] = useState<string>();
  useEffect(() => {
    setPageCursor(undefined);
  }, [league, status, revision]);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ limit: '20' });
    if (league !== 'all') query.set('leagueId', league);
    if (status !== 'all') query.set('status', status);
    if (pageCursor) query.set('cursor', pageCursor);
    void requestJson(`/api/report-history?${query}`, isReportPage, { signal: abort.signal })
      .then((page) => {
        setItems((current) =>
          pageCursor
            ? [
                ...current,
                ...page.items.filter(
                  (item) => !current.some((existing) => existing.id === item.id),
                ),
              ]
            : page.items,
        );
        setCursor(page.nextCursor);
        setTotal(page.total);
      })
      .catch((failure) => {
        if (!abort.signal.aborted)
          setError(failure instanceof Error ? failure.message : 'Could not load report history.');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [league, status, pageCursor, revision, reload]);
  return {
    items,
    cursor,
    total,
    loading,
    error,
    loadMore: () => setPageCursor(cursor),
    retry: () => setReload((value) => value + 1),
  };
}
