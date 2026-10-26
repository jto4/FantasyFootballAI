import { record } from '@sidekick/core';
import { PlayerName } from './PlayerCard';
import { useApi } from './hooks/useApi';
import { ErrorNotice } from './ErrorNotice';
import { LoadingStatus } from './LoadFeedback';
import { points } from './weekly-briefing';

type Watchlist = {
  items: {
    id: string;
    name: string;
    position: string;
    nflTeam?: string;
    status?: string;
    rosteredBy: string;
    projected?: number;
    range?: { low: number; high: number };
  }[];
};
const isWatchlist = (value: unknown): value is Watchlist =>
  record(value) &&
  Array.isArray(value.items) &&
  value.items.length <= 100 &&
  value.items.every(
    (item) => record(item) && typeof item.name === 'string' && typeof item.rosteredBy === 'string',
  );
const flagged = (status?: string) =>
  Boolean(status && !/^(active|healthy|normal)$/i.test(status.trim()));

/** Watched players for this league: who has them, this week's projection and status. */
export function WatchlistCard({
  leagueId,
  teamId,
  count,
  onManage,
}: {
  leagueId: string;
  teamId: string;
  count: number;
  onManage: () => void;
}) {
  const { data, error, loading, reload } = useApi(
    count
      ? `/api/advice/watchlist?${new URLSearchParams({ league: leagueId, team: teamId })}`
      : undefined,
    isWatchlist,
    { timeoutMs: 60_000 },
  );
  return (
    <section className="watchlist-card" aria-labelledby="watchlist-title">
      <div className="section-heading">
        <h3 id="watchlist-title">Watchlist</h3>
        <button type="button" className="text-button" onClick={onManage}>
          {count ? 'Edit' : 'Add players'}
        </button>
      </div>
      {!count ? (
        <p>
          Follow players you might trade for or pick up; they show here with this week’s projection.
        </p>
      ) : error ? (
        <ErrorNotice error={error} onRetry={reload} compact />
      ) : loading && !data ? (
        <LoadingStatus message="Checking your watchlist…" shape="rows" />
      ) : (
        <ul>
          {data?.items.map((item) => (
            <li key={item.id}>
              <span>
                <strong>
                  <PlayerName id={item.id} name={item.name} />
                </strong>{' '}
                <small>
                  {item.position}
                  {item.nflTeam ? ` · ${item.nflTeam}` : ''} · {item.rosteredBy}
                </small>
              </span>
              <span className={flagged(item.status) ? 'field-warning' : ''}>
                {flagged(item.status)
                  ? item.status
                  : item.projected !== undefined
                    ? `${points(item.projected)}${item.range ? ` (${item.range.low.toFixed(0)}–${item.range.high.toFixed(0)})` : ''}`
                    : 'No estimate'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
