import { useEffect, useRef, useState } from 'react';
import { record, type LeagueConnection, type LiveMatchup, type LiveSide } from '@sidekick/core';
import { requestJson } from './api-client';
import { formatDateTime } from './date-format';
import { LoadingStatus } from './LoadFeedback';
import { ErrorNotice } from './ErrorNotice';

type LiveReport = {
  leagueName: string;
  week: number;
  imported: boolean;
  updatedAt?: string;
  importedAt?: string;
  gamesAvailable: boolean;
  matchupWeek?: number;
  matchup?: LiveMatchup;
};
const isLiveReport = (x: unknown): x is LiveReport =>
  record(x) &&
  typeof x.leagueName === 'string' &&
  typeof x.week === 'number' &&
  typeof x.gamesAvailable === 'boolean' &&
  (x.matchup === undefined || (record(x.matchup) && record(x.matchup.you)));
const points = (n?: number) =>
  n === undefined ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);
const stateLabel = { pre: 'Not started', in: 'Playing', post: 'Final', bye: 'Bye', unknown: '' };

function Side({ side, mine }: { side: LiveSide; mine: boolean }) {
  return (
    <section className={`live-side${mine ? ' mine' : ''}`} aria-label={side.name}>
      <header>
        <h2>{side.name}</h2>
        <p className="live-score">{points(side.points)}</p>
        <p className="live-sub">
          {side.projectedFinal !== undefined
            ? `Projected ${points(side.projectedFinal)}`
            : 'Projection needs estimates for every remaining starter'}
          {' · '}
          {side.playing} playing · {side.yetToPlay} yet to play
        </p>
      </header>
      <ul>
        {side.starters.map((s) => (
          <li key={s.id} className={`live-starter ${s.state}`}>
            <span>
              <strong>{s.name}</strong>
              <small>
                {s.position}
                {s.nflTeam ? ` · ${s.nflTeam}` : ''}
              </small>
            </span>
            <span className="live-state">
              {s.detail ?? stateLabel[s.state]}
              {s.state === 'pre' && s.estimate !== undefined ? ` · est. ${points(s.estimate)}` : ''}
            </span>
            {(s.state === 'in' || s.state === 'post') && (
              <span
                className="live-points"
                title={s.livePoints === undefined ? 'These stats can’t be scored yet' : undefined}
              >
                {points(s.livePoints)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sunday view of your matchup; refreshes every minute while open. */
export function LivePage({
  league,
  teamId,
  onLeagues,
  onChooseTeam,
}: {
  league: LeagueConnection | undefined;
  teamId: string | undefined;
  onLeagues: () => void;
  onChooseTeam: (id: string) => void;
}) {
  const [report, setReport] = useState<LiveReport>();
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState<string>();
  const playingRef = useRef<(playing: boolean) => void>(() => undefined);
  useEffect(() => {
    if (!league || !teamId) return;
    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      const signal = controller.signal;
      requestJson(
        `/api/live?${new URLSearchParams({ league: league.id, team: teamId })}`,
        isLiveReport,
        { signal },
        60_000,
      )
        .then((value) => {
          if (signal.aborted) return;
          setReport(value);
          playingRef.current(
            (value.matchup?.you.playing ?? 0) + (value.matchup?.opponent.playing ?? 0) > 0,
          );
          setError('');
          setCheckedAt(new Date().toISOString());
        })
        .catch(
          () => !signal.aborted && setError('Live scores could not be loaded. Retrying shortly.'),
        );
    };
    // Every minute while a starter's game is in progress; every ten minutes otherwise (and right
    // away when the window comes back), so an idle Live tab is not recomputing the matchup.
    let lastLoad = 0;
    let playing = false;
    const loadNow = () => {
      lastLoad = Date.now();
      load();
    };
    loadNow();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (playing || Date.now() - lastLoad >= 10 * 60_000) loadNow();
    }, 60_000);
    const visible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad >= 60_000) loadNow();
    };
    document.addEventListener('visibilitychange', visible);
    playingRef.current = (value) => {
      playing = value;
    };
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      controller.abort();
    };
  }, [league?.id, teamId]);
  const live = report?.matchup;
  return (
    <div className="live-page">
      <div className="page-title-block">
        <div>
          <p className="section-overline">GAME DAY</p>
          <h1>Live</h1>
          <p>
            {report
              ? `${report.leagueName} · Week ${report.week}`
              : 'Your matchup as games play. Refreshing every minute so you don’t have to.'}
            {checkedAt ? ` · checked ${formatDateTime(checkedAt)}` : ''}
          </p>
        </div>
      </div>
      {!league ? (
        <p className="empty-activity">Connect a league to follow your matchup live.</p>
      ) : !teamId ? (
        <section className="live-team-choice" aria-label="Choose your team">
          <h2>Which team is yours?</h2>
          <p>Pick it once and Live, Home and Advice will all follow it.</p>
          <label>
            Your team
            <select defaultValue="" onChange={(event) => onChooseTeam(event.target.value)}>
              <option value="" disabled>
                Choose your team
              </option>
              {league.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : !report && !error ? (
        <LoadingStatus message="Loading your matchup…" shape="cards" />
      ) : null}
      {error && <ErrorNotice error={error} />}
      {report?.imported && (
        <p className="notice live-notice">
          {report.leagueName} is an imported league, so scores come from NFL box scores instead of
          the league site. Lineup changes made after your last import won’t show.{' '}
          <button type="button" className="text-button" onClick={onLeagues}>
            Set up automatic refresh
          </button>
        </p>
      )}
      {report && !live && (
        <p className="empty-activity">
          This week’s matchup isn’t in the league data yet. Your opponent is safe, for now.
        </p>
      )}
      {live && (
        <>
          {live.winChance !== undefined && (
            <section className="live-chance" aria-label="Win chance">
              <p>
                <strong>{Math.round(live.winChance * 100)}%</strong> chance you win (bragging rights
                not included)
              </p>
              <span className="live-chance-bar" aria-hidden="true">
                <span style={{ width: `${Math.round(live.winChance * 100)}%` }} />
              </span>
              <small>
                From the score so far plus estimates for players yet to play, with spreads fitted on
                past results. Players mid-game add a rough allowance, so treat it as a guide.
              </small>
            </section>
          )}
          {report.matchupWeek !== undefined && report.matchupWeek !== report.week && (
            <p className="live-sub">
              Scores aren’t shown: the league data is from week {report.matchupWeek}. Update the
              league to see week {report.week} scores; game states and estimates below are current.
            </p>
          )}
          {!report.gamesAvailable && (
            <p className="live-sub">NFL game states for week {report.week} aren’t posted yet.</p>
          )}
          <div className="live-sides">
            <Side side={live.you} mine />
            <Side side={live.opponent} mine={false} />
          </div>
          {(live.you.scoreSource === 'box-score' || live.opponent.scoreSource === 'box-score') && (
            <p className="live-sub">
              Scores and player points are worked out from ESPN’s NFL box scores with your league’s
              rules and refresh every minute. The official {report.leagueName} score can differ
              slightly after stat corrections.
            </p>
          )}
          {report.updatedAt && !report.imported && (
            <p className="live-sub">League score updated {formatDateTime(report.updatedAt)}.</p>
          )}
        </>
      )}
    </div>
  );
}
