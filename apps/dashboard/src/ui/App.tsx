import { useWorkspaceRoute } from './hooks/useWorkspaceRoute';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { requestJson } from './api-client';
import {
  isGenerationJob,
  isGenerationRequest,
  isSavedReport,
  scheduleRecommendations,
  type GenerationRequest,
  type ReportKind,
} from '@sidekick/core';
import { Dialog } from './Dialog';
import { GuidedAISetup } from './GuidedAISetup';
import { ReportComposer } from './ReportComposer';
import { FriendlyError } from './FriendlyError';
import { WorkspaceSearch } from './WorkspaceSearch';
import { HomeStatus } from './HomeStatus';
import { WeeklyHome } from './WeeklyHome';
import { readTeamSelections, saveTeamSelections, selectedTeamId } from './team-selection';
import type { SchedulePrefill } from './ScheduleEditor';
import type { SearchTask } from './search-tasks';
import type { SearchDestination } from './search-catalog';
import { readSetupProgress, saveSetupProgress } from './setup-progress';
import type { ActionSetting } from '@sidekick/core';
import { LeagueDesk } from './LeagueDesk';
import { ReportsPage, type SendPreview } from './ReportsPage';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import {
  espnSeasonBounds,
  parseLeagueInput,
  detectLeagueLink,
  type Platform,
} from '@sidekick/core';
import { SettingsPage } from './SettingsPage';
import { ThemeSwitch } from './Appearance';
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
const HelpPage = lazy(() => import('./HelpPage').then((module) => ({ default: module.HelpPage })));
const AdvicePage = lazy(() =>
  import('./AdvicePage').then((module) => ({ default: module.AdvicePage })),
);
const SampleExperience = lazy(() =>
  import('./SampleExperience').then((module) => ({ default: module.SampleExperience })),
);
const ScheduleEditor = lazy(() =>
  import('./ScheduleEditor').then((module) => ({ default: module.ScheduleEditor })),
);
const DeliveryTask = lazy(() =>
  import('./DeliveryTask').then((module) => ({ default: module.DeliveryTask })),
);
const menu = [
  { section: 'League desk', label: 'Home', icon: Home },
  { section: 'Advice', label: 'Advice', icon: Sparkles },
  { section: 'Reports', label: 'Reports', icon: FileText },
  { section: 'Schedule', label: 'Schedule', icon: CalendarDays },
  { section: 'Settings', label: 'Settings', icon: Settings },
];
const tools = [
  { section: 'Leagues', label: 'Leagues', icon: Users },
  { section: 'Members & memory', label: 'League members', icon: MessageCircle },
  { section: 'Imports', label: 'Imports', icon: FileText },
  { section: 'Help', label: 'Help', icon: CircleHelp },
];

export function App() {
  const [verificationMode] = useState(
    () => typeof window !== 'undefined' && window.sidekickDesktop?.isVerificationMode?.() === true,
  );
  const [setupProgress] = useState(readSetupProgress);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [scheduleEditor, setScheduleEditor] = useState<{
    kind: ActionSetting['kind'];
    prefill?: SchedulePrefill;
  } | null>(null);
  const [deliveryTask, setDeliveryTask] = useState<Extract<
    SearchTask,
    { type: 'delivery' }
  > | null>(null);
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [adviceDirty, setAdviceDirty] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!sidebarRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        document.documentElement.style.setProperty(
          '--sidekick-nav-height',
          `${entry.target.getBoundingClientRect().height}px`,
        );
    });
    observer.observe(sidebarRef.current);
    return () => observer.disconnect();
  }, []);
  const [state, setState] = useState<AppState>(initialAppState);
  const [news, setNews] = useState<NewsSnapshot>({ items: [], stale: true });
  const [credentialProviders, setCredentialProviders] = useState<CredentialProvider[]>([]);
  const [testedRuntimeSignature, setTestedRuntimeSignature] = useState('');
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [reportDirty, setReportDirty] = useState(false);
  const [settingsNavigationKey, setSettingsNavigationKey] = useState(0);
  const [searchFocusRevision, setSearchFocusRevision] = useState(0);
  const { route, update: updateRoute } = useWorkspaceRoute(() => {
    if (
      (settingsDirty || reportDirty || scheduleDirty || adviceDirty) &&
      !window.confirm('Discard unsaved changes before leaving this page?')
    )
      return false;
    if (settingsDirty) setSettingsNavigationKey((current) => current + 1);
    setSettingsDirty(false);
    setReportDirty(false);
    setScheduleDirty(false);
    setAdviceDirty(false);
    setScheduleEditor(null);
    setDeliveryTask(null);
    return true;
  });
  const { section, leagueId: activeLeagueId, reportId: initialReviewId } = route;
  useEffect(() => {
    if (tools.some((tool) => tool.section === section)) setShowTools(true);
  }, [section]);
  const setSection = (section: string) => updateRoute({ section });
  const setActiveLeagueId = (leagueId: string) => updateRoute({ leagueId, reportId: '' });
  const setInitialReviewId = (reportId: string) => updateRoute({ reportId }, false, false);
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
      setSetupInProgress(false);
      if (!settingsDirty && !reportDirty && !scheduleDirty && !adviceDirty)
        updateRoute({ section: 'Reports', reportId: pendingJob.reportId }, false, false);
    } else
      showFailure(
        'Your report couldn’t be created. Open Reports to check its saved progress before trying again.',
        pendingJob.error,
        'reports',
      );
  }, [pendingJob?.id, pendingJob?.status, settingsDirty, reportDirty, scheduleDirty, adviceDirty]);
  const generatingRef = useRef(false);
  const [setupInProgress, setSetupInProgress] = useState(setupProgress?.inProgress ?? false);
  function navigate(next: string) {
    setSection(next);
  }
  const [settingsFocusTarget, setSettingsFocusTarget] = useState<
    'ai' | 'voice' | 'yahoo' | 'credentials' | 'data' | null
  >(null);
  const [modal, setModal] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [composerKind, setComposerKind] = useState<ReportKind | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [aiCheckError, setAiCheckError] = useState('');
  const [aiChecking, setAiChecking] = useState(false);
  const [aiCredentialRevision, setAiCredentialRevision] = useState(0);
  const [showTools, setShowTools] = useState(false);
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [setupWizardStep, setSetupWizardStep] = useState(setupProgress?.step ?? 0);
  const setupWizardTriggerRef = useRef<HTMLButtonElement>(null);
  const setupWizardCloseRef = useRef<HTMLButtonElement>(null);
  const [platform, setPlatform] = useState(setupProgress?.platform ?? 'sleeper');
  const [leagueId, setLeagueId] = useState(setupProgress?.leagueInput ?? '');
  const [espnSeason, setEspnSeason] = useState(setupProgress?.season ?? new Date().getFullYear());
  useEffect(() => {
    saveSetupProgress({
      inProgress: setupInProgress,
      step: setupWizardStep,
      platform,
      season: espnSeason,
      leagueInput: leagueId,
    });
  }, [setupInProgress, setupWizardStep, platform, espnSeason, leagueId]);
  useEffect(() => {
    if (!scheduleDirty || verificationMode) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [scheduleDirty, verificationMode]);
  const [busy, setBusy] = useState(false);
  const [refreshingLeagueId, setRefreshingLeagueId] = useState('');
  const [disconnectingLeagueId, setDisconnectingLeagueId] = useState('');
  const [refreshingNews, setRefreshingNews] = useState(false);
  const [retryingRunId, setRetryingRunId] = useState('');
  const [sendingReportId, setSendingReportId] = useState('');
  const [noticeInfo, setNoticeInfo] = useState({ message: '', detail: '', action: '' });
  const notice = noticeInfo.message;
  function setNotice(value: string | ((current: string) => string)) {
    setNoticeInfo((current) =>
      typeof value === 'function'
        ? { ...current, message: value(current.message) }
        : { message: value, detail: '', action: '' },
    );
  }
  function showFailure(message: string, error: unknown, action = 'retry') {
    setNoticeInfo({
      message,
      detail: error instanceof Error ? error.message : typeof error === 'string' ? error : '',
      action,
    });
  }
  const [stateLoaded, setStateLoaded] = useState(false);
  const [stateLoading, setStateLoading] = useState(true);
  const [stateLoadError, setStateLoadError] = useState('');
  const [serviceStatus, setServiceStatus] = useState<
    'checking' | 'running' | 'stopping' | 'stopped' | 'unavailable'
  >('checking');
  const league = resolveActiveLeague(state.leagues, activeLeagueId);
  const [teamSelections, setTeamSelections] = useState(readTeamSelections);
  const homeTeamId = selectedTeamId(league, teamSelections);
  function chooseTeam(id: string) {
    if (!league?.teams.some((team) => team.id === id)) return;
    const next = Object.fromEntries([
      ...Object.entries(teamSelections)
        .filter(([key]) => key !== league.id)
        .slice(-99),
      [league.id, id],
    ]);
    void saveTeamSelections(next).catch(() =>
      setNotice(
        'Your team choice is active for this session, but could not be saved on this device.',
      ),
    );
    setTeamSelections(next);
  }

  useEffect(() => {
    if (!league) return;
    if (activeLeagueId !== league.id && stateLoaded)
      updateRoute({ leagueId: league.id }, true, false);
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
      if (
        pendingGeneration &&
        !snapshot.generationJobs?.some((job) => job.requestId === pendingGeneration.requestId)
      ) {
        try {
          const job = await requestJson(
            '/api/generation-jobs/' + encodeURIComponent(pendingGeneration.requestId),
            isGenerationJob,
          );
          snapshot.generationJobs = [job, ...(snapshot.generationJobs ?? [])];
        } catch {
          /* Preserve the saved request through transient errors; retry reuses its ID. */
        }
      }
      if (sequence !== refreshSequence.current) return;
      setState(snapshot);
      setStateLoaded(true);
      setStateLoadError('');
      setServiceStatus('running');
      setNotice((current) =>
        current === 'Sunday Sidekick could not load. Reopen the app, then try again.'
          ? ''
          : current,
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
          : 'Sunday Sidekick could not load. Reopen the app, then try again.';
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
      showFailure(
        'Football news couldn’t be updated. Try refreshing it again later.',
        error,
        'news',
      );
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
      showFailure(
        'The scheduled report needs attention. Check its saved progress before trying again.',
        error,
        'reports',
      );
    } finally {
      setRetryingRunId('');
    }
  }

  async function connectLeague(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setConnectionError('');
    try {
      const detected = detectLeagueLink(leagueId);
      const selectedPlatform = detected?.platform ?? (platform as Platform);
      const parsed = detected ?? parseLeagueInput(selectedPlatform, leagueId);
      const response = await fetch('/api/leagues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: selectedPlatform,
          leagueId: parsed.leagueId,
          ...(selectedPlatform === 'espn' ? { season: parsed.season ?? espnSeason } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Unable to connect');
      setModal(false);
      setLeagueId('');
      setNotice(`Connected ${result.displayName}`);
      await refresh();
      if (typeof result.id === 'string') setActiveLeagueId(result.id);
      if (setupInProgress) {
        setSetupWizardStep(1);
        setSetupWizardOpen(true);
      }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Unable to connect');
    } finally {
      setBusy(false);
    }
  }

  async function createReport(kind: string) {
    if (!league) {
      setModal(true);
      return;
    }
    if (settingsDirty || reportDirty) {
      if (!window.confirm('Discard unsaved changes before creating a report?')) return;
      if (settingsDirty) setSettingsNavigationKey((current) => current + 1);
      setSettingsDirty(false);
      setReportDirty(false);
    }
    if (section === 'Reports' && initialReviewId) setInitialReviewId('');
    setComposerKind(kind as ReportKind);
  }

  async function generateReport(kind: string) {
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
      showFailure(
        'Report creation needs attention. Open Reports to check the saved request before trying again.',
        error,
        'reports',
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
      showFailure(
        'Your league couldn’t be disconnected. Try again from Leagues.',
        error,
        'leagues',
      );
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
      showFailure(
        'Your league data couldn’t be updated. Check the league connection and try again.',
        error,
        'leagues',
      );
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
      showFailure(
        'Your saved report couldn’t be loaded. Open Reports and try again.',
        error,
        'reports',
      );
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
        showFailure(
          'Delivery needs attention. Your saved report is still available; check its delivery history before retrying.',
          result.error,
          'reports',
        );
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
    const confirmed =
      verificationMode ||
      window.confirm(
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
  const aiReady = Boolean(
    runtime &&
    testedRuntimeSignature === JSON.stringify(runtime) &&
    (runtime.mode !== 'api' ||
      credentialProviders.some(
        (provider) => provider.provider === 'openai' && provider.configured,
      )),
  );
  const requiredSetupComplete = Number(Boolean(league)) + Number(aiReady);
  const lastCheckedRuntime = useRef('');
  // Check an existing connection once per configuration, without sending any league data.
  useEffect(() => {
    if (setupBusy || !stateLoaded || !runtime || testedRuntimeSignature === JSON.stringify(runtime))
      return;
    if (
      runtime.mode === 'api' &&
      !credentialProviders.some((provider) => provider.provider === 'openai' && provider.configured)
    )
      return;
    const signature = JSON.stringify(runtime);
    if (lastCheckedRuntime.current === signature) return;
    lastCheckedRuntime.current = signature;
    const abort = new AbortController();
    setAiChecking(true);
    setAiCheckError('');
    void requestJson(
      '/api/ai/test',
      (value): value is { ok: true } =>
        Boolean(value && typeof value === 'object' && 'ok' in value && value.ok === true),
      { method: 'POST', signal: abort.signal },
      60000,
    )
      .then(() => setTestedRuntimeSignature(signature))
      .catch((error) => {
        if (!abort.signal.aborted)
          setAiCheckError(
            error instanceof Error ? error.message : 'Could not test your AI connection.',
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setAiChecking(false);
      });
    return () => {
      abort.abort();
      setAiChecking(false);
    };
  }, [
    stateLoaded,
    setupBusy,
    aiCredentialRevision,
    runtime && JSON.stringify(runtime),
    credentialProviders.map((provider) => `${provider.provider}:${provider.configured}`).join('|'),
  ]);
  function openSetupWizard() {
    setSetupWizardStep(league && !homeTeamId ? 1 : suggestedSetupStep(Boolean(league), aiReady));
    setSetupInProgress(true);
    setSetupWizardOpen(true);
  }
  function searchNavigate(destination: SearchDestination, check = true) {
    const reviewedDiscard = Boolean(
      check && destination.task && (settingsDirty || reportDirty || scheduleDirty || adviceDirty),
    );
    if (reviewedDiscard) {
      if (!window.confirm('Discard unsaved changes before opening this task?')) return false;
      if (settingsDirty) setSettingsNavigationKey((current) => current + 1);
      setSettingsDirty(false);
      setReportDirty(false);
      setScheduleDirty(false);
      setAdviceDirty(false);
    }
    const accepted = updateRoute(
      {
        section: destination.section,
        leagueId: destination.leagueId ?? activeLeagueId,
        reportId: destination.reportId ?? '',
        settingId: destination.settingId ?? '',
        helpId: destination.helpId ?? '',
        adviceMode: destination.adviceMode ?? 'lineup',
        adviceId: destination.adviceId ?? '',
      },
      false,
      check && !reviewedDiscard,
    );
    if (accepted) {
      setSettingsFocusTarget(null);
      setSearchFocusRevision((current) => current + 1);
      if (destination.task?.type === 'schedule')
        setScheduleEditor({
          kind: destination.task.prefill.kind,
          prefill: destination.task.prefill,
        });
      else if (destination.task?.type === 'delivery') setDeliveryTask(destination.task);
    }
    return accepted;
  }
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
  return (
    <div className="app-shell">
      <aside ref={sidebarRef} className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Zap size={19} fill="currentColor" />
          </div>
          <span>
            Sunday<span className="brand-light">Sidekick</span>
          </span>
        </div>
        <nav className="nav-list">
          {menu.map(({ section: destination, label, icon: Icon }) => (
            <button
              key={label}
              aria-current={section === destination ? 'page' : undefined}
              onClick={() => navigate(destination)}
              className={`nav-item ${section === destination ? 'active' : ''}`}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {label === 'Home' && <i className="nav-dot" />}
            </button>
          ))}
          <details
            className="more-tools"
            open={showTools}
            onToggle={(event) => setShowTools(event.currentTarget.open)}
          >
            <summary>More tools</summary>
            {tools.map(({ section: destination, label, icon: Icon }) => (
              <button
                type="button"
                key={destination}
                className={`nav-item ${section === destination ? 'active' : ''}`}
                onClick={() => navigate(destination)}
              >
                <Icon size={17} />
                <span>{label}</span>
              </button>
            ))}
          </details>
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
          <button type="button" className="help-link" onClick={() => navigate('Help')}>
            <CircleHelp size={16} /> Help & FAQ
          </button>
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
          <WorkspaceSearch
            leagues={state.leagues}
            reports={state.reports}
            onNavigate={searchNavigate}
          />
          <div className="top-actions">
            <span className="date-label">{dateLabel}</span>
            <ThemeSwitch />
            <span className={`status-pulse ${serviceStatus !== 'running' ? 'offline' : ''}`} />
            <span
              className="date-label"
              title={serviceStatus === 'running' ? 'Local service running' : 'Local service'}
            >
              {serviceStatus === 'running'
                ? verificationMode
                  ? 'Test profile'
                  : 'Running'
                : 'Service'}
            </span>
          </div>
        </header>

        <div className="page-content">
          {notice && noticeInfo.detail ? (
            <>
              <FriendlyError
                message={notice}
                detail={noticeInfo.detail}
                action={
                  noticeInfo.action === 'reports'
                    ? 'Open Reports'
                    : noticeInfo.action === 'leagues'
                      ? 'Check league connection'
                      : noticeInfo.action === 'news'
                        ? 'Refresh news'
                        : 'Try again'
                }
                onAction={() => {
                  if (noticeInfo.action === 'reports') navigate('Reports');
                  else if (noticeInfo.action === 'leagues') navigate('Leagues');
                  else if (noticeInfo.action === 'news') void refreshNews();
                  else void refresh();
                }}
              />
              <button type="button" className="text-button" onClick={() => setNotice('')}>
                Dismiss message
              </button>
            </>
          ) : (
            notice && (
              <div className="notice" role="status">
                {notice}
                <button onClick={() => setNotice('')} aria-label="Dismiss">
                  ×
                </button>
              </div>
            )
          )}
          {setupInProgress && stateLoaded && !setupWizardOpen && (
            <div className="onboarding-progress" role="status">
              <strong>Continue setting up your league</strong>
              <span>
                {!league
                  ? 'Connect a league'
                  : !aiReady
                    ? 'Connect your AI writer'
                    : 'Generate and review your first draft'}
              </span>
              <button
                type="button"
                className="small-button"
                onClick={() => {
                  if (league && aiReady) {
                    void createReport('power-rankings');
                  } else if (!league && leagueId.trim()) setModal(true);
                  else openSetupWizard();
                }}
                disabled={Boolean(generatingKind)}
              >
                {league && aiReady
                  ? 'Create first report'
                  : !league && leagueId.trim()
                    ? 'Resume league connection'
                    : 'Continue setup'}
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
          {aiCheckError && section === 'League desk' && (
            <FriendlyError
              message="Your AI connection needs attention before you can create a report."
              detail={aiCheckError}
              action="Fix AI connection"
              onAction={openSetupWizard}
            />
          )}
          {!stateLoaded && section !== 'Help' ? (
            stateLoading ? (
              <LoadingStatus message="Loading your leagues, reports, and schedule…" />
            ) : (
              <LoadError
                message={stateLoadError || 'Could not load local league data.'}
                onRetry={() => void refresh()}
              />
            )
          ) : section === 'Help' ? (
            <Suspense fallback={<LoadingStatus message="Opening help…" />}>
              <HelpPage
                key={searchFocusRevision}
                articleId={route.helpId ?? ''}
                onNavigate={searchNavigate}
                onSample={() => setSampleOpen(true)}
              />
            </Suspense>
          ) : section === 'Advice' ? (
            <Suspense fallback={<LoadingStatus message="Opening advice…" />}>
              <AdvicePage
                key={`${activeLeagueId}:${route.adviceMode ?? 'lineup'}:${route.adviceId ?? ''}`}
                leagues={state.leagues}
                leagueId={activeLeagueId}
                preferredTeamId={homeTeamId}
                onTeamSelect={chooseTeam}
                mode={route.adviceMode ?? 'lineup'}
                resultId={route.adviceId ?? ''}
                onNavigate={searchNavigate}
                onDirtyChange={setAdviceDirty}
              />
            </Suspense>
          ) : section === 'Settings' ? (
            <SettingsPage
              key={settingsNavigationKey}
              settings={state.settings}
              leagues={state.leagues}
              onGuidedSetup={() => {
                if (
                  !settingsDirty ||
                  window.confirm('Discard unsaved settings before guided setup?')
                ) {
                  if (settingsDirty) setSettingsNavigationKey((current) => current + 1);
                  setSettingsDirty(false);
                  setSetupWizardStep(1);
                  setSetupInProgress(true);
                  setSetupWizardOpen(true);
                }
              }}
              onSaved={(settings) => {
                setState((current) => ({ ...current, settings }));
              }}
              onCredentialsChanged={(provider) => {
                if (provider === 'openai') {
                  setTestedRuntimeSignature('');
                  setAiCredentialRevision((current) => current + 1);
                  lastCheckedRuntime.current = '';
                }
                void refreshCredentials();
              }}
              onRuntimeTested={(testedRuntime) => {
                setTestedRuntimeSignature(JSON.stringify(testedRuntime));
                setAiCheckError('');
              }}
              focusTarget={settingsFocusTarget}
              searchSettingId={route.settingId}
              searchFocusRevision={searchFocusRevision}
              onSearchSettingClear={() => updateRoute({ settingId: '' }, true, false)}
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
              onReviewChange={setInitialReviewId}
              onCreate={() => void createReport('power-rankings')}
              onDeliverySetup={() => {
                setSettingsFocusTarget('credentials');
                navigate('Settings');
              }}
              onSend={sendReport}
              onSaved={refresh}
              onDirtyChange={setReportDirty}
              league={league}
              generating={Boolean(generatingKind)}
              onCreateKind={(kind) => void createReport(kind)}
              onSchedule={(kind) => {
                const action = state.settings.actions.find((item) => item.kind === kind);
                if (
                  action?.enabled &&
                  action.schedule.enabled &&
                  (action.leagueIds === undefined ||
                    (league && action.leagueIds.includes(league.id)))
                ) {
                  setScheduleEditor({ kind });
                } else {
                  const recommendation = scheduleRecommendations[kind];
                  setScheduleEditor({
                    kind,
                    prefill: {
                      kind,
                      source: 'report-library',
                      frequency: recommendation?.frequency ?? 'once',
                      weekday: recommendation?.weekday,
                      dayOfMonth: recommendation?.dayOfMonth,
                      time: recommendation?.time ?? '09:00',
                      channel: 'dashboard',
                      leagueIds: league ? [league.id] : [],
                    },
                  });
                }
              }}
            />
          ) : section === 'Schedule' ? (
            <SchedulePage
              actions={state.settings.actions}
              scheduledRuns={state.scheduledRuns}
              retryingRunId={retryingRunId}
              generatingKind={generatingKind}
              onGenerate={(kind) => void createReport(kind)}
              onEditSchedule={() =>
                updateRoute({ section: 'Settings', settingId: 'automatic-actions' })
              }
              leagueName={league?.displayName}
              settings={state.settings}
              onEditAction={(kind) => setScheduleEditor({ kind })}
              onRetry={(run) => void retryScheduledRun(run)}
            />
          ) : section === 'Members & memory' || section === 'Imports' ? (
            <>
              <MemoryPage
                mode={section === 'Imports' ? 'imports' : 'members'}
                leagues={state.leagues.map(({ id, displayName }) => ({ id, displayName }))}
                memoryEnabled={state.settings.memoryEnabled}
                analyzeImportsWithAI={state.settings.analyzeImportsWithAI}
                imessageConfigured={
                  state.settings.imessageProvider === 'imsg'
                    ? navigator.platform.toLowerCase().startsWith('mac') &&
                      Boolean(state.settings.imsgChatId)
                    : credentialProviders.some(
                        (item) => item.provider === 'bluebubbles' && item.configured,
                      )
                }
                twilioConfigured={credentialProviders.some(
                  (item) => item.provider === 'twilio' && item.configured,
                )}
                resendConfigured={credentialProviders.some(
                  (item) => item.provider === 'resend' && item.configured,
                )}
                imessageProvider={state.settings.imessageProvider ?? 'bluebubbles'}
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
              <LeagueDesk
                weekly={
                  <WeeklyHome
                    league={league}
                    settings={state.settings}
                    teamId={homeTeamId}
                    onTeamChange={chooseTeam}
                    onSavedAdvice={(id, mode) =>
                      searchNavigate({ section: 'Advice', adviceMode: mode, adviceId: id })
                    }
                    onAdvice={(mode) =>
                      searchNavigate({ section: 'Advice', adviceMode: mode, adviceId: '' })
                    }
                    onRefresh={() => {
                      if (league) void refreshLeague(league.id);
                    }}
                    onSetup={openSetupWizard}
                  />
                }
                state={state}
                league={league}
                aiReady={aiReady}
                aiChecking={aiChecking}
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
                onSample={() => setSampleOpen(true)}
                status={
                  <HomeStatus
                    settings={state.settings}
                    league={league}
                    aiReady={aiReady}
                    aiChecking={aiChecking}
                    onAI={openSetupWizard}
                    onLeagues={() => navigate('Leagues')}
                    onSchedules={() => navigate('Schedule')}
                    onDelivery={() =>
                      searchNavigate({ section: 'Settings', settingId: 'automatic-actions' })
                    }
                  />
                }
              />
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

      {sampleOpen && (
        <Suspense fallback={<LoadingStatus message="Opening preview…" />}>
          <SampleExperience
            onClose={() => setSampleOpen(false)}
            onSetup={() => {
              setSampleOpen(false);
              openSetupWizard();
            }}
          />
        </Suspense>
      )}
      {scheduleEditor && (
        <Suspense fallback={<LoadingStatus message="Opening preview…" />}>
          <ScheduleEditor
            key={`${scheduleEditor.kind}:${searchFocusRevision}`}
            settings={state.settings}
            leagues={state.leagues}
            kind={scheduleEditor.kind}
            prefill={scheduleEditor.prefill}
            onClose={() => {
              setScheduleEditor(null);
              setScheduleDirty(false);
            }}
            onSaved={(settings) => {
              setState((current) => ({ ...current, settings }));
              setNotice('Schedule saved. The next planned run is shown on Schedule.');
            }}
            onDirtyChange={setScheduleDirty}
          />
        </Suspense>
      )}
      {deliveryTask && (
        <Suspense fallback={<LoadingStatus message="Opening preview…" />}>
          <DeliveryTask
            task={deliveryTask}
            settings={state.settings}
            onSaved={(settings) => setState((current) => ({ ...current, settings }))}
            onClose={() => setDeliveryTask(null)}
            onDeliverySetup={() => {
              setDeliveryTask(null);
              searchNavigate({ section: 'Settings', settingId: 'email-recipient' });
            }}
          />
        </Suspense>
      )}
      {composerKind && league && (
        <ReportComposer
          key={`${league.id}:${composerKind}`}
          league={league}
          initialKind={composerKind}
          busy={Boolean(generatingKind)}
          ready={aiReady}
          onClose={() => setComposerKind(null)}
          onSetup={() => {
            setComposerKind(null);
            openSetupWizard();
          }}
          onCreate={(kind) => {
            setComposerKind(null);
            void generateReport(kind);
          }}
        />
      )}
      {modal && (
        <Dialog
          titleId="connect-league-title"
          className="connect-modal"
          onClose={() => {
            if (!busy) setModal(false);
          }}
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
              Fantasy platform
              <select
                disabled={busy}
                value={platform}
                onChange={(event) => {
                  setPlatform(event.target.value as Platform);
                  setConnectionError('');
                }}
              >
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
                disabled={busy}
                maxLength={2048}
                onChange={(event) => {
                  const value = event.target.value;
                  setLeagueId(value);
                  setConnectionError('');
                  const detected = detectLeagueLink(value);
                  if (detected) {
                    setPlatform(detected.platform);
                    if (detected.season) setEspnSeason(detected.season);
                  }
                }}
                placeholder="Paste a league URL or ID"
              />
            </label>
            {detectLeagueLink(leagueId) && (
              <p role="status">
                ✓ {capitalize(detectLeagueLink(leagueId)!.platform)} league recognized. We’ll check
                access when you connect.
              </p>
            )}
            <details className="connection-help">
              <summary>Where do I find my league link?</summary>
              <p>
                Open your league in a web browser, then copy the address from the address bar. Paste
                it above.
              </p>
              <p>
                {platform === 'sleeper'
                  ? 'Sleeper: open your league on sleeper.com. Use the league page, rather than an invite link.'
                  : platform === 'espn'
                    ? 'ESPN: open Fantasy Football, select your league, and copy the League home address. The link may include the season year.'
                    : 'Yahoo: open Fantasy Football, select your league, and copy its home-page address.'}
              </p>
              <p>If you only have a league ID, select your platform and enter the ID instead.</p>
            </details>
            {connectionError && (
              <FriendlyError
                message="We couldn’t connect your league. Check the link and any private-league access below, then try Connect league again."
                detail={connectionError}
              />
            )}
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
              Public leagues can connect directly. Private leagues need permission from your own
              account.
            </small>
            {platform === 'yahoo' &&
              !credentialProviders.some(
                (credential) => credential.provider === 'yahoo' && credential.configured,
              ) && (
                <div className="provider-setup-callout" role="note">
                  <p>
                    Sign in to Yahoo and authorize league access before connecting. If account
                    connection has not been set up, the Yahoo settings include the required steps.
                  </p>
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
                  <p>
                    For a private ESPN league, add your own ESPN access details first. The ESPN
                    access card explains how to find them. Public leagues can connect without this
                    step.
                  </p>
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
          busy={setupBusy}
          teamSetup={
            league && (
              <section>
                <h3>Choose your team</h3>
                <p>
                  Pick the roster you manage. The choice stays on this device and does not change
                  platform ownership.
                </p>
                <label>
                  Your team
                  <select
                    value={homeTeamId ?? ''}
                    onChange={(event) => chooseTeam(event.target.value)}
                  >
                    <option value="">Choose your team</option>
                    {league.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!homeTeamId && <p>Choose a team to continue to AI setup.</p>}
              </section>
            )
          }
          aiSetup={
            homeTeamId ? (
              <GuidedAISetup
                settings={state.settings}
                onSaved={(settings) => setState((current) => ({ ...current, settings }))}
                onCredentialsChanged={(provider) => {
                  if (provider === 'openai') {
                    setTestedRuntimeSignature('');
                    setAiCredentialRevision((current) => current + 1);
                    lastCheckedRuntime.current = '';
                  }
                  void refreshCredentials();
                }}
                onReady={(testedRuntime) => {
                  setTestedRuntimeSignature(JSON.stringify(testedRuntime));
                  setAiCheckError('');
                  setSetupWizardStep(2);
                }}
                onBusyChange={setSetupBusy}
                onAdvanced={() => {
                  setSetupWizardOpen(false);
                  setSettingsFocusTarget('ai');
                  navigate('Settings');
                }}
              />
            ) : (
              <p>Your league can be browsed without AI. Select a team first.</p>
            )
          }
          closeButtonRef={setupWizardCloseRef}
          onStepChange={setSetupWizardStep}
          onClose={() => {
            if (!setupBusy) setSetupWizardOpen(false);
          }}
          onConnectLeague={() => {
            setSetupWizardOpen(false);
            setModal(true);
          }}
          onSetupAi={() => {
            setSetupWizardOpen(false);
            setSettingsFocusTarget('ai');
            navigate('Settings');
          }}
          ready={Boolean(league) && Boolean(homeTeamId) && aiReady}
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
            searchNavigate({ section: 'Settings', settingId: 'imessage-group' });
          }}
        />
      )}
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
