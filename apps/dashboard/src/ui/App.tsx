import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  FileText,
  Home,
  Mail,
  MessageCircle,
  Newspaper,
  Plus,
  Power,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import {
  defaultActionSettings,
  defaultNewsSources,
  espnSeasonBounds,
  leagueSeasonPhase,
  rankTeams,
  type AppSettings,
  type LeagueConnection,
  type NewsItem,
  type SavedReport,
} from '@sidekick/core';
import { SettingsPage } from './SettingsPage';
import { MemoryPage } from './MemoryPage';
import { resolveActiveLeague } from './league-selection';
import { suggestedSetupStep } from './setup';
import { seasonHeroHeadline, seasonKicker } from './season-copy';
import { SchedulePage, type ScheduledRun } from './SchedulePage';
import { formatTime } from './date-format';
import { LeaguesPage } from './LeaguesPage';
type AppState = {
  leagues: LeagueConnection[];
  reports: SavedReport[];
  settings: AppSettings;
  scheduledRuns: ScheduledRun[];
};
type CredentialProvider = { provider: string; configured: boolean };
type NewsSnapshot = {
  items: NewsItem[];
  refreshedAt?: string;
  stale: boolean;
  error?: string;
};
const initial: AppState = {
  leagues: [],
  reports: [],
  settings: {
    writingStyle: 'Funny, sharp league banter',
    reportLength: 'standard',
    allowProfanity: false,
    excludedTopics: '',
    memoryEnabled: true,
    actions: structuredClone(defaultActionSettings),
    analyzeImportsWithAI: false,
    includeMemberContextInReports: false,
    includeMemberContextInChatReplies: false,
    newsRefreshMinutes: 15,
    newsSources: [...defaultNewsSources],
    nflInjuryReportsEnabled: false,
    imessageAutoSyncEnabled: false,
    imessageSyncIntervalMinutes: 15,
    twilioConversationAutoSyncEnabled: false,
    twilioConversationSyncIntervalMinutes: 15,
    chatRepliesEnabled: false,
    chatRepliesAutoSend: false,
    chatAgentName: 'Sunday Sidekick',
    mcpDeliveryEnabled: false,
    aiRuntime: {
      mode: 'api',
      model: 'gpt-4o-mini',
      command: '',
      args: '',
      baseUrl: 'https://api.openai.com/v1',
    },
  },
  scheduledRuns: [],
};
const menu = [
  { label: 'League desk', icon: Home },
  { label: 'Leagues', icon: Users },
  { label: 'Schedule', icon: CalendarDays },
  { label: 'Members & memory', icon: MessageCircle },
  { label: 'Imports', icon: FileText },
  { label: 'Settings', icon: Settings },
];

export function App() {
  const [state, setState] = useState<AppState>(initial);
  const [activeLeagueId, setActiveLeagueId] = useState(() => {
    try {
      return window.localStorage.getItem('sidekick.activeLeagueId') ?? '';
    } catch {
      return '';
    }
  });
  const [news, setNews] = useState<NewsSnapshot>({ items: [], stale: true });
  const [credentialProviders, setCredentialProviders] = useState<CredentialProvider[]>([]);
  const [testedCliRuntime, setTestedCliRuntime] = useState('');
  const [section, setSection] = useState('League desk');
  const [settingsFocusTarget, setSettingsFocusTarget] = useState<
    'ai' | 'voice' | 'yahoo' | 'credentials' | 'data' | null
  >(null);
  const [modal, setModal] = useState(false);
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [setupWizardStep, setSetupWizardStep] = useState(0);
  const setupWizardTriggerRef = useRef<HTMLButtonElement>(null);
  const setupWizardCloseRef = useRef<HTMLButtonElement>(null);
  const [platform, setPlatform] = useState('sleeper');
  const [leagueId, setLeagueId] = useState('');
  const [espnSeason, setEspnSeason] = useState(new Date().getFullYear());
  const [busy, setBusy] = useState(false);
  const [refreshingLeagueId, setRefreshingLeagueId] = useState('');
  const [refreshingNews, setRefreshingNews] = useState(false);
  const [retryingRunId, setRetryingRunId] = useState('');
  const [notice, setNotice] = useState('');
  const [serviceStatus, setServiceStatus] = useState<
    'checking' | 'running' | 'stopping' | 'stopped' | 'unavailable'
  >('checking');
  const league = resolveActiveLeague(state.leagues, activeLeagueId);

  useEffect(() => {
    if (!league) return;
    if (activeLeagueId !== league.id) setActiveLeagueId(league.id);
    try {
      window.localStorage.setItem('sidekick.activeLeagueId', league.id);
    } catch {
      // The selected league remains usable when browser storage is unavailable.
    }
  }, [activeLeagueId, league?.id]);

  async function refresh() {
    try {
      const [snapshot, stories, credentials] = await Promise.all([
        fetch('/api/state').then((r) => r.json()),
        fetch('/api/news').then((r) => r.json()),
        fetch('/api/credentials').then((r) => (r.ok ? r.json() : [])),
      ]);
      setState(snapshot);
      setNews(
        stories && Array.isArray(stories.items)
          ? stories
          : { items: [], stale: true, error: 'Football news is temporarily unavailable.' },
      );
      setCredentialProviders(Array.isArray(credentials) ? credentials : []);
      setServiceStatus('running');
    } catch {
      setServiceStatus('unavailable');
      setNotice('Local service is unavailable. Start it with npm run dev.');
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!setupWizardOpen) return;
    const previouslyFocused = document.activeElement;
    setupWizardCloseRef.current?.focus();
    return () => {
      if (setupWizardTriggerRef.current?.isConnected) setupWizardTriggerRef.current.focus();
      else if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [setupWizardOpen]);

  async function refreshCredentials() {
    try {
      const response = await fetch('/api/credentials');
      const credentials = response.ok ? await response.json() : [];
      setCredentialProviders(Array.isArray(credentials) ? credentials : []);
    } catch {
      setCredentialProviders([]);
    }
  }

  async function refreshNews() {
    setRefreshingNews(true);
    try {
      const response = await fetch('/api/news/refresh', { method: 'POST' });
      const result = (await response.json()) as NewsSnapshot;
      if (!response.ok) throw new Error(result.error ?? 'Could not refresh football news.');
      setNews(result);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not refresh football news.');
    } finally {
      setRefreshingNews(false);
    }
  }

  async function retryScheduledRun(run: ScheduledRun) {
    const failedCount =
      run.leagueResults?.filter((result) => result.status === 'failed').length ?? 0;
    if (!failedCount || retryingRunId) return;
    if (
      !window.confirm(
        `Retry ${failedCount} failed league result(s) as drafts? This creates reports for review and will not send messages.`,
      )
    )
      return;
    setRetryingRunId(run.id);
    try {
      const response = await fetch(`/api/scheduled-runs/${encodeURIComponent(run.id)}/retry`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not retry this scheduled run.');
      setNotice('Retry finished. Any generated reports are drafts waiting for review.');
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not retry this scheduled run.');
    } finally {
      setRetryingRunId('');
    }
  }

  async function connectLeague(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/leagues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform,
          leagueId,
          ...(platform === 'espn' ? { season: espnSeason } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Unable to connect');
      setModal(false);
      setLeagueId('');
      setNotice(`Connected ${result.displayName}`);
      await refresh();
      if (typeof result.id === 'string') setActiveLeagueId(result.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to connect');
    } finally {
      setBusy(false);
    }
  }

  async function createReport(kind: string) {
    if (!league) {
      setNotice('Connect a league before generating an update.');
      return;
    }
    try {
      const result = await fetch(`/api/reports/${kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leagueId: league.id }),
      });
      const report = await result.json();
      if (!result.ok) throw new Error(report.error);
      setNotice(
        report.deliveryError
          ? `Draft saved, but automatic delivery failed: ${report.deliveryError}`
          : report.status === 'sent'
            ? 'Report generated and sent.'
            : 'New draft added to your review queue.',
      );
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create report');
    }
  }

  async function removeLeague(id: string) {
    await fetch(`/api/leagues/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setNotice('League disconnected.');
    await refresh();
  }

  async function refreshLeague(id: string) {
    setRefreshingLeagueId(id);
    try {
      const response = await fetch(`/api/leagues/${encodeURIComponent(id)}/refresh`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not refresh league.');
      setNotice(`Refreshed ${result.displayName}.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not refresh league.');
      await refresh();
    } finally {
      setRefreshingLeagueId('');
    }
  }

  async function sendReport(id: string) {
    const report = state.reports.find((item) => item.id === id);
    const retryUncertain = report?.deliveryState === 'uncertain';
    if (retryUncertain) {
      const usesResendIdempotency = report?.deliveryAttempts?.at(-1)?.channel === 'email';
      const confirmed = window.confirm(
        `The provider may already have delivered this message. Check its delivery history first. ${usesResendIdempotency ? 'Resend reuses this request key for 24 hours; after that, a retry may send a duplicate. Keep the recipient and email thread details identical so the key can be reused. ' : 'This SMS retry has no provider idempotency key and may send a duplicate. '}Retry only if you confirmed it was not delivered.`,
      );
      if (!confirmed) return;
    }
    const action = state.settings.actions.find((item) => item.kind === report?.kind);
    let replyToId: string | undefined;
    let emailSubject: string | undefined;
    if (action?.channel === 'email') {
      const input = window.prompt(
        'Reply in an existing email thread? Enter its Message-ID (optional). Leave blank to send a new email.',
      );
      if (input === null) return;
      replyToId = input.trim() || undefined;
      if (replyToId) {
        const subject = window.prompt(
          'Enter the subject from the email thread.',
          report?.title.toLowerCase().startsWith('re:')
            ? report.title
            : `Re: ${report?.title ?? ''}`,
        );
        if (subject === null) return;
        emailSubject = subject.trim();
      }
    }
    const response = await fetch(`/api/reports/${encodeURIComponent(id)}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(replyToId ? { replyToId, emailSubject } : {}),
        ...(retryUncertain ? { retryUncertain: true } : {}),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setNotice(result.error ?? 'Could not send draft.');
      await refresh();
      return;
    }
    setNotice('Update sent.');
    await refresh();
  }

  async function stopApplication() {
    const confirmed = window.confirm(
      'Stop Sunday Sidekick? This stops the local service and scheduled jobs. If you installed the background service, start it with npm run service -- start. Otherwise run npm start or npm run dev.',
    );
    if (!confirmed) return;

    setServiceStatus('stopping');
    setNotice('Stopping the local service…');
    try {
      const response = await fetch('/api/shutdown', { method: 'POST' });
      if (!response.ok) throw new Error('The service did not accept the shutdown request.');
      setServiceStatus('stopped');
      setNotice(
        'Sunday Sidekick is stopped. Start the background service with npm run service -- start, or run npm start or npm run dev.',
      );
    } catch {
      setServiceStatus('running');
      setNotice('Could not stop Sunday Sidekick. The local service is still running.');
    }
  }

  const runtime = state.settings.aiRuntime;
  const aiReady =
    (runtime !== undefined &&
      runtime.mode !== 'api' &&
      testedCliRuntime === `${runtime.mode}\u0000${runtime.command}\u0000${runtime.args}`) ||
    (runtime?.mode === 'api' &&
      credentialProviders.some((item) => item.provider === 'openai' && item.configured));
  const requiredSetupComplete = Number(Boolean(league)) + Number(aiReady);
  function openSetupWizard() {
    setSetupWizardStep(suggestedSetupStep(Boolean(league), aiReady));
    setSetupWizardOpen(true);
  }
  const currentWeek = Number(league?.settings.currentWeek);
  const seasonPhase = league ? leagueSeasonPhase(league) : 'unknown';
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
  const ranking = league ? rankTeams(league) : undefined;
  const rankedTeams = ranking?.basis ? ranking.teams : [];
  const matchup = league?.matchups?.[0];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Zap size={19} fill="currentColor" />
          </div>
          <span>
            Sunday<span className="brand-light">Sidekick</span>
          </span>
        </div>
        <nav className="nav-list">
          {menu.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => setSection(label)}
              className={`nav-item ${section === label ? 'active' : ''}`}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {label === 'League desk' && <i className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="service-status">
            <span className={`status-pulse ${serviceStatus !== 'running' ? 'offline' : ''}`} />
            <span>
              {serviceStatus === 'checking' && 'Checking local service'}
              {serviceStatus === 'running' && 'Local service running'}
              {serviceStatus === 'stopping' && 'Stopping local service'}
              {serviceStatus === 'stopped' && 'Local service stopped'}
              {serviceStatus === 'unavailable' && 'Local service unavailable'}
            </span>
            {serviceStatus === 'running' && <ShieldCheck size={14} />}
          </div>
          <button
            className="stop-service-button"
            onClick={() => void stopApplication()}
            disabled={serviceStatus !== 'running'}
            title="Stop Sunday Sidekick"
            aria-label="Stop Sunday Sidekick"
          >
            <Power size={15} /> <span>Stop app</span>
          </button>
          <button className="help-link">
            <CircleHelp size={16} /> Help & documentation
          </button>
          <div className="user-chip">
            <div className="user-avatar">C</div>
            <div>
              <strong>Commissioner</strong>
              <small>Local workspace</small>
            </div>
            <Settings size={16} />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-context">
            <span className="topbar-label">ACTIVE LEAGUE</span>
            <div className="league-select">
              <div className="league-avatar">{league?.displayName?.slice(0, 1) ?? 'S'}</div>
              <div className="league-details">
                <label className="visually-hidden" htmlFor="active-league-select">
                  Active league
                </label>
                <select
                  id="active-league-select"
                  aria-label="Active league"
                  value={league?.id ?? ''}
                  disabled={state.leagues.length === 0}
                  onChange={(event) => setActiveLeagueId(event.target.value)}
                >
                  {state.leagues.length === 0 ? (
                    <option value="">Your league</option>
                  ) : (
                    state.leagues.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName}
                      </option>
                    ))
                  )}
                </select>
                <span>
                  {league
                    ? `${capitalize(league.platform)} · ${league.teamCount} teams`
                    : 'Connect to get started'}
                </span>
              </div>
              <ChevronDown size={15} aria-hidden="true" />
            </div>
          </div>
          <div className="top-actions">
            <span className="date-label">{dateLabel}</span>
            <span className={`status-pulse ${serviceStatus !== 'running' ? 'offline' : ''}`} />
            <span
              className="date-label"
              title={serviceStatus === 'running' ? 'Local service running' : 'Local service'}
            >
              {serviceStatus === 'running' ? 'Running' : 'Service'}
            </span>
          </div>
        </header>

        <div className="page-content">
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button onClick={() => setNotice('')} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
          {section === 'Settings' ? (
            <SettingsPage
              settings={state.settings}
              leagues={state.leagues}
              onSaved={(settings) => {
                setState((current) => ({ ...current, settings }));
              }}
              onCredentialsChanged={() => void refreshCredentials()}
              onRuntimeTested={(testedRuntime) =>
                setTestedCliRuntime(
                  `${testedRuntime.mode}\u0000${testedRuntime.command}\u0000${testedRuntime.args}`,
                )
              }
              focusTarget={settingsFocusTarget}
              onFocusTargetHandled={() => setSettingsFocusTarget(null)}
              onRestored={refresh}
            />
          ) : section === 'Leagues' ? (
            <LeaguesPage
              leagues={state.leagues}
              {...(league ? { activeLeagueId: league.id } : {})}
              {...(state.settings.leagueStaleAfterHours === undefined
                ? {}
                : { staleAfterHours: state.settings.leagueStaleAfterHours })}
              refreshingLeagueId={refreshingLeagueId}
              onConnect={() => setModal(true)}
              onSetActive={setActiveLeagueId}
              onRefresh={(id) => void refreshLeague(id)}
              onDisconnect={(id) => void removeLeague(id)}
            />
          ) : section === 'Schedule' ? (
            <SchedulePage
              actions={state.settings.actions}
              reports={state.reports}
              scheduledRuns={state.scheduledRuns}
              retryingRunId={retryingRunId}
              onGenerate={(kind) => void createReport(kind)}
              onRetry={(run) => void retryScheduledRun(run)}
              onSend={(reportId) => void sendReport(reportId)}
            />
          ) : section === 'Members & memory' || section === 'Imports' ? (
            <>
              <MemoryPage
                mode={section === 'Imports' ? 'imports' : 'members'}
                leagues={state.leagues.map(({ id, displayName }) => ({ id, displayName }))}
                memoryEnabled={state.settings.memoryEnabled}
                analyzeImportsWithAI={state.settings.analyzeImportsWithAI}
                imessageConfigured={credentialProviders.some(
                  (item) => item.provider === 'bluebubbles' && item.configured,
                )}
                twilioConfigured={credentialProviders.some(
                  (item) => item.provider === 'twilio' && item.configured,
                )}
                resendConfigured={credentialProviders.some(
                  (item) => item.provider === 'resend' && item.configured,
                )}
                {...(state.settings.imessageChatGuid
                  ? { imessageChatGuid: state.settings.imessageChatGuid }
                  : {})}
                {...(state.settings.smsRecipient
                  ? { smsRecipient: state.settings.smsRecipient }
                  : {})}
                {...(state.settings.conversationRetentionDays === undefined
                  ? {}
                  : { conversationRetentionDays: state.settings.conversationRetentionDays })}
              />
            </>
          ) : (
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
                        Connect a league and a working AI runtime. Your data stays on this computer.
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
                      onClick={() => (league ? setSection('Leagues') : setModal(true))}
                    />
                    <SetupStep
                      complete={aiReady}
                      number="02"
                      title="Choose an AI runtime"
                      detail="Save an API key or select a local AI command, then test it in Settings."
                      actionLabel={aiReady ? 'Review or test' : 'Set up AI'}
                      onClick={() => {
                        setSettingsFocusTarget('ai');
                        setSection('Settings');
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
                        setSection('Settings');
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
                        ? `You have ${state.reports.filter((r) => r.status === 'draft').length} drafts waiting for a look. Let's get the conversation started.`
                        : 'Connect your fantasy league and your new favorite league-mate will get to work.'}
                    </p>
                    <button
                      className="hero-cta"
                      onClick={() =>
                        league ? void createReport('power-rankings') : setModal(true)
                      }
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

              <section className="stats-row">
                <div className="stat-item">
                  <div className="stat-icon orange">
                    <Users size={16} />
                  </div>
                  <div>
                    <span className="stat-label">CONNECTED LEAGUES</span>
                    <strong>{state.leagues.length.toString().padStart(2, '0')}</strong>
                  </div>
                </div>
                <div className="stat-item">
                  <div className="stat-icon blue">
                    <ClipboardList size={16} />
                  </div>
                  <div>
                    <span className="stat-label">DRAFTS TO REVIEW</span>
                    <strong>
                      {state.reports
                        .filter((r) => r.status === 'draft')
                        .length.toString()
                        .padStart(2, '0')}
                    </strong>
                  </div>
                  <span className="stat-trend">READY</span>
                </div>
                <div className="stat-item">
                  <div className="stat-icon green">
                    <MessageCircle size={16} />
                  </div>
                  <div>
                    <span className="stat-label">SCHEDULED RUNS</span>
                    <strong>{state.scheduledRuns.length.toString().padStart(2, '0')}</strong>
                  </div>
                </div>
                <div className="stat-item">
                  <div className="stat-icon violet">
                    <Newspaper size={16} />
                  </div>
                  <div>
                    <span className="stat-label">NEWS STORIES</span>
                    <strong>{news.items.length.toString().padStart(2, '0')}</strong>
                  </div>
                </div>
              </section>

              <div className="section-heading">
                <div>
                  <p className="section-overline">THE EARLY READ</p>
                  <h2>Power rankings</h2>
                </div>
                <button className="text-button" onClick={() => void createReport('power-rankings')}>
                  Full breakdown <span>↗</span>
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
                    <button className="more-button" onClick={() => setSection('Schedule')}>
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
                          <span className="rank-num">{String(index + 1).padStart(2, '0')}</span>
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
                    <button onClick={() => void createReport('power-rankings')}>
                      Generate fresh take <span>→</span>
                    </button>
                  </div>
                </div>

                <div className="matchup-panel">
                  <div className="matchup-title">
                    <div>
                      <span className="panel-kicker">
                        {matchup ? `WEEK ${matchup.week}` : 'THIS WEEK'} <span>·</span> MATCHUP
                        PREVIEW
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
                        Current matchup scores are from the connected platform. Player projections
                        and lineup advice are not available in this snapshot.
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
                          <span>Draft ready · {formatTime(report.createdAt)}</span>
                        </div>
                        <span className="activity-status">REVIEW</span>
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
                        <button
                          onClick={() =>
                            league ? void createReport('draft-hype') : setModal(true)
                          }
                        >
                          Get things started <span>→</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="panel-footer">
                    <span>Everything stays on this computer</span>
                    <ShieldCheck size={14} />
                  </div>
                </div>
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>Built for the love of the game (and the group chat).</span>
            <span>
              <i /> LOCAL-FIRST BY DESIGN
            </span>
          </footer>
        </div>
      </main>

      {modal && (
        <div
          className="modal-scrim"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal(false);
          }}
        >
          <form className="connect-modal" onSubmit={connectLeague}>
            <button type="button" className="modal-close" onClick={() => setModal(false)}>
              ×
            </button>
            <div className="modal-mark">
              <Zap size={18} />
            </div>
            <h2>Bring your league in.</h2>
            <p>
              Connect with your league ID. Your settings and scoring format come along for the ride.
            </p>
            <label>
              FANTASY PLATFORM
              <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
                <option value="sleeper">Sleeper</option>
                <option value="espn">ESPN</option>
                <option value="yahoo">Yahoo</option>
              </select>
            </label>
            <label>
              LEAGUE ID
              <input
                required
                value={leagueId}
                onChange={(event) => setLeagueId(event.target.value)}
                placeholder="e.g. 123456789"
              />
            </label>
            {platform === 'espn' && (
              <label>
                ESPN SEASON
                <input
                  required
                  type="number"
                  min={espnSeasonBounds.min}
                  max={espnSeasonBounds.max}
                  step={1}
                  value={espnSeason}
                  onChange={(event) => setEspnSeason(Number(event.target.value))}
                />
                <small className="modal-hint">
                  Select the league year to load; refreshes continue using this season.
                </small>
              </label>
            )}
            <small className="modal-hint">
              Private leagues require account-authorized platform access.
            </small>
            {platform === 'yahoo' &&
              !credentialProviders.some(
                (credential) => credential.provider === 'yahoo' && credential.configured,
              ) && (
                <div className="provider-setup-callout" role="note">
                  <p>Yahoo requires owner-authorized Fantasy Sports OAuth before connecting.</p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setModal(false);
                      setSettingsFocusTarget('yahoo');
                      setSection('Settings');
                    }}
                  >
                    Set up Yahoo access <span>→</span>
                  </button>
                </div>
              )}
            {platform === 'espn' &&
              !credentialProviders.some(
                (credential) => credential.provider === 'espn' && credential.configured,
              ) && (
                <div className="provider-setup-callout" role="note">
                  <p>Private ESPN leagues need your owner-authorized session cookie.</p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setModal(false);
                      setSettingsFocusTarget('credentials');
                      setSection('Settings');
                    }}
                  >
                    Add ESPN access <span>→</span>
                  </button>
                </div>
              )}
            <button
              className="primary-button full"
              type="submit"
              disabled={
                busy ||
                (platform === 'yahoo' &&
                  !credentialProviders.some(
                    (credential) => credential.provider === 'yahoo' && credential.configured,
                  ))
              }
            >
              {busy ? 'Connecting…' : 'Connect league'} <span>→</span>
            </button>
          </form>
        </div>
      )}
      {setupWizardOpen && (
        <div
          className="modal-scrim"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSetupWizardOpen(false);
          }}
        >
          <section
            className="setup-wizard-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-wizard-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setSetupWizardOpen(false);
                return;
              }
              if (event.key !== 'Tab') return;
              const controls = event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
              );
              const first = controls.item(0);
              const last = controls.item(controls.length - 1);
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
          >
            <button
              ref={setupWizardCloseRef}
              type="button"
              className="modal-close"
              onClick={() => setSetupWizardOpen(false)}
              aria-label="Close guided setup"
            >
              ×
            </button>
            <p className="section-overline">STEP {setupWizardStep + 1} OF 3</p>
            <h2 id="setup-wizard-title">
              {setupWizardStep === 0
                ? 'Connect your league'
                : setupWizardStep === 1
                  ? 'Choose and test an AI runtime'
                  : 'Set the voice and schedule'}
            </h2>
            <p className="setup-wizard-description">
              {setupWizardStep === 0
                ? 'Choose Sleeper, ESPN, or Yahoo and enter a league ID. Private leagues may need owner-authorized access first.'
                : setupWizardStep === 1
                  ? 'Use an API key or a local CLI. Setup is complete after the selected runtime passes its data-free test.'
                  : 'Choose a writing style, set boundaries, and decide when reports should be drafted or sent. Your league data stays in the local app data folder by default.'}
            </p>
            <div className="setup-wizard-progress" aria-label={`Step ${setupWizardStep + 1} of 3`}>
              {[0, 1, 2].map((step) => (
                <span
                  key={step}
                  className={step <= setupWizardStep ? 'current' : ''}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="setup-wizard-actions">
              <button
                type="button"
                className="small-button"
                onClick={() => setSetupWizardStep((step) => Math.max(0, step - 1))}
                disabled={setupWizardStep === 0}
              >
                Back
              </button>
              {setupWizardStep === 0 ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setSetupWizardOpen(false);
                    setModal(true);
                  }}
                >
                  Connect a league <span>→</span>
                </button>
              ) : setupWizardStep === 1 ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setSetupWizardOpen(false);
                    setSettingsFocusTarget('ai');
                    setSection('Settings');
                  }}
                >
                  Set up AI <span>→</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setSetupWizardOpen(false);
                    setSettingsFocusTarget('voice');
                    setSection('Settings');
                  }}
                >
                  Personalize <span>→</span>
                </button>
              )}
              {setupWizardStep === 2 && window.sidekickDesktop && (
                <button
                  type="button"
                  className="small-button"
                  onClick={() => {
                    setSetupWizardOpen(false);
                    setSettingsFocusTarget('data');
                    setSection('Settings');
                  }}
                >
                  Choose local data folder
                </button>
              )}
              {setupWizardStep === 2 && (
                <button
                  type="button"
                  className="small-button"
                  onClick={() => {
                    setSetupWizardOpen(false);
                    setSettingsFocusTarget('credentials');
                    setSection('Settings');
                  }}
                >
                  Set up optional delivery providers
                </button>
              )}
            </div>
            <button
              type="button"
              className="setup-wizard-finish"
              onClick={() => setSetupWizardOpen(false)}
            >
              Finish later
            </button>
          </section>
        </div>
      )}
    </div>
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

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
