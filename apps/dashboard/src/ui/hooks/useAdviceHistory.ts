import { useEffect, useState } from 'react';
import { requestJson, ApiError } from '../api-client';
import { isAdviceHistory, type AdviceSummary } from '../advice-data';

/** Saved advice summaries; bump `reload` after saving or deleting to read them again. */
export function useAdviceHistory() {
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<AdviceSummary[]>([]);
  const [historyError, setHistoryError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    requestJson('/api/advice', isAdviceHistory, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setHistory(data.items);
        setHistoryError('');
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setHistoryError(
          failure instanceof ApiError || failure instanceof Error
            ? failure.message
            : 'Advice could not be loaded. Try again.',
        );
      });
    return () => controller.abort();
  }, [revision]);
  return { history, historyError, reload: () => setRevision((value) => value + 1) };
}
