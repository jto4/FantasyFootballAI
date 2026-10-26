import { platformName } from './platform-name';
import { Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import {
  defaultLeagueStaleAfterHours,
  leagueSyncFreshness,
  type LeagueConnection,
} from '@sidekick/core';

export function LeaguesPage({
  leagues,
  activeLeagueId,
  staleAfterHours,
  refreshingLeagueId,
  disconnectingLeagueId,
  onConnect,
  onSetActive,
  onRefresh,
  onDisconnect,
  onAddEspnLogin,
}: {
  leagues: LeagueConnection[];
  activeLeagueId?: string;
  staleAfterHours?: number;
  refreshingLeagueId: string;
  disconnectingLeagueId: string;
  onConnect: () => void;
  onSetActive: (leagueId: string) => void;
  onRefresh: (leagueId: string) => void;
  onDisconnect: (leagueId: string) => void;
  onAddEspnLogin?: () => void;
}) {
  const staleAfterMs = (staleAfterHours ?? defaultLeagueStaleAfterHours) * 60 * 60 * 1_000;

  return (
    <>
      <div className="page-title-block">
        <div>
          <p className="section-overline">YOUR COMPETITIONS</p>
          <h1>Leagues</h1>
          <p>Saved league data stay on this computer, where your shame is private.</p>
        </div>
        <button className="primary-button" onClick={onConnect}>
          <Plus size={15} /> Connect a league
        </button>
      </div>
      <div className="management-list">
        {leagues.map((league) => {
          const freshness = leagueSyncFreshness(league, Date.now(), staleAfterMs);
          const isActive = league.id === activeLeagueId;

          const imported = league.connectionMode === 'snapshot';
          const updatedAt = imported ? league.snapshotImportedAt : league.lastSyncedAt;
          const stale =
            freshness === 'stale' ||
            (imported && (!updatedAt || Date.now() - Date.parse(updatedAt) > staleAfterMs));
          const refreshing = refreshingLeagueId === league.id;
          const disconnecting = disconnectingLeagueId === league.id;
          return (
            <article
              className={`league-card${isActive ? ' active' : ''}${stale ? ' stale' : ''}`}
              key={league.id}
            >
              <header>
                <div className="league-avatar">{league.displayName.slice(0, 1)}</div>
                <div className="management-copy">
                  <strong>{league.displayName}</strong>
                  <span>
                    {platformName(league.platform)} · {league.teamCount} teams ·{' '}
                    {Object.keys(league.scoring).length
                      ? `${Object.keys(league.scoring).length} scoring rules`
                      : 'scoring details unavailable'}
                  </span>
                </div>
                <span
                  className={`league-chip ${imported ? 'imported' : league.status === 'limited' ? 'limited' : 'live'}`}
                >
                  {imported ? 'Imported' : league.status === 'limited' ? 'Limited data' : 'Live'}
                </span>
              </header>
              <p
                className={`league-freshness${stale ? ' stale' : ''}`}
                role={stale ? 'status' : undefined}
              >
                {updatedAt
                  ? `${imported ? 'Imported' : 'Updated'} ${relativeAge(updatedAt)}`
                  : imported
                    ? 'Import time unknown'
                    : 'Not refreshed yet'}
                {stale
                  ? imported
                    ? ' · out of date. Re-import to use it in reports.'
                    : ' · older than your warning threshold. Refresh before relying on it.'
                  : imported
                    ? ' · imports don’t refresh on their own.'
                    : ' · refreshes automatically around kickoffs.'}
              </p>
              {imported && league.platform === 'espn' && onAddEspnLogin && (
                <p className="league-auto-refresh">
                  To stop re-importing: save your ESPN login once, then connect this league again
                  with its link. It will then refresh on its own around kickoffs.{' '}
                  <button type="button" className="text-button" onClick={onAddEspnLogin}>
                    Add ESPN login
                  </button>{' '}
                  <button type="button" className="text-button" onClick={onConnect}>
                    Connect again
                  </button>
                </p>
              )}
              {league.lastSyncError && (
                <p className="league-error">Last refresh failed: {league.lastSyncError}</p>
              )}
              <div className="league-actions">
                <button
                  className={stale ? 'primary-button' : 'small-button'}
                  onClick={() => onRefresh(league.id)}
                  disabled={refreshing || disconnecting}
                >
                  <RefreshCw size={14} />{' '}
                  {refreshing ? 'Refreshing…' : imported ? 'Re-import' : 'Refresh now'}
                </button>
                <button
                  className="small-button"
                  onClick={() => onSetActive(league.id)}
                  disabled={isActive}
                  aria-pressed={isActive}
                  aria-label={`${isActive ? 'Active' : 'Set as active'} league: ${league.displayName}`}
                >
                  {isActive ? 'Active' : 'Set active'}
                </button>
                <button
                  className="text-button danger-text"
                  onClick={() => onDisconnect(league.id)}
                  disabled={disconnecting || refreshing}
                  aria-label={`Disconnect ${league.displayName}`}
                >
                  <Trash2 size={14} /> {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            </article>
          );
        })}
        {leagues.length === 0 && (
          <div className="empty-state">
            <Users size={23} />
            <strong>No leagues connected yet.</strong>
            <p>Connect Sleeper, ESPN, or Yahoo to bring the league desk to life.</p>
            <button className="primary-button" onClick={onConnect}>
              <Plus size={15} /> Connect a league
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** "3 hours ago" style age; falls back to the date for anything older than two weeks. */
function relativeAge(iso: string, now = Date.now()) {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes)) return 'at an unknown time';
  if (minutes < 1) return 'just now';
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (minutes < 60) return format.format(-minutes, 'minute');
  // Whole hours and days counted down, the same way the header's "updated … ago" counts.
  if (minutes < 48 * 60) return format.format(-Math.floor(minutes / 60), 'hour');
  if (minutes < 14 * 24 * 60) return format.format(-Math.floor(minutes / 1440), 'day');
  return `on ${new Date(iso).toLocaleDateString()}`;
}
