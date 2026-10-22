import { useEffect, useState } from 'react';
import { record, type LeagueConnection, type LiveMatchup, type LiveSide } from '@sidekick/core';
import { requestJson } from './api-client';
import { formatDateTime } from './date-format';
import { LoadingStatus } from './LoadFeedback';

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
}: {
  league: LeagueConnection | undefined;
  teamId: string | undefined;
  onLeagues: () => void;
}) {
  const [report, setReport] = useState<LiveReport>();
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState<string>();
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
          setError('');
          setCheckedAt(new Date().toISOString());
        })
        .catch(
          () => !signal.aborted && setError('Live scores could not be loaded. Retrying shortly.'),
        );
    };
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 60_000);
    return () => {
      clearInterval(timer);
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
      {!league || !teamId ? (
        <p className="empty-activity">
          Connect a league and choose your team on Home to follow it live.
        </p>
      ) : !report && !error ? (
        <LoadingStatus message="Loading your matchup…" shape="cards" />
      ) : null}
      {error && <p role="alert">{error}</p>}
      {report?.imported && (
        <p className="notice live-notice">
          {report.leagueName} is an imported league, so its score can’t update during games. Game
          states and estimates still update.{' '}
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
                <strong>{Math.round(live.winChance * 100)}%</strong> rough chance you win (bragging
                rights not included)
              </p>
              <span className="live-chance-bar" aria-hidden="true">
                <span style={{ width: `${Math.round(live.winChance * 100)}%` }} />
              </span>
              <small>
                From the score so far plus estimates for players yet to play. Not a calibrated
                probability.
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
          {report.updatedAt && !report.imported && (
            <p className="live-sub">League score updated {formatDateTime(report.updatedAt)}.</p>
          )}
        </>
      )}
    </div>
  );
}
