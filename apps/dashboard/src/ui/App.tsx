import { ConnectLeagueDialog } from './ConnectLeagueDialog';
import { useWorkspaceRoute } from './hooks/useWorkspaceRoute';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { requestJson } from './api-client';
import {
  isGenerationJob,
  isSavedReport,
  scheduleRecommendations,
  type GenerationRequest,
  type ReportKind,
} from '@sidekick/core';
import { GuidedAISetup } from './GuidedAISetup';
import { ReportComposer } from './ReportComposer';
import { FriendlyError } from './FriendlyError';
import { describeError } from './error-text';
import { ConfirmHost, confirmAction, discardOptions } from './ConfirmDialog';
import { getDisplayPreferences } from './display-preferences';
import { AppSidebar, AppTopbar, isPhoneLayout, isToolSection } from './AppChrome';
import { HomeStatus } from './HomeStatus';
import { WeeklyHome } from './WeeklyHome';
import { useChatPanel } from './hooks/useChatPanel';
import { usePendingGeneration } from './hooks/usePendingGeneration';
import { useTeamSelection } from './hooks/useTeamSelection';
import { ChatBox } from './ChatBox';
import type { SchedulePrefill } from './ScheduleEditor';
import type { SearchTask } from './search-tasks';
import type { SearchDestination } from './search-catalog';
import { readSetupProgress, saveSetupProgress } from './setup-progress';
import type { ActionSetting } from '@sidekick/core';
import { LeagueDesk, type HomeDisclosures } from './LeagueDesk';
import type { SendPreview } from './ReportsPage';

import { Suspense, useEffect, useRef, useState } from 'react';
import { parseLeagueInput, detectLeagueLink, leagueFormat, type Platform } from '@sidekick/core';
import { SetupWizard } from './SetupWizard';
import { resolveActiveLeague } from './league-selection';
import { suggestedSetupStep } from './setup';

import type { ScheduledRun } from './SchedulePage';

import { LoadError, LoadingStatus } from './LoadFeedback.js';
import { KeyboardShortcutsDialog, useKeyboardShortcuts } from './KeyboardShortcuts';
import {
  initialAppState,
  isAppState,
  isCredentialProviders,
  isNewsSnapshot,
  type AppState,
  type CredentialProvider,
  type NewsSnapshot,
} from './app-state';
import {
  pageLoaders,
  HelpPage,
  AdvicePage,
  SampleExperience,
  ScheduleEditor,
  SettingsPage,
  LeaguesPage,
  ReportsPage,
  SchedulePage,
  MemoryPage,
  DeliveryTask,
  LivePage,
  DynastyPage,
} from './lazy-pages';

// The address at launch, before routing normalizes it.
const launchHash = typeof location === 'undefined' ? '' : location.hash;
export function App() {
  const [verificationMode] = useState(
    () => typeof window !== 'undefined' && window.sidekickDesktop?.isVerificationMode?.() === true,
  );
  const [setupProgress] = useState(readSetupProgress);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [homeDisclosures, setHomeDisclosures] = useState<HomeDisclosures>({});
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
  const clearUnsaved = () => {
    if (settingsDirty) setSettingsNavigationKey((current) => current + 1);
    setSettingsDirty(false);
    setReportDirty(false);
    setScheduleDirty(false);
    setAdviceDirty(false);
    setScheduleEditor(null);
    setDeliveryTask(null);
  };
  const { route, update: updateRoute } = useWorkspaceRoute(() => {
    if (!(settingsDirty || reportDirty || scheduleDirty || adviceDirty)) {
      clearUnsaved();
      return true;
    }
    return confirmAction('Your edits on this page haven’t been saved.', discardOptions).then(
      (ok) => {
        if (ok) clearUnsaved();
        return ok;
      },
    );
  });
  const { section, leagueId: activeLeagueId, reportId: initialReviewId } = route;
  useEffect(() => {
    // A fresh launch (no page in the address) opens the owner's chosen start page.
    const start = getDisplayPreferences().startPage;
    if (start !== 'League desk' && !/^#\/[a-z]/.test(launchHash))
      updateRoute({ section: start }, true, false);
    // Only on first load.
  }, []);
  useEffect(() => {
    // On phones More is a pop-up menu over the page, so it must not reopen by itself.
    if (isToolSection(section) && !isPhoneLayout()) setShowTools(true);
  }, [section]);
  const setSection = (section: string) => updateRoute({ section });
  const setActiveLeagueId = (leagueId: string) => updateRoute({ leagueId, reportId: '' });
  const setInitialReviewId = (reportId: string) => updateRoute({ reportId }, false, false);
  const [generatingKind, setGeneratingKind] = useState('');
  const [pendingGeneration, setPendingGeneration] = usePendingGeneration();
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
  const shortcuts = useKeyboardShortcuts({
    onNavigate: navigate,
    onNewReport: () => void createReport('power-rankings'),
  });
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
  const [chatOpen, setChatOpen] = useChatPanel();
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
    setNoticeInfo((current) => {
      if (typeof value === 'function') return { ...current, message: value(current.message) };
      if (!value) return { message: '', detail: '', action: '' };
      // Raw network text and request references move into the support details. A plain notice
      // has no retry: the failed action is not known here (showFailure names one when it is).
      const { message, detail } = describeError(value);
      return { message, detail: detail ?? '', action: 'none' };
    });
  }
  function showFailure(message: string, error: unknown, action = 'retry') {
    const described = describeError(error, '');
    setNoticeInfo({
      message,
      detail: [described.message, described.detail].filter(Boolean).join(' · '),
      action,
    });
  }
  const [stateLoaded, setStateLoaded] = useState(false);
  const hasLeagues = state.leagues.length > 0;
  useEffect(() => {
    if (!stateLoaded || !hasLeagues) return;
    // Public NFL data takes seconds to download cold; warm it before Advice is opened.
    // The server cache lasts six hours, so refresh it while the dashboard stays open.
    const warm = () => void fetch('/api/advice/warm', { method: 'POST' }).catch(() => undefined);
    const idle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(warm)
        : window.setTimeout(warm, 1_000);
    const timer = window.setInterval(warm, 5 * 60 * 60 * 1_000);
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      window.clearInterval(timer);
    };
  }, [stateLoaded, hasLeagues]);
  useEffect(() => {
    if (!stateLoaded) return;
    const prefetch = () => {
      for (const load of Object.values(pageLoaders)) void load().catch(() => undefined);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch);
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(prefetch, 1_000);
    return () => window.clearTimeout(timer);
  }, [stateLoaded]);
  const [stateLoading, setStateLoading] = useState(true);
  const [stateLoadError, setStateLoadError] = useState('');
  const [serviceStatus, setServiceStatus] = useState<
    'checking' | 'running' | 'stopping' | 'stopped' | 'unavailable'
  >('checking');
  const league = resolveActiveLeague(state.leagues, activeLeagueId);
  const { teamId: homeTeamId, chooseTeam } = useTeamSelection(league, () =>
    setNotice(
      'Your team choice is active for this session, but could not be saved on this device.',
    ),
  );

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
      if (stateLoaded) showFailure('Could not refresh local league data.', error);
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
      !(await confirmAction(
        `This creates ${failedCount} report draft${failedCount === 1 ? '' : 's'} for review and will not send messages.`,
        {
          title: `Retry ${failedCount} failed league result${failedCount === 1 ? '' : 's'}?`,
          confirmLabel: 'Retry as drafts',
        },
      ))
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
      if (
        !(await confirmAction('Creating a report will discard your unsaved edits.', discardOptions))
      )
        return;
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
      !(await confirmAction(
        'This removes its saved league snapshot, imported projections, and calendar events. Existing reports and member profiles will remain.',
        {
          title: `Disconnect ${disconnectedLeague.displayName}?`,
          confirmLabel: 'Disconnect',
          tone: 'danger',
        },
      ))
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
    const saved = state.leagues.find((l) => l.id === id);
    if (saved?.connectionMode === 'snapshot') {
      setPlatform('espn');
      setLeagueId(id);
      setEspnSeason(saved.season ?? new Date().getFullYear());
      setConnectionError('');
      setNotice(
        credentialProviders.some((item) => item.provider === 'espn' && item.configured)
          ? 'Your ESPN access is saved. Choose Connect league to switch to automatic refresh, or import a new snapshot.'
          : 'Import a new browser snapshot to update this league, or add ESPN access in Settings for automatic refresh.',
      );
      setModal(true);
      return;
    }
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
      const confirmed = await confirmAction(
        `The provider may already have delivered this message. Check its delivery history first. ${usesResendIdempotency ? 'Resend reuses this request key for 24 hours; after that, a retry may send a duplicate. The retry uses the original saved recipient, subject, and text. ' : 'This SMS retry has no provider idempotency key and may send a duplicate. '}Retry only if you confirmed it was not delivered.`,
        {
          title: 'Retry a delivery that may have gone through?',
          confirmLabel: 'Retry delivery',
          tone: 'danger',
        },
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
      (await confirmAction(
        'This stops the local service and scheduled jobs. If you installed the background service, start it with npm run service -- start. Otherwise run npm start or npm run dev.',
        { title: 'Stop Sunday Sidekick?', confirmLabel: 'Stop app', tone: 'danger' },
      ));
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
      .then(() => {
        if (!abort.signal.aborted) setTestedRuntimeSignature(signature);
      })
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
      if (lastCheckedRuntime.current === signature) lastCheckedRuntime.current = '';
      setAiChecking(false);
    };
  }, [
    stateLoaded,
    setupBusy,
    aiCredentialRevision,
    runtime && JSON.stringify(runtime),
    runtime?.mode === 'api'
      ? credentialProviders
          .map((provider) => `${provider.provider}:${provider.configured}`)
          .join('|')
      : '',
  ]);
  function openSetupWizard() {
    setSetupWizardStep(league && !homeTeamId ? 1 : suggestedSetupStep(Boolean(league), aiReady));
    setSetupInProgress(true);
    setSetupWizardOpen(true);
  }
  async function searchNavigate(destination: SearchDestination, check = true) {
    // Ask here (not in the route guard) so the task below opens only after an answer.
    const reviewedDiscard = Boolean(
      check && (settingsDirty || reportDirty || scheduleDirty || adviceDirty),
    );
    if (reviewedDiscard) {
      const ok = await confirmAction(
        destination.task
          ? 'Opening this task will discard your unsaved edits.'
          : 'Your edits on this page haven’t been saved.',
        discardOptions,
      );
      if (!ok) return false;
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
        ...(destination.adviceView
          ? { adviceView: destination.adviceView }
          : { adviceView: undefined }),
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
    <div className={`app-shell${chatOpen && section !== 'Ask' ? ' chat-docked' : ''}`}>
      <AppSidebar
        asideRef={sidebarRef}
        section={section}
        showTools={showTools}
        onShowToolsChange={setShowTools}
        serviceStatus={serviceStatus}
        onNavigate={navigate}
        onStop={() => void stopApplication()}
        dynastyLeague={
          league ? leagueFormat(league, state.settings.preferences) !== 'redraft' : false
        }
      />

      <main className="main-area">
        <AppTopbar
          league={league}
          leagues={state.leagues}
          reports={state.reports}
          dateLabel={dateLabel}
          serviceStatus={serviceStatus}
          verificationMode={verificationMode}
          onLeagueChange={setActiveLeagueId}
          onSearchNavigate={searchNavigate}
          staleAfterHours={state.settings.leagueStaleAfterHours ?? 24}
          refreshing={Boolean(league && refreshingLeagueId === league.id)}
          {...(league ? { onFreshen: () => void refreshLeague(league.id) } : {})}
          chatOpen={chatOpen}
          {...(section !== 'Ask' ? { onChat: () => setChatOpen((open) => !open) } : {})}
        />

        <div className="page-content">
          {notice && noticeInfo.detail ? (
            <>
              <FriendlyError
                message={notice}
                detail={noticeInfo.detail}
                {...(noticeInfo.action === 'none'
                  ? {}
                  : {
                      action:
                        noticeInfo.action === 'reports'
                          ? 'Open Reports'
                          : noticeInfo.action === 'leagues'
                            ? 'Check league connection'
                            : noticeInfo.action === 'news'
                              ? 'Refresh news'
                              : 'Try again',
                      onAction: () => {
                        if (noticeInfo.action === 'reports') navigate('Reports');
                        else if (noticeInfo.action === 'leagues') navigate('Leagues');
                        else if (noticeInfo.action === 'news') void refreshNews();
                        else void refresh();
                      },
                    })}
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
              <LoadingStatus message="Loading your leagues, reports, and schedule…" shape="cards" />
            ) : (
              <LoadError
                message={stateLoadError || 'Could not load local league data.'}
                onRetry={() => void refresh()}
              />
            )
          ) : section === 'Live' ? (
            <Suspense fallback={<LoadingStatus message="Opening live view…" />}>
              <LivePage
                league={league}
                teamId={homeTeamId}
                onLeagues={() => navigate('Leagues')}
                onChooseTeam={chooseTeam}
              />
            </Suspense>
          ) : section === 'Dynasty' ? (
            <Suspense fallback={<LoadingStatus message="Opening dynasty view…" />}>
              <DynastyPage
                league={league}
                teamId={homeTeamId}
                onChooseTeam={chooseTeam}
                onPersonalize={() =>
                  void searchNavigate({
                    section: 'Settings',
                    settingId: 'personalize-league-format',
                  })
                }
              />
            </Suspense>
          ) : section === 'Help' ? (
            <Suspense fallback={<LoadingStatus message="Opening help…" />}>
              <HelpPage
                key={searchFocusRevision}
                articleId={route.helpId ?? ''}
                onNavigate={searchNavigate}
                onSample={() => setSampleOpen(true)}
              />
            </Suspense>
          ) : section === 'Ask' ? (
            <div className="ask-page">
              <div className="page-title-block">
                <div>
                  <p className="section-overline">CHAT WITH YOUR DATA</p>
                  <h1>Ask Sidekick</h1>
                  <p>
                    Lineups, standings, waivers, news and betting prices, answered from your league
                    data with the receipts attached.
                  </p>
                </div>
              </div>
              <ChatBox variant="page" leagueId={league?.id} teamId={homeTeamId} page="Ask" />
            </div>
          ) : section === 'Advice' ? (
            <Suspense fallback={<LoadingStatus message="Opening advice…" />}>
              <AdvicePage
                key={`${activeLeagueId}:${route.adviceMode ?? 'lineup'}:${route.adviceId ?? ''}:${route.adviceView ?? ''}`}
                initialView={route.adviceView === 'results' ? 'research' : 'decision'}
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
            <Suspense fallback={<LoadingStatus message="Opening settings…" />}>
              <SettingsPage
                key={settingsNavigationKey}
                settings={state.settings}
                leagues={state.leagues}
                onGuidedSetup={async () => {
                  if (
                    !settingsDirty ||
                    (await confirmAction(
                      'Guided setup will discard your unsaved settings.',
                      discardOptions,
                    ))
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
            </Suspense>
          ) : section === 'Leagues' ? (
            <Suspense fallback={<LoadingStatus message="Opening leagues…" />}>
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
                onAddEspnLogin={() =>
                  searchNavigate({ section: 'Settings', settingId: 'credential-espn' })
                }
              />
            </Suspense>
          ) : section === 'Reports' ? (
            <Suspense fallback={<LoadingStatus message="Opening reports…" />}>
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
            </Suspense>
          ) : section === 'Schedule' ? (
            <Suspense fallback={<LoadingStatus message="Opening schedule…" />}>
              <SchedulePage
                actions={state.settings.actions}
                scheduledRuns={state.scheduledRuns}
                reports={state.reports}
                retryingRunId={retryingRunId}
                generatingKind={generatingKind}
                onGenerate={(kind) => void createReport(kind)}
                onEditSchedule={() =>
                  updateRoute({ section: 'Settings', settingId: 'automatic-actions' })
                }
                leagueName={league?.displayName}
                manualSnapshot={league?.connectionMode === 'snapshot'}
                league={league}
                settings={state.settings}
                onEditAction={(kind) => setScheduleEditor({ kind })}
                onRetry={(run) => void retryScheduledRun(run)}
              />
            </Suspense>
          ) : section === 'Members & memory' || section === 'Imports' ? (
            <>
              <Suspense fallback={<LoadingStatus message="Opening members…" />}>
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
              </Suspense>
            </>
          ) : (
            <>
              <LeagueDesk
                disclosures={homeDisclosures}
                onDisclosureChange={(key, open) =>
                  setHomeDisclosures((current) =>
                    current[key] === open ? current : { ...current, [key]: open },
                  )
                }
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
                    onLive={() => navigate('Live')}
                    onPersonalize={(settingId) =>
                      void searchNavigate({ section: 'Settings', settingId })
                    }
                    onResults={() =>
                      searchNavigate({ section: 'Advice', adviceId: '', adviceView: 'results' })
                    }
                    onRefresh={() => {
                      if (league) void refreshLeague(league.id);
                    }}
                    onSetup={() => {
                      setSetupInProgress(true);
                      setSetupWizardStep(0);
                      setSetupWizardOpen(false);
                      setModal(true);
                    }}
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
      {chatOpen && section !== 'Ask' && (
        <aside className="chat-dock">
          <ChatBox
            variant="panel"
            leagueId={league?.id}
            teamId={homeTeamId}
            page={section}
            onClose={() => setChatOpen(false)}
          />
        </aside>
      )}

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
      {shortcuts.helpOpen && <KeyboardShortcutsDialog onClose={shortcuts.closeHelp} />}
      <ConfirmHost />
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
        <ConnectLeagueDialog
          busy={busy}
          platform={platform}
          onPlatformChange={setPlatform}
          leagueId={leagueId}
          onLeagueIdChange={setLeagueId}
          espnSeason={espnSeason}
          onEspnSeasonChange={setEspnSeason}
          connectionError={connectionError}
          onConnectionErrorChange={setConnectionError}
          yahooConfigured={credentialProviders.some(
            (credential) => credential.provider === 'yahoo' && credential.configured,
          )}
          espnConfigured={credentialProviders.some(
            (credential) => credential.provider === 'espn' && credential.configured,
          )}
          onSubmit={connectLeague}
          onClose={() => setModal(false)}
          onBusy={setBusy}
          onSetupAccess={(target) => {
            setModal(false);
            setSettingsFocusTarget(target);
            navigate('Settings');
          }}
          onImported={async (result) => {
            setModal(false);
            setLeagueId('');
            setNotice(
              `Imported ${result.displayName}. Automatic refresh isn’t available for imports; re-import to update.`,
            );
            await refresh();
            setActiveLeagueId(result.id);
            if (setupInProgress) {
              setSetupWizardStep(1);
              setSetupWizardOpen(true);
            }
          }}
        />
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
