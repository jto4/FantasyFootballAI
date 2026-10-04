import { useLiveDashboard } from './hooks/useLiveDashboard';
import { requestJson } from './api-client';
import {
  isGenerationJob,
  isGenerationRequest,
  isSavedReport,
  type GenerationRequest,
  type ReportKind,
} from '@sidekick/core';
import { Dialog } from './Dialog';
import { LeagueDesk } from './LeagueDesk';
import { ReportsPage, type SendPreview } from './ReportsPage';

import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  CircleHelp,
  FileText,
  Home,
  MessageCircle,
  Power,
  Settings,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import { espnSeasonBounds, parseLeagueInput, type Platform } from '@sidekick/core';
import { SettingsPage } from './SettingsPage';
import { SetupWizard } from './SetupWizard';
import { MemoryPage } from './MemoryPage';
import { resolveActiveLeague } from './league-selection';
import { suggestedSetupStep } from './setup';

import { SchedulePage, type ScheduledRun } from './SchedulePage';

import { LeaguesPage } from './LeaguesPage';
import { LoadError, LoadingStatus } from './LoadFeedback.js';
import {
  initialAppState,
  isAppState,
  isCredentialProviders,
  isNewsSnapshot,
  type AppState,
  type CredentialProvider,
  type NewsSnapshot,
} from './app-state';
const menu = [
  { label: 'League desk', icon: Home },
  { label: 'Leagues', icon: Users },
  { label: 'Schedule', icon: CalendarDays },
  { label: 'Reports', icon: FileText },
  { label: 'Members & memory', icon: MessageCircle },
  { label: 'Imports', icon: FileText },
  { label: 'Settings', icon: Settings },
];

export function App() {
  const [state, setState] = useState<AppState>(initialAppState);
  const [activeLeagueId, setActiveLeagueId] = useState(() => {
    try {
      return window.localStorage.getItem('sidekick.activeLeagueId') ?? '';
    } catch {
      return '';
    }
  });
  const [news, setNews] = useState<NewsSnapshot>({ items: [], stale: true });
  const [credentialProviders, setCredentialProviders] = useState<CredentialProvider[]>([]);
  const [testedRuntimeSignature, setTestedRuntimeSignature] = useState('');
  const [section, setSection] = useState('League desk');
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [reportDirty, setReportDirty] = useState(false);
  const [initialReviewId, setInitialReviewId] = useState('');
  const [generatingKind, setGeneratingKind] = useState('');
  const [pendingGeneration, setPendingGeneration] = useState<GenerationRequest | null>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem('sidekick.pendingGeneration') ?? 'null',
      );
      return isGenerationRequest(value) ? value : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (pendingGeneration)
        localStorage.setItem('sidekick.pendingGeneration', JSON.stringify(pendingGeneration));
      else localStorage.removeItem('sidekick.pendingGeneration');
    } catch {
      /* The server still retains this job if browser storage is unavailable. */
    }
  }, [pendingGeneration]);
  const pendingJob = state.generationJobs?.find(
    (job) => job.requestId === pendingGeneration?.requestId,
  );
  useEffect(() => {
    if (!pendingJob) return;
    if (pendingJob.status === 'queued' || pendingJob.status === 'running') {
      setGeneratingKind(pendingJob.kind);
      return;
    }
    setGeneratingKind('');
    setPendingGeneration(null);
    if (pendingJob.status === 'completed' && pendingJob.reportId) {
      setNotice('New draft added to your review queue.');
      setInitialReviewId(pendingJob.reportId);
      setSetupInProgress(false);
      if (!settingsDirty && !reportDirty) setSection('Reports');
    } else
      setNotice(pendingJob.error ?? 'Generation needs attention. Check Reports before retrying.');
  }, [pendingJob?.id, pendingJob?.status, settingsDirty, reportDirty]);
  const generatingRef = useRef(false);
  const [setupInProgress, setSetupInProgress] = useState(false);
  function navigate(next: string) {
    if (next === section) return;
    if (
      (settingsDirty || reportDirty) &&
      !window.confirm('Discard unsaved changes before leaving this page?')
    )
      return;
    setSettingsDirty(false);
    setReportDirty(false);
    setSection(next);
  }
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
  const [disconnectingLeagueId, setDisconnectingLeagueId] = useState('');
  const [refreshingNews, setRefreshingNews] = useState(false);
  const [retryingRunId, setRetryingRunId] = useState('');
  const [sendingReportId, setSendingReportId] = useState('');
  const [notice, setNotice] = useState('');
  const [stateLoaded, setStateLoaded] = useState(false);
  const [stateLoading, setStateLoading] = useState(true);
  const [stateLoadError, setStateLoadError] = useState('');
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

  const refreshSequence = useRef(0);
  async function refresh(background = false) {
    const sequence = ++refreshSequence.current;
    if (!stateLoaded) setStateLoading(true);
    try {
      const response = await fetch('/api/state?view=summary', {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Local service returned ${response.status} while loading.`);
      const snapshot: unknown = await response.json();
      if (!isAppState(snapshot))
        throw new Error('Local service returned an invalid state snapshot.');
      if (sequence !== refreshSequence.current) return;
      setState(snapshot);
      setStateLoaded(true);
      setStateLoadError('');
      setServiceStatus('running');
      setNotice((current) =>
        current === 'Local service is unavailable. Start it with npm run dev.' ? '' : current,
      );

      if (background) return;
      const [stories, credentials] = await Promise.allSettled([
        fetch('/api/news'),
        fetch('/api/credentials'),
      ]);
      if (stories.status === 'fulfilled' && stories.value.ok) {
        try {
          const snapshot: unknown = await stories.value.json();
          setNews(
            isNewsSnapshot(snapshot)
              ? snapshot
              : {
                  items: [],
                  stale: true,
                  error: 'Football news returned an invalid response.',
                },
          );
        } catch {
          setNews((current) => ({
            ...current,
            stale: true,
            error: 'Football news is temporarily unavailable.',
          }));
        }
      } else {
        setNews((current) => ({
          ...current,
          stale: true,
          error: 'Football news is temporarily unavailable.',
        }));
      }
      if (credentials.status === 'fulfilled' && credentials.value.ok) {
        try {
          const result: unknown = await credentials.value.json();
          if (isCredentialProviders(result)) setCredentialProviders(result);
        } catch {
          // Keep the last known credential status if an optional refresh is malformed.
        }
      }
    } catch (error) {
      setServiceStatus('unavailable');
      const message =
        error instanceof Error
          ? error.message
          : 'Local service is unavailable. Start it with npm run dev.';
      setStateLoadError(message);
      if (stateLoaded) setNotice(`Could not refresh local league data. ${message}`);
    } finally {
      setStateLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useLiveDashboard(
    () => refresh(true),
    stateLoaded && serviceStatus !== 'stopped' && serviceStatus !== 'stopping',
  );

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
      if (!response.ok) throw new Error(`Credential status request failed (${response.status}).`);
      const credentials: unknown = await response.json();
      if (!isCredentialProviders(credentials))
        throw new Error('Credential status response was invalid.');
      setCredentialProviders(credentials);
    } catch {
      setNotice('Could not refresh credential status. Check the Credentials section in Settings.');
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
      const parsed = parseLeagueInput(platform as Platform, leagueId);
      const response = await fetch('/api/leagues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform,
          leagueId: parsed.leagueId,
          ...(platform === 'espn' ? { season: parsed.season ?? espnSeason } : {}),
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
    if (generatingRef.current) return;
    if (!league) {
      setNotice('Connect a league before generating an update.');
      return;
    }
    const request: GenerationRequest =
      pendingGeneration?.leagueId === league.id && pendingGeneration.kind === kind
        ? pendingGeneration
        : { requestId: crypto.randomUUID(), leagueId: league.id, kind: kind as ReportKind };
    try {
      localStorage.setItem('sidekick.pendingGeneration', JSON.stringify(request));
    } catch {
      /* The job remains visible in the server's queue. */
    }
    generatingRef.current = true;
    setPendingGeneration(request);
    setGeneratingKind(kind);
    try {
      const job = await requestJson('/api/generation-jobs', isGenerationJob, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      setState((current) => ({
        ...current,
        generationJobs: [
          job,
          ...(current.generationJobs ?? []).filter((item) => item.id !== job.id),
        ],
      }));
      setNotice('Generation queued. You can keep using the app; its progress is saved in Reports.');
      navigate('Reports');
      await refresh();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not connect to generation. Retry to reconnect to this saved request.',
      );
      setGeneratingKind('');
    } finally {
      generatingRef.current = false;
    }
  }

  async function removeLeague(id: string) {
    const disconnectedLeague = state.leagues.find((item) => item.id === id);
    if (!disconnectedLeague) return;
    if (
      !window.confirm(
        `Disconnect ${disconnectedLeague.displayName}? This removes its saved league snapshot, imported projections, and calendar events. Existing reports and member profiles will remain.`,
      )
    )
      return;
    setDisconnectingLeagueId(id);
    try {
      const response = await fetch(`/api/leagues/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Could not disconnect this league (${response.status}).`);
      setNotice(`${disconnectedLeague.displayName} disconnected.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not disconnect this league.');
    } finally {
      setDisconnectingLeagueId('');
    }
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

  async function sendReport(id: string, preview?: SendPreview) {
    if (sendingReportId) return;
    let report;
    try {
      report = await requestJson(`/api/reports/${encodeURIComponent(id)}`, isSavedReport);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load saved report.');
      return;
    }
    if (!report) {
      setNotice('This report is no longer available. Refresh the page and check report history.');
      return;
    }
    const retryUncertain = report?.deliveryState === 'uncertain';
    if (retryUncertain) {
      const usesResendIdempotency = report?.deliveryAttempts?.at(-1)?.channel === 'email';
      const confirmed = window.confirm(
        `The provider may already have delivered this message. Check its delivery history first. ${usesResendIdempotency ? 'Resend reuses this request key for 24 hours; after that, a retry may send a duplicate. The retry uses the original saved recipient, subject, and text. ' : 'This SMS retry has no provider idempotency key and may send a duplicate. '}Retry only if you confirmed it was not delivered.`,
      );
      if (!confirmed) return;
    }
    const action = state.settings.actions.find((item) => item.kind === report?.kind);
    let replyToId: string | undefined = preview?.replyToId;
    let emailSubject: string | undefined = preview?.emailSubject;
    if (action?.channel === 'email' && !preview) {
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
    setSendingReportId(id);
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(id)}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...preview,
          ...(replyToId ? { replyToId, emailSubject } : {}),
          ...(retryUncertain ? { retryUncertain: true } : {}),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setNotice(result.error ?? 'Could not send draft.');
        await refresh();
        return;
      }
      setNotice('Update sent.');
      await refresh();
    } catch {
      await refresh();
      setNotice(
        'Could not confirm delivery. Check report and delivery history before attempting to send again.',
      );
    } finally {
      setSendingReportId('');
    }
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
  const aiReady = Boolean(runtime && testedRuntimeSignature === JSON.stringify(runtime));
  const requiredSetupComplete = Number(Boolean(league)) + Number(aiReady);
  function openSetupWizard() {
    setSetupWizardStep(suggestedSetupStep(Boolean(league), aiReady));
    setSetupInProgress(true);
    setSetupWizardOpen(true);
  }
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
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
              onClick={() => navigate(label)}
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
          <a
            className="help-link"
            href="https://github.com/jto4/FantasyFootballAI/blob/main/README.md"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={16} /> Help & documentation
          </a>
          <div className="user-chip">
            <div className="user-avatar">C</div>
            <div>
              <strong>Commissioner</strong>
              <small>Local workspace</small>
            </div>
            <button
              type="button"
              className="workspace-settings-button"
              aria-label="Open settings"
              onClick={() => navigate('Settings')}
            >
              <Settings size={16} />
            </button>
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
          {setupInProgress && stateLoaded && !setupWizardOpen && (
            <div className="onboarding-progress" role="status">
              <strong>Your first report</strong>
              <span>
                {!league
                  ? 'Connect a league'
                  : !aiReady
                    ? 'Save and test your AI runtime'
                    : 'Generate and review your first draft'}
              </span>
              <button
                type="button"
                className="small-button"
                onClick={() => {
                  if (league && aiReady) {
                    void createReport('power-rankings');
                  } else openSetupWizard();
                }}
                disabled={Boolean(generatingKind)}
              >
                {league && aiReady ? 'Generate first draft' : 'Continue setup'}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setSetupInProgress(false)}
              >
                Finish later
              </button>
            </div>
          )}
          {!stateLoaded ? (
            stateLoading ? (
              <LoadingStatus message="Loading your leagues, reports, and schedule…" />
            ) : (
              <LoadError
                message={stateLoadError || 'Could not load local league data.'}
                onRetry={() => void refresh()}
              />
            )
          ) : section === 'Settings' ? (
            <SettingsPage
              settings={state.settings}
              leagues={state.leagues}
              onSaved={(settings) => {
                setState((current) => ({ ...current, settings }));
              }}
              onCredentialsChanged={() => {
                setTestedRuntimeSignature('');
                void refreshCredentials();
              }}
              onRuntimeTested={(testedRuntime) =>
                setTestedRuntimeSignature(JSON.stringify(testedRuntime))
              }
              focusTarget={settingsFocusTarget}
              onFocusTargetHandled={() => setSettingsFocusTarget(null)}
              onRestored={refresh}
              onDirtyChange={setSettingsDirty}
            />
          ) : section === 'Leagues' ? (
            <LeaguesPage
              leagues={state.leagues}
              {...(league ? { activeLeagueId: league.id } : {})}
              {...(state.settings.leagueStaleAfterHours === undefined
                ? {}
                : { staleAfterHours: state.settings.leagueStaleAfterHours })}
              refreshingLeagueId={refreshingLeagueId}
              disconnectingLeagueId={disconnectingLeagueId}
              onConnect={() => setModal(true)}
              onSetActive={setActiveLeagueId}
              onRefresh={(id) => void refreshLeague(id)}
              onDisconnect={(id) => void removeLeague(id)}
            />
          ) : section === 'Reports' ? (
            <ReportsPage
              reports={state.reports}
              jobs={state.generationJobs ?? []}
              leagues={state.leagues}
              settings={state.settings}
              sendingReportId={sendingReportId}
              initialReportId={initialReviewId}
              onSend={sendReport}
              onSaved={refresh}
              onDirtyChange={setReportDirty}
            />
          ) : section === 'Schedule' ? (
            <SchedulePage
              actions={state.settings.actions}
              scheduledRuns={state.scheduledRuns}
              retryingRunId={retryingRunId}
              generatingKind={generatingKind}
              onGenerate={(kind) => void createReport(kind)}
              onRetry={(run) => void retryScheduledRun(run)}
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
            <LeagueDesk
              state={state}
              league={league}
              aiReady={aiReady}
              requiredSetupComplete={requiredSetupComplete}
              generatingKind={generatingKind}
              refreshingNews={refreshingNews}
              news={news}
              setupWizardTriggerRef={setupWizardTriggerRef}
              openSetupWizard={openSetupWizard}
              setModal={setModal}
              setSettingsFocusTarget={setSettingsFocusTarget}
              navigate={navigate}
              createReport={createReport}
              refreshLeague={refreshLeague}
              refreshNews={refreshNews}
              setInitialReviewId={setInitialReviewId}
            />
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
        <Dialog
          titleId="connect-league-title"
          className="connect-modal"
          onClose={() => setModal(false)}
        >
          <form onSubmit={connectLeague}>
            <button
              type="button"
              className="modal-close"
              aria-label="Close league connection"
              onClick={() => setModal(false)}
            >
              ×
            </button>
            <div className="modal-mark">
              <Zap size={18} />
            </div>
            <h2 id="connect-league-title">Bring your league in.</h2>
            <p>
              Paste your league URL or ID. Your settings and scoring format come along for the ride.
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
              LEAGUE ID OR URL
              <input
                required
                value={leagueId}
                onChange={(event) => setLeagueId(event.target.value)}
                placeholder="Paste a league URL or ID"
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
                      navigate('Settings');
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
                      navigate('Settings');
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
        </Dialog>
      )}
      {setupWizardOpen && (
        <SetupWizard
          step={setupWizardStep}
          closeButtonRef={setupWizardCloseRef}
          onStepChange={setSetupWizardStep}
          onClose={() => setSetupWizardOpen(false)}
          onConnectLeague={() => {
            setSetupWizardOpen(false);
            setModal(true);
          }}
          onSetupAi={() => {
            setSetupWizardOpen(false);
            setSettingsFocusTarget('ai');
            navigate('Settings');
          }}
          ready={Boolean(league) && aiReady}
          generating={Boolean(generatingKind)}
          onGenerate={() => {
            setSetupWizardOpen(false);
            void createReport('power-rankings');
          }}
          onPersonalize={() => {
            setSetupWizardOpen(false);
            setSettingsFocusTarget('voice');
            navigate('Settings');
          }}
          onChooseDataDirectory={() => {
            setSetupWizardOpen(false);
            setSettingsFocusTarget('data');
            navigate('Settings');
          }}
          onSetupDelivery={() => {
            setSetupWizardOpen(false);
            setSettingsFocusTarget('credentials');
            navigate('Settings');
          }}
        />
      )}
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
