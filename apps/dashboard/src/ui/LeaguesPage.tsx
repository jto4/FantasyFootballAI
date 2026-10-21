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
}) {
  const staleAfterMs = (staleAfterHours ?? defaultLeagueStaleAfterHours) * 60 * 60 * 1_000;

  return (
    <>
      <div className="page-title-block">
        <div>
          <p className="section-overline">YOUR COMPETITIONS</p>
          <h1>Leagues</h1>
          <p>Saved league data stay on this computer.</p>
        </div>
        <button className="primary-button" onClick={onConnect}>
          <Plus size={15} /> Connect a league
        </button>
      </div>
      <div className="management-list">
        {leagues.map((league) => {
          const freshness = leagueSyncFreshness(league, Date.now(), staleAfterMs);
          const isActive = league.id === activeLeagueId;

          return (
            <article className="management-row" key={league.id}>
              <div className="league-avatar">{league.displayName.slice(0, 1)}</div>
              <div className="management-copy">
                <strong>{league.displayName}</strong>
                <span>
                  {platformName(league.platform)} · {league.teamCount} teams ·{' '}
                  {Object.keys(league.scoring).length
                    ? `${Object.keys(league.scoring).length} scoring rules`
                    : 'scoring details unavailable'}
                </span>
                {league.connectionMode === 'snapshot' && (
                  <small>
                    Imported{' '}
                    {league.snapshotImportedAt
                      ? new Date(league.snapshotImportedAt).toLocaleString()
                      : 'at an unknown time'}
                    . Automatic refresh isn’t available for imports; re-import to update.
                  </small>
                )}
                {league.lastSyncError && <small>Last refresh failed: {league.lastSyncError}</small>}
                <small>
                  {freshness !== 'unknown' && league.lastSyncedAt
                    ? `Last successful refresh ${new Date(league.lastSyncedAt).toLocaleString()}`
                    : 'Successful refresh time unavailable'}
                </small>
                {freshness === 'stale' && (
                  <small className="sync-stale" role="status">
                    Saved league data is older than your configured warning threshold. Refresh
                    before relying on this data.
                  </small>
                )}
              </div>
              <span className="credential-status ready">
                {league.connectionMode === 'snapshot'
                  ? 'IMPORTED SNAPSHOT'
                  : league.status === 'limited'
                    ? 'LIMITED DATA'
                    : 'CONNECTED'}
              </span>
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
                className="small-button"
                onClick={() => onRefresh(league.id)}
                disabled={refreshingLeagueId === league.id || disconnectingLeagueId === league.id}
              >
                <RefreshCw size={14} />{' '}
                {refreshingLeagueId === league.id
                  ? 'Refreshing…'
                  : league.connectionMode === 'snapshot'
                    ? 'Import update'
                    : 'Refresh'}
              </button>
              <button
                className="small-button danger"
                onClick={() => onDisconnect(league.id)}
                disabled={disconnectingLeagueId === league.id || refreshingLeagueId === league.id}
                aria-label={`Disconnect ${league.displayName}`}
              >
                <Trash2 size={14} />{' '}
                {disconnectingLeagueId === league.id ? 'Disconnecting…' : 'Disconnect'}
              </button>
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
