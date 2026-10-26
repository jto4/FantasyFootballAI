import { ReadyDrafts } from './ReadyDrafts';
import { LeagueTrends } from './LeagueTrends';
import type { RefObject, ReactNode } from 'react';
import { Activity, CalendarDays, FileText, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  leagueSeasonPhase,
  orderedHomeCards,
  rankTeams,
  reportVisuals,
  type HomeCardId,
  type LeagueConnection,
} from '@sidekick/core';
import { LeagueVisuals } from './LeagueVisuals';
import type { AppState, NewsSnapshot } from './app-state';
import { seasonKicker } from './season-copy';
import { formatTime } from './date-format';
import { reportStatus } from './report-status';
import { ActionInbox } from './ActionInbox';
export type HomeDisclosures = Partial<Record<'connections' | 'activity' | 'news', boolean>>;
type Props = {
  disclosures?: HomeDisclosures;
  onDisclosureChange?: (key: keyof HomeDisclosures, open: boolean) => void;
  state: AppState;
  league: LeagueConnection | undefined;
  aiReady: boolean;
  aiChecking?: boolean;
  /** The automatic AI connection check failed (shown once, at the top of Home). */
  aiFailed?: boolean;
  requiredSetupComplete: number;
  generatingKind: string;
  refreshingNews: boolean;
  news: NewsSnapshot;
  setupWizardTriggerRef: RefObject<HTMLButtonElement | null>;
  openSetupWizard: () => void;
  setModal: (open: boolean) => void;
  setSettingsFocusTarget: (
    target: 'ai' | 'voice' | 'yahoo' | 'credentials' | 'data' | null,
  ) => void;
  navigate: (section: string) => void;
  createReport: (kind: string) => Promise<void>;
  refreshLeague: (id: string) => Promise<void>;
  refreshNews: () => Promise<void>;
  setInitialReviewId: (id: string) => void;
  onSample?: () => void;
  status?: ReactNode;
  weekly?: ReactNode;
};
export function LeagueDesk({
  state,
  disclosures = {},
  onDisclosureChange,
  league,
  aiReady,
  aiChecking = false,
  aiFailed = false,
  requiredSetupComplete,
  generatingKind,
  refreshingNews,
  news,
  setupWizardTriggerRef,
  openSetupWizard,
  setModal,
  navigate,
  createReport,
  refreshLeague,
  refreshNews,
  setInitialReviewId,
  onSample,
  status,
  weekly,
}: Props) {
  const currentWeek = Number(league?.settings.currentWeek);
  const seasonPhase = league ? leagueSeasonPhase(league) : 'unknown';
  const ranking = league ? rankTeams(league) : undefined;
  const rankedTeams = ranking?.basis ? ranking.teams : [];
  const draftCount = league
    ? (state.reportCounts?.[league.id]?.drafts ??
      state.reports.filter(
        (report) =>
          report.leagueId === league.id && report.status === 'draft' && !report.deliveryState,
      ).length)
    : 0;
  const deliveryIssues = league
    ? (state.reportCounts?.[league.id]?.issues ??
      state.reports.filter(
        (r) => r.leagueId === league.id && ['failed', 'uncertain'].includes(r.deliveryState ?? ''),
      ).length)
    : 0;
  const matchup = league?.matchups?.[0];
  const hidden = new Set(
    orderedHomeCards(state.settings.preferences)
      .filter((card) => !card.visible)
      .map((card) => card.id),
  );
  const shown = (id: HomeCardId) => !hidden.has(id);
  return (
    <>
      {/* Once a league is connected the title is one line, so this week's answer leads. */}
      <section className={league ? 'welcome-row compact' : 'welcome-row'}>
        <div>
          <p className="date-kicker">
            THE LEAGUE DESK <span>·</span>{' '}
            {league
              ? seasonKicker(
                  seasonPhase,
                  currentWeek,
                  league.settings.playoffStartWeekSource === 'derived',
                  league.season,
                )
              : 'YOUR LOCAL WORKSPACE'}
          </p>
          <h1>Sunday’s league desk</h1>
          {!league && (
            <p className="intro">
              Set up your first league and choose how your new league-mate should work.
            </p>
          )}
        </div>
      </section>
      {weekly}
      {league && shown('drafts') && (
        <ReadyDrafts
          drafts={state.reports.filter(
            (report) =>
              report.leagueId === league.id && report.status === 'draft' && !report.deliveryState,
          )}
          onReview={(id) => {
            setInitialReviewId(id);
            navigate('Reports');
          }}
          onLibrary={() => navigate('Reports')}
        />
      )}
      {!weekly && (
        <section className="advice-home-entry">
          <div>
            <h2>Need help with a football decision?</h2>
            <p>
              Compare starters, trades and waivers with supporting numbers. Draft tools are
              available when you need them.
            </p>
          </div>
          <button type="button" className="small-button" onClick={() => navigate('Advice')}>
            Get advice
          </button>
        </section>
      )}
      {/* A failed AI check already has its own notice at the top of Home. */}
      {!(league && !generatingKind && !aiReady && aiFailed) && (
        <section
          // Once a league is connected, the next step is a one-line banner below the weekly answer.
          className={`next-action-card ${league ? 'next-action-compact' : ''}`}
          aria-labelledby="next-action-title"
        >
          <p className="section-overline">YOUR NEXT STEP</p>
          <h2 id="next-action-title">
            {!league
              ? 'Connect your fantasy league'
              : generatingKind
                ? 'Your report is being created'
                : !aiReady
                  ? aiChecking
                    ? 'Checking your AI connection'
                    : 'Finish connecting your AI writer'
                  : draftCount
                    ? 'Want a fresh take?'
                    : 'Create a report for your league'}
          </h2>
          <p>
            {!league
              ? 'Paste a league link and we’ll help you get started.'
              : generatingKind
                ? 'Its progress is saved. You can keep using the app while it finishes.'
                : !aiReady
                  ? 'We’ll check that your AI connection works before creating a report.'
                  : draftCount
                    ? 'Your drafts are above. Write a new one if the league has moved on since.'
                    : `Choose a report for ${league.displayName}. You’ll review the draft before anything is sent.`}
          </p>
          <button
            ref={setupWizardTriggerRef}
            type="button"
            className="primary-button"
            disabled={Boolean(league && !generatingKind && aiChecking)}
            onClick={() => {
              if (league && generatingKind) navigate('Reports');
              else if (!league || !aiReady) openSetupWizard();
              else void createReport('power-rankings');
            }}
          >
            {!league
              ? 'Guided setup'
              : generatingKind
                ? 'View report progress'
                : !aiReady
                  ? aiChecking
                    ? 'Checking connection…'
                    : 'Finish AI setup'
                  : 'Create a report'}{' '}
            <span aria-hidden="true">→</span>
          </button>
          {!aiReady && !draftCount && (
            <small>
              {requiredSetupComplete} of 2 connections ready. You can finish setup later.
            </small>
          )}
          {league && (
            <button type="button" className="text-button" onClick={() => navigate('Leagues')}>
              Manage leagues
            </button>
          )}
          {!league && onSample && (
            <button type="button" className="text-button sample-entry" onClick={onSample}>
              Try a sample league
            </button>
          )}
        </section>
      )}
      {status && (
        <details
          className="home-disclosure"
          open={disclosures.connections ?? false}
          onToggle={(event) => onDisclosureChange?.('connections', event.currentTarget.open)}
        >
          <summary>Connections & scheduled reports</summary>
          {status}
        </details>
      )}
      {league && aiReady && shown('activity') && (
        <details
          className="home-disclosure"
          open={
            !!generatingKind || (disclosures.activity ?? (draftCount > 0 || deliveryIssues > 0))
          }
          onToggle={(event) => onDisclosureChange?.('activity', event.currentTarget.open)}
        >
          <summary>
            Report activity{draftCount ? ` · ${draftCount} drafts` : ''}
            {deliveryIssues ? ` · ${deliveryIssues} delivery issues` : ''}
          </summary>
          <ActionInbox
            league={league}
            reports={state.reports}
            counts={league ? state.reportCounts?.[league.id] : undefined}
            settings={state.settings}
            scheduledRuns={state.scheduledRuns}
            onReview={() => navigate('Reports')}
            onSchedule={() => navigate('Schedule')}
            onRefresh={() => league && void refreshLeague(league.id)}
          />
        </details>
      )}
      {league && shown('league-news') && (
        <details
          className="home-disclosure league-extra"
          open={disclosures.news ?? false}
          onToggle={(event) => onDisclosureChange?.('news', event.currentTarget.open)}
        >
          <summary>League standings & news</summary>
          <LeagueVisuals data={reportVisuals(league)} syncedAt={league.lastSyncedAt} />
          <LeagueTrends league={league} />
          <div className="section-heading">
            <div>
              <p className="section-overline">THE EARLY READ</p>
              <h2>Power rankings</h2>
            </div>
            <button
              className="text-button"
              disabled={!league || !aiReady || Boolean(generatingKind)}
              onClick={() => void createReport('power-rankings')}
            >
              Generate rankings draft <span>↗</span>
            </button>
          </div>
          <section className="content-grid">
            <div className="ranking-panel">
              <div className="panel-head">
                <div>
                  <span className="panel-kicker">
                    {league ? `${league.teamCount} TEAMS` : 'LEAGUE SNAPSHOT'}
                  </span>
                  <h3>Power rankings</h3>
                </div>
                <button
                  className="more-button"
                  aria-label="Review rankings reports"
                  onClick={() => navigate('Reports')}
                >
                  •••
                </button>
              </div>
              {rankedTeams.length ? (
                <div className="ranking-table">
                  <div className="table-header">
                    <span>RANK</span>
                    <span>TEAM</span>
                    <span>W–L</span>
                    <span>PTS</span>
                  </div>
                  {rankedTeams.slice(0, 5).map((team, index) => (
                    <div className="ranking-row" key={team.id}>
                      <span className="rank-num">
                        {ranking?.places[index]?.tied ? 'T-' : ''}
                        {String(ranking?.places[index]?.rank ?? index + 1).padStart(2, '0')}
                      </span>
                      <div className="team-name">
                        <span className="team-badge">{team.name.slice(0, 1)}</span>
                        <div>
                          <strong>{team.name}</strong>
                          <small>{team.owner ?? 'League member'}</small>
                        </div>
                      </div>
                      <span className="record">
                        {team.wins ?? '—'}–{team.losses ?? '—'}
                      </span>
                      <span className="record">{team.pointsFor?.toFixed(1) ?? '—'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-inline">
                  {league
                    ? 'Standings are incomplete. Every team needs the same record or points-for data before rankings can be shown.'
                    : 'Connect a league with current standings to see real rankings.'}
                </div>
              )}
              <div className="ranking-foot">
                <span>Updates are saved locally as drafts</span>
                <button
                  disabled={!league || !aiReady || Boolean(generatingKind)}
                  onClick={() => void createReport('power-rankings')}
                >
                  Generate fresh take <span>→</span>
                </button>
              </div>
            </div>

            <div className="matchup-panel">
              <div className="matchup-title">
                <div>
                  <span className="panel-kicker">
                    {matchup ? `WEEK ${matchup.week}` : 'THIS WEEK'} <span>·</span> MATCHUP PREVIEW
                  </span>
                  <h3>{matchup ? 'Matchup on deck' : 'Ready for kickoff?'}</h3>
                </div>
                <CalendarDays size={18} />
              </div>
              {matchup ? (
                <>
                  <div className="matchup-teams">
                    {matchup.teams.map((side, index) => {
                      const team = league?.teams.find((item) => item.id === side.teamId);
                      return (
                        <div className="match-team" key={side.teamId}>
                          <div
                            className={`team-emblem ${index === 0 ? 'orange-emblem' : 'navy-emblem'}`}
                          >
                            {team?.name.slice(0, 1) ?? 'T'}
                          </div>
                          <strong>{team?.name ?? `Team ${side.teamId}`}</strong>
                          <span>
                            {side.points === undefined
                              ? 'Score pending'
                              : `${side.points.toFixed(1)} pts`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="matchup-blurb">
                    Current matchup scores are from the connected platform. Player projections and
                    lineup advice are not available in saved league data.
                  </div>
                </>
              ) : (
                <div className="matchup-empty">
                  <div className="team-emblem muted-emblem">
                    <CalendarDays size={18} />
                  </div>
                  <strong>
                    {league
                      ? 'Matchup details haven’t been provided yet.'
                      : 'Connect a league to preview matchups.'}
                  </strong>
                  <span>Matchups will appear when the platform provides schedule data.</span>
                </div>
              )}
              <button
                className="matchup-link"
                disabled={!league || !aiReady || Boolean(generatingKind)}
                onClick={() => void createReport('matchup-preview')}
              >
                Create preview draft <span>→</span>
              </button>
            </div>
          </section>

          <section className="lower-grid">
            <div className="news-panel">
              <div className="panel-head">
                <div>
                  <span className="panel-kicker">
                    AROUND THE LEAGUE <span>·</span> LATEST
                  </span>
                  <h3>Football, worth talking about</h3>
                </div>
                <button
                  className="news-refresh"
                  onClick={() => void refreshNews()}
                  disabled={refreshingNews}
                  aria-label="Refresh football news"
                  title="Refresh headlines"
                >
                  <RefreshCw size={15} className={refreshingNews ? 'spinning' : ''} />
                </button>
              </div>
              <div className="news-list">
                {news.items.slice(0, 3).map((item) => (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="news-item"
                    key={item.url}
                  >
                    <span className="news-source">{item.source}</span>
                    <strong>{item.title}</strong>
                    <span className="news-time">
                      {formatTime(item.publishedAt)} <span>↗</span>
                    </span>
                  </a>
                ))}
                {news.items.length === 0 && (
                  <div className="empty-news">
                    {news.error ?? 'News feed will appear when a source is available.'}
                  </div>
                )}
              </div>
              <div className="panel-footer">
                <span>
                  {news.error ??
                    (news.refreshedAt
                      ? `Sources linked · Updated ${formatDateTime(news.refreshedAt)}${news.stale ? ' · cached' : ''}`
                      : 'Sources linked · waiting for first refresh')}
                </span>
                <ShieldCheck size={14} />
              </div>
            </div>
            <div className="activity-panel">
              <div className="panel-head">
                <div>
                  <span className="panel-kicker">
                    YOUR ASSISTANT <span>·</span> RECENT ACTIVITY
                  </span>
                  <h3>From the locker room</h3>
                </div>
                <Activity size={18} />
              </div>
              <div className="activity-list">
                {state.reports.slice(0, 3).map((report) => (
                  <div className="activity-item" key={report.id}>
                    <span className="activity-glyph">
                      <FileText size={15} />
                    </span>
                    <div>
                      <strong>{report.title}</strong>
                      <span>
                        {reportStatus(report)} · {formatTime(report.createdAt)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setInitialReviewId(report.id);
                        navigate('Reports');
                      }}
                    >
                      Review
                    </button>
                  </div>
                ))}
                {state.reports.length === 0 && (
                  <div className="empty-activity">
                    <div className="empty-graphic">
                      <Mail size={20} />
                      <span>✦</span>
                    </div>
                    <strong>Quiet in the locker room.</strong>
                    <p>Choose a report and we’ll create a draft for you.</p>
                    <button
                      onClick={() => (league ? void createReport('draft-hype') : setModal(true))}
                    >
                      Get things started <span>→</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="panel-footer">
                <span>Saved locally · shared through configured providers</span>
                <ShieldCheck size={14} />
              </div>
            </div>
          </section>
        </details>
      )}
    </>
  );
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
