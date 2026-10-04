import type { RefObject } from 'react';
import {
  Activity,
  CalendarDays,
  FileText,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { leagueSeasonPhase, rankTeams, type LeagueConnection } from '@sidekick/core';
import type { AppState, NewsSnapshot } from './app-state';
import { seasonHeroHeadline, seasonKicker } from './season-copy';
import { formatTime } from './date-format';
import { reportStatus } from './report-status';
import { ActionInbox } from './ActionInbox';
type Props = {
  state: AppState;
  league: LeagueConnection | undefined;
  aiReady: boolean;
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
};
export function LeagueDesk({
  state,
  league,
  aiReady,
  requiredSetupComplete,
  generatingKind,
  refreshingNews,
  news,
  setupWizardTriggerRef,
  openSetupWizard,
  setModal,
  setSettingsFocusTarget,
  navigate,
  createReport,
  refreshLeague,
  refreshNews,
  setInitialReviewId,
}: Props) {
  const currentWeek = Number(league?.settings.currentWeek);
  const seasonPhase = league ? leagueSeasonPhase(league) : 'unknown';
  const ranking = league ? rankTeams(league) : undefined;
  const rankedTeams = ranking?.basis ? ranking.teams : [];
  const matchup = league?.matchups?.[0];
  return (
    <>
      <section className="welcome-row">
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
          <p className="intro">
            {league
              ? `Your ${league.displayName} league desk is ready. Let’s make sure everyone knows who’s on top.`
              : 'Set up your first league and choose how your new league-mate should work.'}
          </p>
        </div>
        <button className="primary-button" onClick={() => setModal(true)}>
          <Plus size={16} /> Connect a league
        </button>
      </section>
      {(!league || !aiReady) && (
        <section className="setup-card" aria-labelledby="setup-title">
          <div className="setup-heading">
            <div>
              <p className="section-overline">FIRST-RUN SETUP</p>
              <h2 id="setup-title">Get your league-mate ready</h2>
              <p>
                Connect a league and test your AI runtime. Report context is shared with your
                selected provider.
              </p>
            </div>
            <div className="setup-actions">
              <span className="setup-progress">{requiredSetupComplete} / 2 REQUIRED</span>
              <button
                ref={setupWizardTriggerRef}
                className="small-button"
                onClick={openSetupWizard}
              >
                Guided setup <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
          <div className="setup-steps">
            <SetupStep
              complete={Boolean(league)}
              number="01"
              title="Connect your league"
              detail="Choose Sleeper, ESPN, or Yahoo and enter its league ID."
              actionLabel={league ? 'Manage leagues' : 'Connect league'}
              onClick={() => (league ? navigate('Leagues') : setModal(true))}
            />
            <SetupStep
              complete={aiReady}
              number="02"
              title="Choose an AI runtime"
              detail="Save an API key or select a local AI command, then test it in Settings."
              actionLabel={aiReady ? 'Review or test' : 'Set up AI'}
              onClick={() => {
                setSettingsFocusTarget('ai');
                navigate('Settings');
              }}
            />
            <SetupStep
              complete={false}
              number="03"
              title="Set your voice and schedule"
              detail="Optional: customize the banter and choose a review schedule."
              actionLabel="Personalize"
              optional
              onClick={() => {
                setSettingsFocusTarget('voice');
                navigate('Settings');
              }}
            />
          </div>
        </section>
      )}
      <section className="hero-band">
        <div className="hero-wave hero-wave-back" aria-hidden="true" />
        <div className="hero-wave hero-wave-front" aria-hidden="true" />
        <div className="hero-copy">
          <div className="hero-icon">
            <Sparkles size={19} />
          </div>
          <div className="hero-text">
            <h2>
              {seasonHeroHeadline(
                seasonPhase,
                currentWeek,
                league?.settings.playoffStartWeekSource === 'derived',
                Boolean(league),
              )}
            </h2>
            <p>
              {league
                ? `You have ${(league && state.reportCounts?.[league.id]?.drafts) ?? state.reports.filter((r) => r.status === 'draft').length} drafts waiting for a look. Let's get the conversation started.`
                : 'Connect your fantasy league and your new favorite league-mate will get to work.'}
            </p>
            <button
              className="hero-cta"
              disabled={Boolean(generatingKind)}
              onClick={() => (league ? void createReport('power-rankings') : setModal(true))}
            >
              {league
                ? Number.isInteger(currentWeek) && currentWeek > 0
                  ? `Generate week ${currentWeek} rankings`
                  : 'Generate power rankings'
                : 'Connect your first league'}{' '}
              <span>→</span>
            </button>
          </div>
        </div>
        <div className="hero-ornament">
          <div className="field-circle one" />
          <div className="field-circle two" />
          <div className="field-line" />
          <div className="hero-football">🏈</div>
          <span className="hero-stamp">
            GAME
            <br />
            ON
          </span>
        </div>
      </section>

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
      <div className="section-heading">
        <div>
          <p className="section-overline">THE EARLY READ</p>
          <h2>Power rankings</h2>
        </div>
        <button
          className="text-button"
          disabled={Boolean(generatingKind)}
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
              disabled={Boolean(generatingKind)}
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
                lineup advice are not available in this snapshot.
              </div>
            </>
          ) : (
            <div className="matchup-empty">
              <div className="team-emblem muted-emblem">
                <CalendarDays size={18} />
              </div>
              <strong>
                {league
                  ? 'No matchup data in this snapshot.'
                  : 'Connect a league to preview matchups.'}
              </strong>
              <span>Matchups will appear when the platform provides schedule data.</span>
            </div>
          )}
          <button
            className="matchup-link"
            disabled={Boolean(generatingKind)}
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
                <p>Your first update is one click away.</p>
                <button onClick={() => (league ? void createReport('draft-hype') : setModal(true))}>
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
    </>
  );
}
function SetupStep({
  complete,
  number,
  title,
  detail,
  actionLabel,
  optional = false,
  onClick,
}: {
  complete: boolean;
  number: string;
  title: string;
  detail: string;
  actionLabel: string;
  optional?: boolean;
  onClick: () => void;
}) {
  return (
    <article className={`setup-step ${complete ? 'complete' : ''}`}>
      <span className="setup-number">{complete ? '✓' : number}</span>
      <div className="setup-step-copy">
        <strong>
          {title} {optional && <span className="setup-optional">OPTIONAL</span>}
        </strong>
        <p>{detail}</p>
      </div>
      <button className="text-button" onClick={onClick}>
        {actionLabel} <span>→</span>
      </button>
    </article>
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
