import { useEffect, useState } from 'react';
import { formatDateTime } from './date-format';

type Entry = { at: string; title: string; body: string; hash?: string };

/** Game-day notifications the desktop app has shown, so a missed one can be read again. */
export function NotificationHistory() {
  const [entries, setEntries] = useState<Entry[]>();
  const read =
    typeof window === 'undefined' ? undefined : window.sidekickDesktop?.getNotificationHistory;
  useEffect(() => {
    if (!read) return;
    let active = true;
    read()
      .then((list) => active && setEntries(list.slice(0, 20)))
      .catch(() => active && setEntries([]));
    return () => {
      active = false;
    };
  }, [read]);
  if (!read) return null;
  return (
    <section
      className="personalize-block"
      data-search-target="notification-history"
      tabIndex={-1}
      aria-labelledby="notification-history-title"
    >
      <h3 id="notification-history-title">Recent alerts</h3>
      {!entries ? (
        <small>Loading…</small>
      ) : !entries.length ? (
        <small>No alerts yet. Game-day alerts you receive are listed here.</small>
      ) : (
        <ul className="notification-history">
          {entries.map((entry) => (
            <li key={`${entry.at}${entry.title}`}>
              <strong>{entry.hash ? <a href={entry.hash}>{entry.title}</a> : entry.title}</strong>
              <span>{entry.body}</span>
              <small>{formatDateTime(entry.at)}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
