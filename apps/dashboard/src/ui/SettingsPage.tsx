import { RoutineBackupSection } from './RoutineBackupSection';
import { PersonalizeSection } from './PersonalizeSection';
import { settingTarget } from './search-catalog';
import { DiagnosticsSection } from './DiagnosticsSection';
import { useImageLibrary } from './hooks/useImageLibrary';
import { useAutoSyncStatus } from './hooks/useAutoSyncStatus';
import { useBlueBubblesWebhook } from './hooks/useBlueBubblesWebhook';
import { useCredentialTests } from './hooks/useCredentialTests';
import { useDiagnosticLogs } from './hooks/useDiagnosticLogs';
import { useYahooConnection } from './hooks/useYahooConnection';
import { useSettingsForm } from './hooks/useSettingsForm';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { preferredScrollBehavior } from './motion.js';
import { parseCredentialStatuses } from './credential-status.js';
import { YahooConnectionSection } from './YahooConnectionSection.js';
import { AIRuntimeSection } from './AIRuntimeSection.js';
import { AIMemoryPrivacySection } from './AIMemoryPrivacySection.js';
import { WritingStyleSection } from './WritingStyleSection.js';
import { LeagueCalendarSettings } from './LeagueCalendarSettings.js';
import { LocalBackupSection } from './LocalBackupSection.js';
import { DesktopSettingsSections } from './DesktopSettingsSections.js';
import { CredentialsSection, type SecretState } from './CredentialsSection.js';
import { AutomaticActionsSection } from './AutomaticActionsSection.js';
import { DeliveryChannelsSection } from './DeliveryChannelsSection.js';
import { writeImageProviderPreference } from './image-provider.js';
import { FriendlyError } from './FriendlyError';
import { SettingsOverview } from './SettingsOverview';
import { RefreshCw, Save } from 'lucide-react';
import {
  applyScheduleRecommendations,
  defaultLeagueStaleAfterHours,
  leagueStaleAfterHoursOptions,
  supportedNewsSources,
  normalizeChannelBoundaries,
  normalizeNewsSources,
  type SettingsSection,
  type ActionSetting,
  type AppSettings,
  type LeagueConnection,
} from '@sidekick/core';
import { confirmAction, discardOptions } from './ConfirmDialog';

type SettingsPageProps = {
  settings: AppSettings;
  leagues: LeagueConnection[];
  onSaved: (settings: AppSettings) => void;
  onCredentialsChanged: (provider?: string) => void;
  onRuntimeTested: (runtime: NonNullable<AppSettings['aiRuntime']>) => void;
  focusTarget: 'ai' | 'voice' | 'yahoo' | 'credentials' | 'data' | null;
  onFocusTargetHandled: () => void;
  onRestored: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  searchSettingId?: string;
  searchFocusRevision?: number;
  onSearchSettingClear?: () => void;
  onGuidedSetup?: () => void;
};
const sectionLabels: Record<SettingsSection, string> = {
  ai: 'AI',
  voice: 'Voice',
  delivery: 'Delivery & access',
  schedules: 'Schedules & sources',
  privacy: 'Privacy',
  personalize: 'Personalize',
  storage: 'Storage & desktop',
};
const actionNames: Record<string, string> = {
  'offseason-update': 'Offseason updates',
  'draft-hype': 'Draft day hype',
  'draft-review': 'Post-draft review',
  'power-rankings': 'Weekly power rankings',
  'matchup-preview': 'Matchup previews',
};

export function SettingsPage({
  settings,
  leagues,
  onSaved,
  onCredentialsChanged,
  onRuntimeTested,
  focusTarget,
  onFocusTargetHandled,
  onRestored,
  onDirtyChange,
  searchSettingId = '',
  searchFocusRevision = 0,
  onSearchSettingClear,
  onGuidedSetup,
}: SettingsPageProps) {
  const aiHeadingRef = useRef<HTMLHeadingElement>(null);
  const voiceHeadingRef = useRef<HTMLHeadingElement>(null);
  const yahooHeadingRef = useRef<HTMLHeadingElement>(null);
  const credentialsHeadingRef = useRef<HTMLHeadingElement>(null);
  const dataDirectoryHeadingRef = useRef<HTMLHeadingElement>(null);
  const pageRef = useRef<HTMLFormElement>(null);
  const [highlightedSetting, setHighlightedSetting] = useState('');
  const [dataDirectory, setDataDirectory] = useState<string | null>(null);
  const { form, setForm, dirtySections, persistSettings, reloadSection, conflict, reset } =
    useSettingsForm(settings, leagues, onSaved);
  const [section, setSection] = useState<SettingsSection>('ai');
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [runtimeError, setRuntimeError] = useState('');
  const [message, setMessage] = useState('');
  const [secretState, setSecretState] = useState<SecretState>([]);
  const [credentialStoreAvailable, setCredentialStoreAvailable] = useState<boolean | null>(null);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [backupDirty, setBackupDirty] = useState(false);
  const dirty =
    backupDirty ||
    dirtySections.length > 0 ||
    Object.values(secretValues).some((value) => Boolean(value.trim()));
  useLayoutEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty || window.sidekickDesktop?.isVerificationMode?.() === true) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const {
    imagePrompt,
    setImagePrompt,
    imageProvider,
    setImageProvider,
    setImageProviderManuallySelected,
    generatedImage,
    localImages,
    imageLibraryLoading,
    imageLibraryError,
    imageGenerationBusy,
    imageGenerationConfigured,
    imageProviderConfigured,
    createImage,
    refreshImages,
    removeLocalImage,
  } = useImageLibrary(secretState, setMessage);
  const {
    yahooClientId,
    setYahooClientId,
    yahooClientSecret,
    setYahooClientSecret,
    yahooAuthorizationUrl,
    yahooAuthorizationCode,
    setYahooAuthorizationCode,
    yahooStatusLoading,
    yahooStatusError,
    yahooOAuthStatus,
    refreshYahooOAuthStatus,
    saveYahooClient,
    authorizeYahoo,
    completeYahooAuthorization,
    disconnectYahoo,
  } = useYahooConnection(setMessage, onCredentialsChanged);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const blueBubblesWebhook = useBlueBubblesWebhook(setMessage);
  const imessageAutoSyncStatus = useAutoSyncStatus(
    form.imessageAutoSyncEnabled,
    '/api/memory/imessage-sync/status',
  );
  const twilioAutoSyncStatus = useAutoSyncStatus(
    form.twilioConversationAutoSyncEnabled,
    '/api/memory/twilio-conversation-sync/status',
  );
  const diagnostics = useDiagnosticLogs();
  const credentialTests = useCredentialTests(setMessage);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const runtime = form.aiRuntime ?? {
    mode: 'api' as const,
    model: 'gpt-6-luna',
    command: '',
    args: '',
    baseUrl: 'https://api.openai.com/v1',
    temperature: 0.8,
    maxOutputTokens: 4000,
  };
  const appleCliPlatform = navigator.platform.toLowerCase().startsWith('mac');
  const blueBubblesConfigured =
    secretState.find((item) => item.provider === 'bluebubbles')?.configured === true;
  const twilioConfigured =
    secretState.find((item) => item.provider === 'twilio')?.configured === true;

  useEffect(() => {
    void fetch('/api/credentials')
      .then(async (response) => {
        const result: unknown = await response.json();
        const statuses = parseCredentialStatuses(result);
        if (!response.ok || !statuses) throw new Error('Credential store unavailable.');
        setSecretState(statuses);
        setCredentialStoreAvailable(true);
      })
      .catch(() => {
        setSecretState([]);
        setCredentialStoreAvailable(false);
        setMessage(
          'OS credential store is unavailable. On Linux, make a Secret Service such as GNOME Keyring or KWallet available on this user’s D-Bus session.',
        );
      });
    void blueBubblesWebhook.refresh();
    void refreshImages();
    void refreshYahooOAuthStatus();
  }, []);

  useEffect(() => {
    if (!focusTarget) return;
    const nextSection: SettingsSection =
      focusTarget === 'ai'
        ? 'ai'
        : focusTarget === 'voice'
          ? 'voice'
          : focusTarget === 'data'
            ? 'storage'
            : 'delivery';
    if (section !== nextSection) {
      setSection(nextSection);
      return;
    }
    const target =
      focusTarget === 'ai'
        ? aiHeadingRef.current
        : focusTarget === 'voice'
          ? voiceHeadingRef.current
          : focusTarget === 'yahoo'
            ? yahooHeadingRef.current
            : focusTarget === 'credentials'
              ? credentialsHeadingRef.current
              : dataDirectoryHeadingRef.current;
    if (!target) return;
    revealSetting(target);
    target.scrollIntoView({
      behavior: preferredScrollBehavior(
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
      block: 'start',
    });
    target.focus({ preventScroll: true });
    onFocusTargetHandled();
  }, [dataDirectory, focusTarget, onFocusTargetHandled, section]);

  useEffect(() => {
    const destination = settingTarget(searchSettingId);
    if (!destination) {
      setHighlightedSetting('');
      return;
    }
    if (section !== destination.section) {
      setSection(destination.section);
      return;
    }
    const requested = pageRef.current?.querySelector<HTMLElement>(
      `[data-search-target="${destination.id}"]`,
    );
    const target = requested ?? (destination.section === 'ai' ? aiHeadingRef.current : undefined);
    if (!target) return;
    for (const details of pageRef.current?.querySelectorAll<HTMLDetailsElement>('details') ?? []) {
      if (details.contains(target)) details.open = true;
    }
    // Disabled controls still need a visible, focusable destination with their explanation.
    const anchor = target.closest<HTMLElement>('label') ?? target;
    anchor.classList.add('search-setting-highlight');
    if (!anchor.hasAttribute('tabindex')) anchor.tabIndex = -1;
    anchor.scrollIntoView({
      block: 'center',
      behavior: preferredScrollBehavior(
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    });
    (target.matches(
      'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
    )
      ? target
      : anchor
    ).focus({ preventScroll: true });
    setHighlightedSetting(
      requested ? destination.title : `${destination.title} (available in API mode)`,
    );
    return () => anchor.classList.remove('search-setting-highlight');
  }, [searchSettingId, searchFocusRevision, section, dataDirectory]);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    setSaving(true);
    setSaveFailed(false);
    try {
      await persistSettings(section);
      setMessage(`${sectionLabels[section]} saved locally. Other sections were not saved.`);
    } catch (error) {
      setSaveFailed(true);
      setMessage(error instanceof Error ? error.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function testRuntime() {
    setRuntimeBusy(true);
    setRuntimeError('');
    setMessage('Saving AI settings and checking the connection…');
    try {
      const savedSettings = await persistSettings('ai');
      const response = await fetch('/api/ai/test', { method: 'POST' });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'AI runtime test failed.');
      if (savedSettings.aiRuntime) onRuntimeTested(savedSettings.aiRuntime);
      setMessage('Your AI connection works. The test sent no league data.');
    } catch (error) {
      setMessage('');
      setRuntimeError(error instanceof Error ? error.message : 'AI connection test failed.');
    } finally {
      setRuntimeBusy(false);
    }
  }

  async function discoverModels() {
    setRuntimeBusy(true);
    setMessage('Saving API settings and discovering available models…');
    try {
      const savedSettings = await persistSettings('ai');
      if (savedSettings.aiRuntime?.mode !== 'api')
        throw new Error('Choose API mode before discovering models.');
      const response = await fetch('/api/ai/models', { method: 'POST' });
      const result = (await response.json()) as { models?: unknown; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not discover AI models.');
      if (!Array.isArray(result.models))
        throw new Error('The provider returned an invalid model list.');
      const models = result.models.filter(
        (model): model is string => typeof model === 'string' && model.length > 0,
      );
      setAvailableModels(models);
      setMessage(
        models.length
          ? `Found ${models.length} models. Select one from the model suggestions or keep entering a model manually.`
          : 'The provider returned no models. Enter a model name manually.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not discover AI models.');
    } finally {
      setRuntimeBusy(false);
    }
  }

  async function saveSecret(provider: string) {
    const value = secretValues[provider];
    if (!value?.trim()) return;
    const response = await fetch(`/api/credentials/${provider}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      if (response.status === 503) setCredentialStoreAvailable(false);
      setMessage(result.error ?? 'Could not save credential.');
      return;
    }
    setCredentialStoreAvailable(true);
    setSecretValues((current) => ({ ...current, [provider]: '' }));
    setSecretState((current) => [
      ...current.filter((item) => item.provider !== provider),
      { provider, configured: true },
    ]);
    onCredentialsChanged(provider);
    setMessage(
      window.sidekickDesktop?.isVerificationMode?.() === true
        ? 'Test credential saved for this session only.'
        : 'Credential saved to the operating system credential store.',
    );
    // Confirm ESPN access right away so a wrong cookie is caught before the next refresh.
    if (provider === 'espn' && leagues.some((league) => league.platform === 'espn'))
      void credentialTests.testEspn();
  }

  async function removeSecret(provider: string) {
    const response = await fetch(`/api/credentials/${provider}`, { method: 'DELETE' });
    if (!response.ok) {
      if (response.status === 503) {
        setCredentialStoreAvailable(false);
        setMessage('The operating system credential store is unavailable.');
      } else setMessage('Could not remove credential.');
      return;
    }
    setCredentialStoreAvailable(true);
    setSecretState((current) =>
      current.map((item) => (item.provider === provider ? { ...item, configured: false } : item)),
    );
    if (provider === 'bluebubbles') blueBubblesWebhook.reset();
    onCredentialsChanged(provider);
    setMessage('Credential removed.');
  }

  function handleRestoredSettings(restoredSettings: AppSettings) {
    onSaved(restoredSettings);
    reset(restoredSettings);
  }

  function setRuntime<K extends keyof NonNullable<AppSettings['aiRuntime']>>(
    key: K,
    value: NonNullable<AppSettings['aiRuntime']>[K],
  ) {
    if (key === 'baseUrl') setAvailableModels([]);
    setForm((current) => ({
      ...current,
      aiRuntime: { ...(current.aiRuntime ?? runtime), [key]: value },
    }));
  }

  function setSchedule(kind: ActionSetting['kind'], schedule: Partial<ActionSetting['schedule']>) {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action) => {
        if (action.kind !== kind) return action;
        const nextSchedule = { ...action.schedule, ...schedule };
        if (schedule.frequency !== undefined && schedule.frequency !== 'once')
          delete nextSchedule.date;
        if (nextSchedule.frequency === 'once' && !nextSchedule.date)
          nextSchedule.date = nextLocalDate(nextSchedule.timezone);
        if (
          schedule.frequency !== undefined ||
          schedule.date !== undefined ||
          schedule.time !== undefined ||
          schedule.timezone !== undefined
        )
          delete nextSchedule.completedAt;
        return { ...action, schedule: nextSchedule };
      }),
    }));
  }

  function applyScheduleSuggestions() {
    setForm((current) => ({
      ...current,
      actions: applyScheduleRecommendations(current.actions),
    }));
    setMessage(
      'Suggested weekly times applied. Review the action settings and save; existing destinations and send policies were preserved.',
    );
  }

  function setActionLeague(kind: ActionSetting['kind'], leagueId: string, included: boolean) {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action) => {
        if (action.kind !== kind) return action;
        const activeIds = leagues.map((league) => league.id);
        const selected = new Set(
          action.leagueIds === undefined
            ? activeIds
            : action.leagueIds.filter((id) => activeIds.includes(id)),
        );
        if (included) selected.add(leagueId);
        else selected.delete(leagueId);
        const schedule = { ...action.schedule };
        if (schedule.frequency === 'once') delete schedule.completedAt;
        return { ...action, leagueIds: [...selected], schedule };
      }),
    }));
  }

  const unsaved =
    dirtySections.includes(section) ||
    Object.values(secretValues).some((value) => Boolean(value.trim())) ||
    backupDirty;
  return (
    <form ref={pageRef} className="settings-page" onSubmit={saveSettings}>
      <div className="page-title-block">
        <div>
          <p className="section-overline">MAKE IT YOURS</p>
          <h1>Settings</h1>
          <p>Choose a section to manage.</p>
        </div>
        <div className={`settings-save-bar${unsaved || saving ? ' pending' : ''}`}>
          <span role="status">
            {saving
              ? 'Saving…'
              : unsaved
                ? saveFailed
                  ? 'Could not save. Your changes are still here.'
                  : 'Unsaved changes'
                : section === 'storage'
                  ? 'Changes are saved on each card'
                  : 'Saved'}
          </span>
          <button
            type="submit"
            className="primary-button"
            disabled={section === 'storage' || saving || !dirtySections.includes(section)}
          >
            <Save size={15} /> {saving ? 'Saving…' : 'Save ' + sectionLabels[section]}
          </button>
          {section === 'storage' && <small>Use the Save button in each storage card.</small>}
        </div>
      </div>
      <SettingsOverview
        settings={settings}
        leagues={leagues}
        configured={(provider) =>
          secretState.some((item) => item.provider === provider && item.configured)
        }
        credentialStoreAvailable={credentialStoreAvailable}
        onOpen={async (key) => {
          if (
            backupDirty &&
            !(await confirmAction('Your backup settings haven’t been saved.', discardOptions))
          )
            return;
          onSearchSettingClear?.();
          setSection(key);
        }}
      />
      <nav className="settings-tabs" aria-label="Settings sections">
        {(Object.keys(sectionLabels) as SettingsSection[]).map((key) => (
          <button
            type="button"
            key={key}
            aria-current={section === key ? 'page' : undefined}
            className={section === key ? 'small-button active' : 'small-button'}
            onClick={async () => {
              if (
                backupDirty &&
                !(await confirmAction('Your backup settings haven’t been saved.', discardOptions))
              )
                return;
              onSearchSettingClear?.();
              setSection(key);
            }}
          >
            {sectionLabels[key]}
            {dirtySections.includes(key) ? ' · Unsaved' : ''}
          </button>
        ))}
      </nav>
      {highlightedSetting && (
        <p className="search-setting-notice" role="status">
          Here’s <strong>{highlightedSetting}</strong>. Review the setting below; nothing has been
          changed.
        </p>
      )}
      {dirtySections.length > 0 && (
        <p className="unsaved-settings" role="status">
          Unsaved changes: {dirtySections.map((key) => sectionLabels[key]).join(', ')}. Save each
          section separately; switching sections keeps your changes.
        </p>
      )}
      {conflict && (
        <p role="alert">
          This section changed in another window. Your edits are still here.{' '}
          <button
            type="button"
            onClick={async () => {
              if (
                await confirmAction(
                  'Reloading shows the saved version and discards your edits here.',
                  {
                    ...discardOptions,
                    title: 'Reload this section?',
                    confirmLabel: 'Reload section',
                  },
                )
              )
                void reloadSection(conflict).catch((error) =>
                  setMessage(error instanceof Error ? error.message : 'Could not reload section.'),
                );
            }}
          >
            Reload {sectionLabels[conflict]} section
          </button>
        </p>
      )}
      {runtimeError && section === 'ai' && (
        <FriendlyError
          message="Your AI connection needs attention. Check your saved key and connection settings, then test again."
          detail={runtimeError}
          action="Test connection again"
          onAction={() => {
            if (!runtimeBusy) void testRuntime();
          }}
        />
      )}
      {message && (
        <div className="notice" role="status">
          {message}
          <button type="button" onClick={() => setMessage('')}>
            ×
          </button>
        </div>
      )}
      {section === 'delivery' && (
        <>
          <details className="settings-disclosure">
            <summary>Yahoo league connection</summary>
            <YahooConnectionSection
              headingRef={yahooHeadingRef}
              status={yahooOAuthStatus}
              statusLoading={yahooStatusLoading}
              statusError={yahooStatusError}
              clientId={yahooClientId}
              clientSecret={yahooClientSecret}
              authorizationUrl={yahooAuthorizationUrl}
              authorizationCode={yahooAuthorizationCode}
              onClientIdChange={setYahooClientId}
              onClientSecretChange={setYahooClientSecret}
              onAuthorizationCodeChange={setYahooAuthorizationCode}
              onSaveClient={() => void saveYahooClient()}
              onAuthorize={() => void authorizeYahoo()}
              onDisconnect={() => void disconnectYahoo()}
              onCompleteAuthorization={() => void completeYahooAuthorization()}
              onRetryStatus={() => void refreshYahooOAuthStatus()}
            />
          </details>
        </>
      )}
      {section === 'personalize' && (
        <PersonalizeSection
          preferences={form.preferences ?? {}}
          leagues={leagues}
          onChange={(preferences) => setForm((current) => ({ ...current, preferences }))}
        />
      )}
      {section === 'storage' && (
        <>
          <DesktopSettingsSections
            dataDirectoryHeadingRef={dataDirectoryHeadingRef}
            onDataDirectoryLoaded={setDataDirectory}
            onNotice={setMessage}
          />
          <details className="settings-disclosure">
            <summary>Diagnostics</summary>
            <DiagnosticsSection />
          </details>
          <details className="settings-disclosure">
            <summary>Automatic backups</summary>
            <RoutineBackupSection onNotice={setMessage} onDirtyChange={setBackupDirty} />
          </details>
          <details className="settings-disclosure">
            <summary>Export & restore a backup</summary>
            <LocalBackupSection
              onNotice={setMessage}
              onRestored={async () => {
                await onRestored();
                await refreshImages();
              }}
              onSettingsRestored={handleRestoredSettings}
            />
          </details>
        </>
      )}
      {section === 'voice' && (
        <>
          <WritingStyleSection
            headingRef={voiceHeadingRef}
            writingStyle={form.writingStyle}
            customPresets={form.customWritingStylePresets ?? []}
            reportLength={form.reportLength ?? 'standard'}
            allowProfanity={form.allowProfanity}
            excludedTopics={form.excludedTopics}
            channelBoundaries={normalizeChannelBoundaries(form.channelBoundaries)}
            onWritingStyleChange={(writingStyle) =>
              setForm((current) => ({ ...current, writingStyle }))
            }
            onSaveCustomPreset={(preset) =>
              setForm((current) => {
                const presets = current.customWritingStylePresets ?? [];
                const existingIndex = presets.findIndex(
                  (item) => item.name.toLowerCase() === preset.name.toLowerCase(),
                );
                const updated = [...presets];
                if (existingIndex >= 0) updated[existingIndex] = preset;
                else updated.push(preset);
                return { ...current, customWritingStylePresets: updated };
              })
            }
            onDeleteCustomPreset={(name) =>
              setForm((current) => ({
                ...current,
                customWritingStylePresets: (current.customWritingStylePresets ?? []).filter(
                  (preset) => preset.name !== name,
                ),
              }))
            }
            onReportLengthChange={(reportLength) =>
              setForm((current) => ({ ...current, reportLength }))
            }
            onProfanityChange={(allowProfanity) =>
              setForm((current) => ({ ...current, allowProfanity }))
            }
            onExcludedTopicsChange={(excludedTopics) =>
              setForm((current) => ({ ...current, excludedTopics }))
            }
            onChannelBoundaryChange={(channel, value) =>
              setForm((current) => ({
                ...current,
                channelBoundaries: {
                  ...normalizeChannelBoundaries(current.channelBoundaries),
                  [channel]: value,
                },
              }))
            }
          />
        </>
      )}
      {section === 'ai' && (
        <>
          {/* Same readiness rule as the overview card; the walkthrough is for unconnected AI. */}
          {onGuidedSetup &&
            !(settings.aiRuntime?.mode === 'anthropic-api'
              ? secretState.some((item) => item.provider === 'anthropic' && item.configured)
              : (settings.aiRuntime?.mode ?? 'api') !== 'api' ||
                secretState.some((item) => item.provider === 'openai' && item.configured)) && (
              <section className="settings-card">
                <h2>Need help connecting?</h2>
                <p>Connect and test your AI in a few steps.</p>
                <button type="button" className="small-button" onClick={onGuidedSetup}>
                  Guided AI setup
                </button>
              </section>
            )}
          <AIRuntimeSection
            headingRef={aiHeadingRef}
            runtime={runtime}
            availableModels={availableModels}
            appleCliPlatform={appleCliPlatform}
            apiKeyConfigured={
              credentialStoreAvailable === true
                ? secretState.some(
                    (item) =>
                      item.provider ===
                        (form.aiRuntime?.mode === 'anthropic-api' ? 'anthropic' : 'openai') &&
                      item.configured,
                  )
                : null
            }
            busy={runtimeBusy}
            onChange={setRuntime}
            onOpenCredentials={() => {
              if (credentialsHeadingRef.current) revealSetting(credentialsHeadingRef.current);
              credentialsHeadingRef.current?.scrollIntoView({ block: 'start' });
              credentialsHeadingRef.current?.focus();
            }}
            onDiscoverModels={() => void discoverModels()}
            onTestRuntime={() => void testRuntime()}
          />
        </>
      )}
      {section === 'privacy' && (
        <>
          <AIMemoryPrivacySection
            memoryEnabled={form.memoryEnabled}
            analyzeImportsWithAI={form.analyzeImportsWithAI}
            includeMemberContextInReports={form.includeMemberContextInReports}
            includeMemberContextInChatReplies={form.includeMemberContextInChatReplies === true}
            conversationRetentionDays={form.conversationRetentionDays}
            onMemoryEnabledChange={(enabled) =>
              setForm((current) => ({
                ...current,
                memoryEnabled: enabled,
                ...(enabled
                  ? {}
                  : {
                      imessageAutoSyncEnabled: false,
                      twilioConversationAutoSyncEnabled: false,
                    }),
              }))
            }
            onAnalyzeImportsChange={(enabled) =>
              setForm((current) => ({ ...current, analyzeImportsWithAI: enabled }))
            }
            onIncludeMemberContextChange={(enabled) =>
              setForm((current) => ({ ...current, includeMemberContextInReports: enabled }))
            }
            onIncludeMemberContextInChatRepliesChange={(enabled) =>
              setForm((current) => ({ ...current, includeMemberContextInChatReplies: enabled }))
            }
            onRetentionChange={(days) =>
              setForm((current) => {
                const withoutRetention = { ...current };
                delete withoutRetention.conversationRetentionDays;
                return days === undefined
                  ? withoutRetention
                  : { ...current, conversationRetentionDays: days };
              })
            }
          />
        </>
      )}
      {section === 'schedules' && (
        <>
          <section className="settings-card">
            <details className="settings-disclosure">
              <summary>Report schedules</summary>
              <AutomaticActionsSection
                actions={form.actions}
                maximumSavedAgeHours={form.leagueStaleAfterHours ?? 24}
                leagues={leagues}
                onApplySuggestions={applyScheduleSuggestions}
                onActionChange={(kind, patch) =>
                  setForm((current) => ({
                    ...current,
                    actions: current.actions.map((action) =>
                      action.kind === kind ? { ...action, ...patch } : action,
                    ),
                  }))
                }
                onScheduleChange={setSchedule}
                onActionLeague={setActionLeague}
              />
            </details>
            <small className="schedule-explainer">
              Reports use the league’s latest connected data. One-time events run on their selected
              local date and time if the service is running that day. Review mode saves a draft;
              automatic delivery uses the channel and recipient configured below.
            </small>
            <label className="switch-label">
              <input
                type="checkbox"
                data-search-target="mcp-delivery"
                checked={form.mcpDeliveryEnabled ?? false}
                onChange={(event) =>
                  setForm((current) => ({ ...current, mcpDeliveryEnabled: event.target.checked }))
                }
              />
              Allow MCP clients to send reports
            </label>
            <small className="schedule-explainer">
              When enabled, an MCP client can send an existing draft once through that report type’s
              configured channel when you explicitly invoke its send tool. Uncertain sends cannot be
              retried through MCP; inspect delivery status and use the dashboard to confirm a retry.
              Backup restore turns this permission off.
            </small>
            <label className="report-length-setting">
              WARN WHEN LEAGUE DATA IS OLDER THAN
              <select
                data-search-target="league-staleness"
                value={form.leagueStaleAfterHours ?? defaultLeagueStaleAfterHours}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    leagueStaleAfterHours: Number(event.target.value) as NonNullable<
                      AppSettings['leagueStaleAfterHours']
                    >,
                  }))
                }
              >
                {leagueStaleAfterHoursOptions.map((hours) => (
                  <option key={hours} value={hours}>
                    {hours < 24
                      ? `${hours} hours`
                      : hours === 168
                        ? '7 days'
                        : `${hours / 24} days`}
                  </option>
                ))}
              </select>
            </label>
            <small className="schedule-explainer">
              The Leagues page warns at this age. Old snapshots remain available, but may no longer
              reflect current rosters or standings.
            </small>
            <details className="settings-disclosure">
              <summary>League calendar</summary>
              <LeagueCalendarSettings
                leagues={leagues}
                events={form.calendarEvents ?? []}
                actionNames={actionNames}
                onAddEvent={(event) =>
                  setForm((current) => ({
                    ...current,
                    calendarEvents: [...(current.calendarEvents ?? []), event],
                  }))
                }
                onDeleteEvent={(eventId) =>
                  setForm((current) => ({
                    ...current,
                    calendarEvents: (current.calendarEvents ?? []).filter(
                      (event) => event.id !== eventId,
                    ),
                  }))
                }
                onNotice={setMessage}
              />
            </details>
            <div className="news-source-settings">
              <h3>SCHEDULED LEAGUE REFRESH RETRIES</h3>
              <label>
                ADDITIONAL ATTEMPTS
                <select
                  data-search-target="refresh-retries"
                  value={form.scheduledSyncRetries ?? 0}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scheduledSyncRetries: Number(event.target.value) as 0 | 1 | 2 | 3,
                    }))
                  }
                >
                  <option value={0}>Off</option>
                  <option value={1}>1 retry</option>
                  <option value={2}>2 retries</option>
                  <option value={3}>3 retries</option>
                </select>
              </label>
              <small className="schedule-explainer">
                Retries only transient league refresh failures with a short backoff. Authentication
                and permission errors stop immediately. Report generation and message delivery are
                never repeated by this setting.
              </small>
            </div>
            <div className="news-source-settings">
              <h3 data-search-target="news-sources" tabIndex={-1}>
                FOOTBALL NEWS SOURCES
              </h3>
              {supportedNewsSources.map((source) => (
                <label className="switch-label news-source-option" key={source.id}>
                  <input
                    type="checkbox"
                    checked={normalizeNewsSources(form.newsSources).includes(source.id)}
                    onChange={(event) =>
                      setForm((current) => {
                        const selected = normalizeNewsSources(current.newsSources);
                        return {
                          ...current,
                          newsSources: event.target.checked
                            ? [...selected, source.id]
                            : selected.filter((id) => id !== source.id),
                        };
                      })
                    }
                  />
                  {source.name}
                </label>
              ))}
              <small>
                Only selected built-in feeds are fetched. Clear all to disable external news
                requests. FOX Sports permits its feed for individual or nonprofit noncommercial use
                and requires attribution, which appears on each headline; review its{' '}
                <a href="https://www.foxsports.com/rss-feeds" target="_blank" rel="noreferrer">
                  feed terms
                </a>{' '}
                before enabling it.
              </small>
              <label className="switch-label news-source-option">
                <input
                  type="checkbox"
                  data-search-target="injury-reports"
                  checked={form.nflInjuryReportsEnabled === true}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      nflInjuryReportsEnabled: event.target.checked,
                    }))
                  }
                />
                Use nflverse injury reports in matchup previews
              </label>
              <small>
                Off by default. When enabled, matchup previews fetch this season's licensed CSV and
                include only exact current-roster name/team matches for the league week. Matched
                rows are sent to your selected AI runtime with the report. The source updates daily
                during the season and its retrieval time and link appear in the report when cited.
                Data is attributed to{' '}
                <a
                  href="https://github.com/nflverse/nflverse-data"
                  target="_blank"
                  rel="noreferrer"
                >
                  nflverse-data contributors
                </a>{' '}
                under{' '}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY 4.0
                </a>
                . Injury and practice labels can change and are not medical advice.
              </small>
            </div>
            <div className="settings-fields two recipients">
              <label>
                NEWS REFRESH INTERVAL (MINUTES)
                <input
                  type="number"
                  min={5}
                  max={1440}
                  step={1}
                  required
                  data-search-target="news-refresh"
                  value={form.newsRefreshMinutes ?? 15}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      newsRefreshMinutes: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <p className="schedule-explainer">
                Football headlines refresh automatically after this interval. Use the refresh icon
                on the League desk to fetch them sooner.
              </p>
            </div>
          </section>
        </>
      )}
      {section === 'delivery' && (
        <section className="settings-card">
          <DeliveryChannelsSection
            settings={form}
            setSettings={setForm}
            leagues={leagues}
            twilioConfigured={twilioConfigured}
            twilioAutoSyncStatus={twilioAutoSyncStatus}
            blueBubblesConfigured={blueBubblesConfigured}
            imessageAutoSyncStatus={imessageAutoSyncStatus}
            blueBubblesWebhookConfigured={blueBubblesWebhook.configured}
            blueBubblesWebhookLoading={blueBubblesWebhook.loading}
            blueBubblesWebhookError={blueBubblesWebhook.error}
            blueBubblesWebhookUrl={blueBubblesWebhook.url}
            onCreateWebhook={() => void blueBubblesWebhook.create()}
            onRevokeWebhook={() => void blueBubblesWebhook.revoke()}
            onRetryWebhookStatus={() => void blueBubblesWebhook.refresh()}
            onNotice={setMessage}
          />
        </section>
      )}
      {(section === 'ai' || section === 'delivery' || section === 'storage') && (
        <CredentialsSection
          allowedProviders={
            section === 'ai'
              ? ['openai', 'anthropic']
              : section === 'storage'
                ? ['image-generation', 'stability-image-generation']
                : ['espn', 'odds-api', 'resend', 'twilio', 'bluebubbles']
          }
          showImages={section === 'storage'}
          headingRef={credentialsHeadingRef}
          credentialStoreAvailable={credentialStoreAvailable}
          secretState={secretState}
          secretValues={secretValues}
          onSecretValueChange={(provider, value) =>
            setSecretValues((current) => ({ ...current, [provider]: value }))
          }
          onSaveSecret={(provider) => void saveSecret(provider)}
          onRemoveSecret={(provider) => void removeSecret(provider)}
          espnTestAvailable={leagues.some((league) => league.platform === 'espn')}
          credentialTestBusy={credentialTests.busy}
          onTestEspn={() => void credentialTests.testEspn()}
          resendTestRecipient={credentialTests.resendRecipient}
          onResendTestRecipientChange={credentialTests.setResendRecipient}
          onTestTwilio={() => void credentialTests.testTwilio()}
          onTestResend={() => void credentialTests.testResend()}
          imageGenerationConfigured={imageGenerationConfigured}
          imageProvider={imageProvider}
          onImageProviderChange={(provider) => {
            setImageProviderManuallySelected(true);
            setImageProvider(provider);
            writeImageProviderPreference(provider);
          }}
          imageProviderConfigured={imageProviderConfigured}
          imagePrompt={imagePrompt}
          onImagePromptChange={setImagePrompt}
          generatedImage={generatedImage}
          imageGenerationBusy={imageGenerationBusy}
          onCreateImage={() => void createImage()}
          localImages={localImages}
          imageLibraryLoading={imageLibraryLoading}
          imageLibraryError={imageLibraryError}
          onRefreshImages={() => void refreshImages()}
          onRemoveImage={(id) => void removeLocalImage(id)}
        />
      )}
      {section === 'storage' && (
        <>
          <section className="settings-card">
            <div className="settings-card-title">
              <div>
                <h2 data-search-target="runtime-logs" tabIndex={-1}>
                  Local runtime logs
                </h2>
                <p>Recent background service events stored on this computer.</p>
              </div>
              <button
                type="button"
                className="small-button"
                onClick={() => void diagnostics.refresh()}
                disabled={diagnostics.busy}
              >
                <RefreshCw size={14} className={diagnostics.busy ? 'spinning' : ''} />
                {diagnostics.busy ? 'Loading…' : 'Refresh logs'}
              </button>
            </div>
            <small>
              Only structured operational events and reviewed metadata are shown. Request bodies,
              conversation text, provider output, and credentials are omitted.
            </small>
            {diagnostics.error && (
              <p className="schedule-explainer" role="alert">
                {diagnostics.error}
              </p>
            )}
            {diagnostics.logs && !diagnostics.logs.available && (
              <p className="schedule-explainer">
                File-based diagnostics are available in the packaged app and installed source
                service. A service started directly from a terminal writes logs there instead.
              </p>
            )}
            {diagnostics.logs?.available && diagnostics.logs.entries.length === 0 && (
              <p className="schedule-explainer">
                No structured log entries have been captured yet.
              </p>
            )}
            {diagnostics.logs?.entries.length ? (
              <ol className="diagnostic-log-list" aria-label="Recent local runtime events">
                {diagnostics.logs.entries.map((entry, index) => (
                  <li
                    className={`diagnostic-log-row ${entry.level}`}
                    key={`${entry.timestamp}-${index}`}
                  >
                    <time dateTime={entry.timestamp}>
                      {new Date(entry.timestamp).toLocaleString()}
                    </time>
                    <strong>{entry.event}</strong>
                    <span>{entry.level.toUpperCase()}</span>
                    {Object.keys(entry.fields).length > 0 && (
                      <code>{JSON.stringify(entry.fields)}</code>
                    )}
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        </>
      )}
    </form>
  );
}

function nextLocalDate(timezone: string): string {
  const nextDate = new Date(`${todayLocalDate(timezone)}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return nextDate.toISOString().slice(0, 10);
}

function todayLocalDate(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function revealSetting(target: HTMLElement) {
  for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
  }
}
