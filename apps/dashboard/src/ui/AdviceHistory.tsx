import { useState } from 'react';
import type { AdviceSummary } from './advice-data';
import { adviceTitle } from './advice-navigation';
import { formatDateTime } from './date-format';

/** The Saved advice list; opening an item navigates to it without calling the AI again. */
export function AdviceHistory({
  hidden,
  history,
  historyError,
  onRefresh,
  onOpen,
}: {
  hidden: boolean;
  history: AdviceSummary[];
  historyError: string;
  onRefresh: () => void;
  onOpen: (item: AdviceSummary) => void;
}) {
  const [limit, setLimit] = useState(5);
  return (
    <section hidden={hidden} className="advice-history" aria-labelledby="advice-history-title">
      <h2 id="advice-history-title">Saved advice</h2>
      <p>Saved locally. Opening a result does not call the AI again.</p>
      {historyError && <p role="alert">{historyError}</p>}
      <button className="text-button" type="button" onClick={onRefresh}>
        Refresh saved advice
      </button>
      {!history.length && !historyError && <p>Your completed analyses will appear here.</p>}
      <ul>
        {history.slice(0, limit).map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => onOpen(item)}>
              <strong>{item.headline}</strong>
              <span>
                {adviceTitle(item.mode)} · {formatDateTime(item.createdAt)} ·{' '}
                {item.confidenceLabel
                  ? `${item.confidenceLabel} evidence confidence`
                  : 'Evidence details in result'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {history.length > limit && (
        <button type="button" className="small-button" onClick={() => setLimit((n) => n + 5)}>
          Show more saved advice
        </button>
      )}
    </section>
  );
}
