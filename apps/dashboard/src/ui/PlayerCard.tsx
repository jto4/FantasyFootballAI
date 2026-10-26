import { createContext, useContext, useState, type ReactNode } from 'react';
import { record, type UserPreferences } from '@sidekick/core';
import { useApi } from './hooks/useApi';
import { Dialog } from './Dialog';
import { LoadingStatus } from './LoadFeedback';
import { ErrorNotice } from './ErrorNotice';
import { formatDateTime } from './date-format';
import './player-card.css';

type Card = {
  leagueId: string;
  week: number;
  id: string;
  name: string;
  position: string;
  nflTeam?: string;
  status?: string;
  projected?: number;
  playChance?: number;
  range?: { low: number; high: number };
  matchup?: { opponent: string; home: boolean; date: string };
  recent: number[];
  numbers: { label: string; value: number; unit: string }[];
  rosteredBy: string;
  starting: boolean;
  started?: boolean;
  news: { title: string; source: string; url: string; publishedAt: string }[];
};
export const isPlayerCard = (x: unknown): x is Card =>
  record(x) &&
  typeof x.id === 'string' &&
  typeof x.name === 'string' &&
  Array.isArray(x.recent) &&
  Array.isArray(x.numbers) &&
  Array.isArray(x.news);
type Dynasty = { format: string; value?: number; positionRank?: number; age?: number };
const isDynasty = (x: unknown): x is Dynasty => record(x) && typeof x.format === 'string';

type Target = { playerId: string; name: string };
type Host = {
  leagueId?: string | undefined;
  teamId?: string | undefined;
  preferences?: UserPreferences | undefined;
  savePreferences?: ((next: UserPreferences) => Promise<void>) | undefined;
  onNudge?: (() => void) | undefined;
  onProps?: ((name: string) => void) | undefined;
  open: (target: Target) => void;
};
const PlayerCardContext = createContext<Host | undefined>(undefined);

/** Makes every `PlayerName` inside open the player card for the active league and team. */
export function PlayerCardProvider({
  children,
  ...host
}: Omit<Host, 'open'> & { children: ReactNode }) {
  const [target, setTarget] = useState<Target>();
  const value: Host = { ...host, open: setTarget };
  return (
    <PlayerCardContext.Provider value={value}>
      {children}
      {target && host.leagueId && host.teamId && (
        <PlayerCardDialog
          host={value}
          leagueId={host.leagueId}
          teamId={host.teamId}
          target={target}
          onClose={() => setTarget(undefined)}
        />
      )}
    </PlayerCardContext.Provider>
  );
}

/** A player's name that opens his card; plain text where no card is available. */
export function PlayerName({ id, name }: { id: string; name: string }) {
  const host = useContext(PlayerCardContext);
  if (!host?.leagueId || !host.teamId) return <>{name}</>;
  return (
    <button
      type="button"
      className="player-name-link"
      onClick={() => host.open({ playerId: id, name })}
    >
      {name}
    </button>
  );
}

const num = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);

function PlayerCardDialog({
  host,
  leagueId,
  teamId,
  target,
  onClose,
}: {
  host: Host;
  leagueId: string;
  teamId: string;
  target: Target;
  onClose: () => void;
}) {
  const query = new URLSearchParams({ league: leagueId, team: teamId, player: target.playerId });
  const {
    data: card,
    error,
    loading,
    reload,
  } = useApi(`/api/players/card?${query}`, isPlayerCard, {
    timeoutMs: 60_000,
    errorMessage: 'Player details could not be loaded.',
  });
  const { data: dynasty } = useApi(
    `/api/dynasty/player?${new URLSearchParams({ league: leagueId, player: target.playerId })}`,
    isDynasty,
    { timeoutMs: 60_000 },
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>();
  const watchlist = host.preferences?.watchlist ?? [];
  const watched = watchlist.some((w) => w.leagueId === leagueId && w.playerId === target.playerId);
  async function toggleWatch() {
    if (!host.savePreferences) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      await host.savePreferences({
        ...host.preferences,
        watchlist: watched
          ? watchlist.filter((w) => !(w.leagueId === leagueId && w.playerId === target.playerId))
          : [...watchlist, { leagueId, playerId: target.playerId, name: target.name }].slice(
              0,
              100,
            ),
      });
    } catch (failure) {
      setSaveError(failure);
    } finally {
      setSaving(false);
    }
  }
  const max = Math.max(1, ...(card?.recent ?? []));
  return (
    <Dialog titleId="player-card-title" onClose={onClose} className="player-card-drawer">
      <header className="player-card-head">
        <div>
          <p className="section-overline">
            {card ? `${card.position}${card.nflTeam ? ` · ${card.nflTeam}` : ''}` : 'PLAYER'}
          </p>
          <h2 id="player-card-title">{card?.name ?? target.name}</h2>
          {card && (
            <p className="player-card-sub">
              {card.rosteredBy === 'You'
                ? card.starting
                  ? 'On your team · starting'
                  : 'On your team · bench'
                : card.rosteredBy === 'Free agent'
                  ? 'Free agent'
                  : `Rostered by ${card.rosteredBy}`}
              {card.status ? ` · ${card.status}` : ''}
            </p>
          )}
        </div>
        <button type="button" className="text-button" onClick={onClose}>
          Close
        </button>
      </header>
      {loading && !card && <LoadingStatus message="Pulling his numbers…" />}
      {error && <ErrorNotice error={error} onRetry={reload} />}
      {card && (
        <div className="player-card-body">
          <section className="player-card-projection" aria-label="This week">
            <span>Week {card.week}</span>
            <strong>
              {card.projected !== undefined ? num(card.projected) : card.started ? 'Played' : '—'}
            </strong>
            <small>
              {card.started
                ? 'His game has started; Live has his points.'
                : card.range
                  ? `Likely ${num(card.range.low)}–${num(card.range.high)}`
                  : 'No estimate yet'}
              {card.playChance !== undefined && !card.started
                ? ` · ${Math.round(card.playChance * 100)}% to play (Questionable)`
                : ''}
            </small>
            {card.matchup && (
              <small>
                {card.matchup.home ? 'vs' : 'at'} {card.matchup.opponent} ·{' '}
                {formatDateTime(card.matchup.date)}
              </small>
            )}
          </section>
          {card.recent.length > 0 && (
            <section aria-labelledby="player-card-recent">
              <h3 id="player-card-recent">Recent games (latest first)</h3>
              <ol className="player-card-bars">
                {card.recent.map((points, i) => (
                  <li key={i} title={`${num(points)} points`}>
                    <span
                      style={{ height: `${Math.max(4, (Math.max(0, points) / max) * 64)}px` }}
                    />
                    <small>{num(points)}</small>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {card.numbers.length > 0 && (
            <section aria-labelledby="player-card-numbers">
              <h3 id="player-card-numbers">Behind the projection</h3>
              <dl className="player-card-numbers">
                {card.numbers.map((n) => (
                  <div key={n.label}>
                    <dt>{n.label}</dt>
                    <dd>
                      {num(n.value)} {n.unit === 'percent' ? '%' : n.unit}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {dynasty?.value !== undefined && (
            <section aria-labelledby="player-card-dynasty">
              <h3 id="player-card-dynasty">Long-term value</h3>
              <p>
                {num(dynasty.value)} over this season and the next three
                {dynasty.positionRank ? ` · #${dynasty.positionRank} ${card.position}` : ''}
                {dynasty.age !== undefined ? ` · age ${Math.floor(dynasty.age)}` : ''}
              </p>
            </section>
          )}
          <section aria-labelledby="player-card-news">
            <h3 id="player-card-news">In the news</h3>
            {card.news.length ? (
              <ul className="player-card-news">
                {card.news.map((item) => (
                  <li key={item.url}>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.title}
                    </a>
                    <small>
                      {item.source} · {formatDateTime(item.publishedAt)}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="player-card-muted">No recent headlines name him.</p>
            )}
          </section>
          <div className="player-card-actions">
            {host.savePreferences && (
              <button
                type="button"
                className="small-button"
                disabled={saving}
                onClick={() => void toggleWatch()}
              >
                {watched ? 'Stop watching' : 'Watch'}
              </button>
            )}
            {host.onNudge && (
              <button type="button" className="text-button" onClick={host.onNudge}>
                Nudge his projection
              </button>
            )}
            {host.onProps && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  host.onProps!(card.name);
                  onClose();
                }}
              >
                See his props
              </button>
            )}
          </div>
          {saveError !== undefined && <ErrorNotice error={saveError} compact />}
        </div>
      )}
    </Dialog>
  );
}
