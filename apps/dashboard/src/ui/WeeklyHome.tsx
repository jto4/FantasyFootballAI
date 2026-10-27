import { platformName } from './platform-name';
import { PlayerName } from './PlayerCard';
import { Fragment, useEffect, useState } from 'react';
import { AdviceScorecard } from './AdviceScorecard';
import { NextUpCard } from './NextUpCard';
import { requestJson } from './api-client';
import {
  leagueSyncFreshness,
  orderedHomeCards,
  type AdviceMode,
  type AppSettings,
  type LeagueConnection,
} from '@sidekick/core';
import { formatDateTime } from './date-format';
import { isWeeklyBriefing, points, type WeeklyBriefing } from './weekly-briefing';
import { MatchupCard } from './MatchupCard';
import { faabBid, regularWeeksLeft } from '@sidekick/core';
import { readVisit, saveVisit, visitChanges, visitDigest } from './visit-changes';
import { WatchlistCard } from './WatchlistCard';
export function WeeklyHome({
  league,
  settings,
  teamId,
  onTeamChange,
  onAdvice,
  onRefresh,
  onSavedAdvice,
  onResults,
  onLive,
  onPersonalize,
  onNavigate,
}: {
  /** Opens another page (Start/sit, Trade calculator). */
  onNavigate?: (section: string) => void;
  league: LeagueConnection | undefined;
  settings: AppSettings;
  teamId?: string | undefined;
  onTeamChange: (id: string) => void;
  onAdvice: (mode: AdviceMode) => void;
  onRefresh: () => void;
  onSavedAdvice: (id: string, mode: AdviceMode) => void;
  onResults?: () => void;
  onLive?: () => void;
  /** Opens Settings → Personalize at a setting (for example the watchlist). */
  onPersonalize?: (settingId: string) => void;
}) {
  const [decisions, setDecisions] = useState<
    { id: string; mode: AdviceMode; headline: string; createdAt: string }[]
  >([]);
  const [decisionError, setDecisionError] = useState('');
  const [briefing, setBriefing] = useState<WeeklyBriefing>();
  const [briefingError, setBriefingError] = useState<unknown>();
  const [briefingAttempt, setBriefingAttempt] = useState(0);
  const [changes, setChanges] = useState<{ since: string; lines: string[] }>();
  useEffect(() => {
    const controller = new AbortController();
    setBriefing(undefined);
    setBriefingError(undefined);
    // Deterministic and AI-free; on failure the roster-based cards below still show, and the
    // top card says the check failed instead of claiming all is well.
    if (league && teamId)
      void requestJson(
        `/api/advice/briefing?${new URLSearchParams({ league: league.id, team: teamId })}`,
        isWeeklyBriefing,
        { signal: controller.signal },
        60_000,
      )
        .then((data) => {
          if (controller.signal.aborted) return;
          setBriefing(data);
          // Compare with the last visit, then remember this one for next time.
          const previous = readVisit(league.id, teamId);
          const current = visitDigest(data, new Date().toISOString());
          const rostered = new Set(league.teams.flatMap((t) => (t.roster ?? []).map((p) => p.id)));
          const lines = visitChanges(previous, current, rostered);
          setChanges(lines.length && previous ? { since: previous.at, lines } : undefined);
          saveVisit(league.id, teamId, current);
        })
        .catch((failure: unknown) => {
          if (!controller.signal.aborted) setBriefingError(failure ?? 'The weekly check failed.');
        });
    return () => controller.abort();
  }, [league?.id, league?.lastSyncedAt, teamId, briefingAttempt]);
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
  const cards = orderedHomeCards(settings.preferences);
  const freshness = league
    ? leagueSyncFreshness(league, Date.now(), (settings.leagueStaleAfterHours ?? 24) * 3600000)
    : 'unknown';
  const alerts = team?.roster?.filter((p) => availabilityFlag(p.injuryStatus, p.status)) ?? [];
  const leagueWeek =
    typeof league?.settings.currentWeek === 'number' ? league.settings.currentWeek : undefined;
  const week = briefing?.week ?? leagueWeek;
  const starters =
    league?.matchups
      ?.filter((m) => m.week === leagueWeek)
      .flatMap((m) =>
        m.teams.filter((t) => t.teamId === teamId).flatMap((t) => t.starters ?? []),
      ) ?? [];
  const incomplete =
    !team?.roster || team.rosterSize === undefined || team.rosterSize !== team.roster.length;
  const rosterFreshness = league ? (
    <p className={freshness === 'fresh' ? 'connection-success' : 'field-warning'}>
      {league.connectionMode === 'snapshot'
        ? `Imported from ${platformName(league.platform)}${league.snapshotImportedAt ? ` · ${formatDateTime(league.snapshotImportedAt)}` : ''}.`
        : freshness === 'fresh'
          ? 'Roster snapshot is recent.'
          : freshness === 'stale'
            ? 'Roster snapshot needs a refresh.'
            : 'Last roster update unknown.'}
      {league.lastSyncedAt ? ` Last synced ${formatDateTime(league.lastSyncedAt)}.` : ''}{' '}
      <button className="text-button" onClick={onRefresh}>
        {league.connectionMode === 'snapshot' ? 'Import updated roster' : 'Refresh roster'}
      </button>
    </p>
  ) : null;
  const nextUpShown = cards.some((card) => card.id === 'next-up' && card.visible);
  // Before a league exists the setup card below is the one next step; a second prompt here repeated it.
  if (!league) return null;
  return (
    <section className="weekly-home" aria-labelledby="weekly-home-title">
      <div className="weekly-home-heading">
        <div>
          <p className="section-overline">YOUR WEEK{week ? ` · WEEK ${week}` : ''}</p>
          <h2 id="weekly-home-title">What needs your attention?</h2>
        </div>
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
      </div>
      <>
        {changes && (
          <section className="visit-changes" aria-label="Since your last visit">
            <h3>Since your last visit · {formatDateTime(changes.since)}</h3>
            <ul>
              {changes.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}
        {/* The roster's date and refresh sit under the top card, or first when it is hidden. */}
        {!nextUpShown && rosterFreshness}
        {cards.map((card) => {
          if (!card.visible) return null;
          switch (card.id) {
            case 'next-up':
              return (
                <Fragment key={card.id}>
                  {teamId && onLive && (
                    <NextUpCard
                      leagueId={league.id}
                      teamId={teamId}
                      briefing={briefing}
                      briefingError={briefingError}
                      onRetryBriefing={() => setBriefingAttempt((n) => n + 1)}
                      stale={freshness === 'stale'}
                      onAdvice={onAdvice}
                      onRefresh={onRefresh}
                      onLive={onLive}
                    />
                  )}
                  {rosterFreshness}
                </Fragment>
              );
            case 'matchup':
              return team ? (
                <Fragment key={card.id}>
                  {briefing && (
                    <MatchupCard
                      briefing={briefing}
                      leagueId={league.id}
                      teamId={teamId}
                      {...(onLive ? { onLive } : {})}
                    />
                  )}
                  {briefing?.notes.length ? (
                    <ul className="weekly-notes">
                      {briefing.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                </Fragment>
              ) : null;
            case 'week-summary':
              return team ? (
                <Fragment key={card.id}>
                  <div className="weekly-home-grid">
                    <article>
                      <h3>Lineup check</h3>
                      {briefing?.lineup.changes.length ? (
                        <ul className="weekly-answer">
                          {briefing.lineup.changes.map((change) => (
                            <li key={change.start.id}>
                              <strong>
                                Start <PlayerName id={change.start.id} name={change.start.name} />
                              </strong>{' '}
                              ({points(change.start.points)})
                              {change.bench ? (
                                <>
                                  {' '}
                                  over <PlayerName id={change.bench.id} name={change.bench.name} />
                                  {change.bench.points !== undefined
                                    ? ` (${points(change.bench.points)})`
                                    : ''}
                                </>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : briefing?.lineup.complete ? (
                        <p className="weekly-answer">
                          <strong>Your lineup looks set.</strong>
                          {/* Once some starters have played, project the final, not just who is left. */}
                          {briefing.matchup?.you.starters.some((p) => p.started) &&
                          briefing.matchup.you.projected !== undefined
                            ? ` ${points(briefing.matchup.you.projected)} projected, with ${points(briefing.matchup.you.points ?? 0)} already in.`
                            : briefing.lineup.points !== undefined
                              ? ` ${points(briefing.lineup.points)} projected points.`
                              : ''}
                        </p>
                      ) : (
                        <p>
                          {incomplete
                            ? 'Roster incomplete · refresh first.'
                            : starters.length
                              ? `${starters.length} recorded starters.`
                              : 'Starter assignments unknown.'}
                        </p>
                      )}
                      <div className="weekly-actions">
                        <button className="primary-button" onClick={() => onAdvice('lineup')}>
                          Check my lineup
                        </button>
                        {onNavigate && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => onNavigate('Start/sit')}
                          >
                            Compare players
                          </button>
                        )}
                      </div>
                    </article>
                    <article>
                      <h3>Availability to review</h3>
                      {briefing?.availability.length ? (
                        <ul>
                          {briefing.availability.slice(0, 5).map((p) => (
                            <li key={p.id}>
                              <PlayerName id={p.id} name={p.name} />: {p.status}
                              {p.basis === 'this-week-report' ? ' · this week’s report' : ''}
                            </li>
                          ))}
                        </ul>
                      ) : alerts.length ? (
                        <ul>
                          {alerts.slice(0, 5).map((p) => (
                            <li key={p.id}>
                              {p.name}: {availabilityFlag(p.injuryStatus, p.status)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No injury flags on this roster.</p>
                      )}
                      {alerts.length > 5 && (
                        <p>
                          {alerts.length - 5} more flagged players. Open the lineup check to see
                          all.
                        </p>
                      )}
                      <small>
                        From your last roster update. Check game-day status before kickoff.
                      </small>
                    </article>
                    <article>
                      <h3>Waivers and trades</h3>
                      {briefing?.waivers.length ? (
                        <ul className="weekly-answer">
                          {briefing.waivers.map((w) => {
                            const bid =
                              team?.faabRemaining !== undefined
                                ? faabBid({
                                    gain: w.gain,
                                    weeksLeft: regularWeeksLeft(league, briefing.week),
                                    remaining: team.faabRemaining,
                                  })
                                : undefined;
                            return (
                              <li key={w.id}>
                                <strong>
                                  <PlayerName id={w.id} name={w.name} />
                                </strong>{' '}
                                ({w.position}) · +{points(w.gain)} pts if added
                                {bid ? (
                                  <small className="faab-bid">
                                    {' '}
                                    · bid ${bid.low}–${bid.high}
                                  </small>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                      <p>
                        {team?.faabRemaining !== undefined
                          ? `$${team.faabRemaining} of FAAB left. Bids are a rule of thumb: about 1% of what is left per point he adds over the rest of the regular season.`
                          : `Check your waiver priority and FAAB in ${platformName(league.platform)}.`}
                      </p>
                      <div className="weekly-actions">
                        <button className="small-button" onClick={() => onAdvice('waivers')}>
                          Find waiver pickups
                        </button>
                        {onNavigate && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => onNavigate('Trade calculator')}
                          >
                            Trade calculator
                          </button>
                        )}
                        <button className="text-button" onClick={() => onAdvice('trade')}>
                          Ask AI about a trade
                        </button>
                      </div>
                    </article>
                  </div>
                </Fragment>
              ) : null;
            case 'watchlist':
              return team && teamId ? (
                <WatchlistCard
                  key={card.id}
                  leagueId={league.id}
                  teamId={teamId}
                  count={
                    (settings.preferences?.watchlist ?? []).filter((w) => w.leagueId === league.id)
                      .length
                  }
                  onManage={() => onPersonalize?.('watchlist')}
                />
              ) : null;
            case 'decisions':
              return team ? (
                <Fragment key={card.id}>
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
                </Fragment>
              ) : null;
            case 'scorecard':
              return team && onResults ? (
                <AdviceScorecard key={card.id} onOpen={onResults} />
              ) : null;
            default:
              return null;
          }
        })}
        {!team && <p>Choose your team to get started.</p>}
      </>
    </section>
  );
}

function availabilityFlag(...statuses: (string | undefined)[]) {
  return statuses.find(
    (s) => s?.trim() && !['active', 'healthy', 'normal'].includes(s.trim().toLowerCase()),
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
