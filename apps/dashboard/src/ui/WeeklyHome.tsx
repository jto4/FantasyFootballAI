import { useEffect, useState } from 'react';
import { requestJson } from './api-client';
import {
  leagueSyncFreshness,
  type AdviceMode,
  type AppSettings,
  type LeagueConnection,
} from '@sidekick/core';
import { formatDateTime } from './date-format';
export function WeeklyHome({
  league,
  settings,
  teamId,
  onTeamChange,
  onAdvice,
  onRefresh,
  onSetup,
  onSavedAdvice,
}: {
  league: LeagueConnection | undefined;
  settings: AppSettings;
  teamId?: string | undefined;
  onTeamChange: (id: string) => void;
  onAdvice: (mode: AdviceMode) => void;
  onRefresh: () => void;
  onSetup: () => void;
  onSavedAdvice: (id: string, mode: AdviceMode) => void;
}) {
  const [decisions, setDecisions] = useState<
    { id: string; mode: AdviceMode; headline: string; createdAt: string }[]
  >([]);
  const [decisionError, setDecisionError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setDecisions([]);
    setDecisionError('');
    if (league && teamId)
      void requestJson(
        `/api/advice/weekly?${new URLSearchParams({ league: league.id, team: teamId })}`,
        isWeeklyDecisions,
        { signal: controller.signal },
      )
        .then((data) => {
          if (!controller.signal.aborted) setDecisions(data.items);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setDecisionError('Saved decisions could not be loaded. Open Advice to review them.');
        });
    return () => controller.abort();
  }, [league?.id, league?.lastSyncedAt, teamId]);
  const team = league?.teams.find((t) => t.id === teamId);
  const freshness = league
    ? leagueSyncFreshness(league, Date.now(), (settings.leagueStaleAfterHours ?? 24) * 3600000)
    : 'unknown';
  const alerts =
    team?.roster?.filter(
      (p) =>
        p.injuryStatus || (p.status && !['active', 'healthy'].includes(p.status.toLowerCase())),
    ) ?? [];
  const week =
    typeof league?.settings.currentWeek === 'number' ? league.settings.currentWeek : undefined;
  const starters =
    league?.matchups
      ?.filter((m) => m.week === week)
      .flatMap((m) =>
        m.teams.filter((t) => t.teamId === teamId).flatMap((t) => t.starters ?? []),
      ) ?? [];
  const incomplete =
    !team?.roster || team.rosterSize === undefined || team.rosterSize !== team.roster.length;
  return (
    <section className="weekly-home" aria-labelledby="weekly-home-title">
      <div className="weekly-home-heading">
        <div>
          <p className="section-overline">YOUR WEEK{week ? ` · WEEK ${week}` : ''}</p>
          <h2 id="weekly-home-title">What needs your attention?</h2>
        </div>
        {league && (
          <label>
            Your team
            <select value={teamId ?? ''} onChange={(e) => onTeamChange(e.target.value)}>
              <option value="">Choose your team</option>
              {league.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!league ? (
        <p>
          Connect a league to get started.{' '}
          <button className="text-button" onClick={onSetup}>
            Connect my league
          </button>
        </p>
      ) : (
        <>
          <p className={freshness === 'fresh' ? 'connection-success' : 'field-warning'}>
            {freshness === 'fresh'
              ? 'Roster snapshot is recent.'
              : freshness === 'stale'
                ? 'Roster snapshot needs a refresh.'
                : 'Roster freshness is unverified.'}
            {league.lastSyncedAt ? ` Last synced ${formatDateTime(league.lastSyncedAt)}.` : ''}{' '}
            <button className="text-button" onClick={onRefresh}>
              Refresh roster
            </button>
          </p>
          {!team ? (
            <p>Choose your team to get started.</p>
          ) : (
            <>
              <div className="weekly-home-grid">
                <article>
                  <h3>Lineup check</h3>
                  <p>
                    {incomplete
                      ? 'Roster incomplete · refresh first.'
                      : starters.length
                        ? `${starters.length} recorded starters.`
                        : 'Starter assignments unknown.'}
                  </p>
                  <button className="primary-button" onClick={() => onAdvice('lineup')}>
                    Check my lineup
                  </button>
                </article>
                <article>
                  <h3>Availability to review</h3>
                  {alerts.length ? (
                    <ul>
                      {alerts.slice(0, 5).map((p) => (
                        <li key={p.id}>
                          {p.name}: {p.injuryStatus || p.status}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No availability flags are recorded in this roster. This does not establish
                      that everyone is healthy.
                    </p>
                  )}
                  <p>Saved flags · verify playing status in Advice.</p>
                </article>
                <article>
                  <h3>Waivers and trades</h3>
                  <p>No verified deadline. Check priority and FAAB on your platform.</p>
                  <button className="small-button" onClick={() => onAdvice('waivers')}>
                    Find waiver pickups
                  </button>{' '}
                  <button className="text-button" onClick={() => onAdvice('trade')}>
                    Compare a trade
                  </button>
                </article>
              </div>
              <section>
                <h3>Saved decisions to revisit</h3>
                {decisionError ? (
                  <p role="status">{decisionError}</p>
                ) : decisions.length ? (
                  <ul>
                    {decisions.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => onSavedAdvice(d.id, d.mode)}
                        >
                          {d.headline}
                        </button>{' '}
                        · {formatDateTime(d.createdAt)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No saved decisions this week.</p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </section>
  );
}

function isWeeklyDecisions(
  value: unknown,
): value is { items: { id: string; mode: AdviceMode; headline: string; createdAt: string }[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rows = (value as { items?: unknown }).items;
  return (
    Array.isArray(rows) &&
    rows.length <= 5 &&
    rows.every(
      (r) =>
        r &&
        typeof r === 'object' &&
        typeof r.id === 'string' &&
        r.id.length <= 160 &&
        ['lineup', 'trade', 'waivers'].includes(r.mode) &&
        typeof r.headline === 'string' &&
        r.headline.length <= 500 &&
        typeof r.createdAt === 'string' &&
        Number.isFinite(Date.parse(r.createdAt)),
    )
  );
}
