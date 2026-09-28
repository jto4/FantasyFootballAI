import { useEffect, useRef, useState } from 'react';
import { preferredScrollBehavior } from './motion.js';
import { parseCredentialStatuses } from './credential-status.js';
import { YahooConnectionSection, type YahooOAuthStatus } from './YahooConnectionSection.js';
import { AIRuntimeSection } from './AIRuntimeSection.js';
import { AIMemoryPrivacySection } from './AIMemoryPrivacySection.js';
import { WritingStyleSection } from './WritingStyleSection.js';
import { LeagueCalendarSettings } from './LeagueCalendarSettings.js';
import { LocalBackupSection } from './LocalBackupSection.js';
import { DesktopSettingsSections } from './DesktopSettingsSections.js';
import { CredentialsSection, type LocalImage, type SecretState } from './CredentialsSection.js';
import { AutomaticActionsSection } from './AutomaticActionsSection.js';
import { Copy, RefreshCw, Save } from 'lucide-react';
import {
  applyScheduleRecommendations,
  isValidTimezone,
  defaultLeagueStaleAfterHours,
  leagueStaleAfterHoursOptions,
  normalizeNewsSources,
  normalizeActionSettings,
  normalizeChannelBoundaries,
  supportedNewsSources,
  type ActionSetting,
  type AppSettings,
  type LeagueConnection,
} from '@sidekick/core';

type DiagnosticLogEntry = {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  fields: Record<string, string | number>;
};
type DiagnosticLogSnapshot = { available: boolean; entries: DiagnosticLogEntry[] };
type IMessageAutoSyncStatus = {
  enabled: boolean;
  intervalMinutes: number;
  lastCheckedAt?: string;
  lastAddedMessages?: number;
  lastError?: string;
};
type SettingsPageProps = {
  settings: AppSettings;
  leagues: LeagueConnection[];
  onSaved: (settings: AppSettings) => void;
  onCredentialsChanged: () => void;
  onRuntimeTested: (runtime: NonNullable<AppSettings['aiRuntime']>) => void;
  focusTarget: 'ai' | 'voice' | 'yahoo' | 'credentials' | 'data' | null;
  onFocusTargetHandled: () => void;
  onRestored: () => Promise<void>;
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
}: SettingsPageProps) {
  const aiHeadingRef = useRef<HTMLHeadingElement>(null);
  const voiceHeadingRef = useRef<HTMLHeadingElement>(null);
  const yahooHeadingRef = useRef<HTMLHeadingElement>(null);
  const credentialsHeadingRef = useRef<HTMLHeadingElement>(null);
  const dataDirectoryHeadingRef = useRef<HTMLHeadingElement>(null);
  const [dataDirectory, setDataDirectory] = useState<string | null>(null);
  const [form, setForm] = useState<AppSettings>({
    ...settings,
    calendarEvents: settings.calendarEvents ?? [],
    actions: normalizeActionSettings(settings.actions),
    reportLength: settings.reportLength ?? 'standard',
    allowProfanity: settings.allowProfanity ?? false,
    excludedTopics: settings.excludedTopics ?? '',
    channelBoundaries: normalizeChannelBoundaries(settings.channelBoundaries),
    memoryEnabled: settings.memoryEnabled ?? true,
    analyzeImportsWithAI: settings.analyzeImportsWithAI ?? false,
    includeMemberContextInReports: settings.includeMemberContextInReports ?? false,
    includeMemberContextInChatReplies: settings.includeMemberContextInChatReplies ?? false,
    imessageAutoSyncEnabled: settings.imessageAutoSyncEnabled ?? false,
    imessageSyncIntervalMinutes: settings.imessageSyncIntervalMinutes ?? 15,
    twilioConversationAutoSyncEnabled: settings.twilioConversationAutoSyncEnabled ?? false,
    twilioConversationSyncIntervalMinutes: settings.twilioConversationSyncIntervalMinutes ?? 15,
    chatRepliesEnabled: settings.chatRepliesEnabled ?? false,
    chatRepliesAutoSend: settings.chatRepliesAutoSend ?? false,
    chatAgentName: settings.chatAgentName ?? 'Sunday Sidekick',
    ...(settings.chatReplyLeagueId
      ? { chatReplyLeagueId: settings.chatReplyLeagueId }
      : leagues[0]
        ? { chatReplyLeagueId: leagues[0].id }
        : {}),
    mcpDeliveryEnabled: settings.mcpDeliveryEnabled ?? false,
    ...(settings.conversationRetentionDays === undefined
      ? {}
      : { conversationRetentionDays: settings.conversationRetentionDays }),
    newsRefreshMinutes: settings.newsRefreshMinutes ?? 15,
    newsSources: normalizeNewsSources(settings.newsSources),
    nflInjuryReportsEnabled: settings.nflInjuryReportsEnabled === true,
    leagueStaleAfterHours: settings.leagueStaleAfterHours ?? defaultLeagueStaleAfterHours,
    scheduledSyncRetries: settings.scheduledSyncRetries ?? 0,
  });
  const [secretState, setSecretState] = useState<SecretState>([]);
  const [credentialStoreAvailable, setCredentialStoreAvailable] = useState<boolean | null>(null);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState('');
  const [localImages, setLocalImages] = useState<LocalImage[]>([]);
  const [imageGenerationBusy, setImageGenerationBusy] = useState(false);
  const [credentialTestBusy, setCredentialTestBusy] = useState(false);
  const [resendTestRecipient, setResendTestRecipient] = useState('');
  const [imessageAutoSyncStatus, setImessageAutoSyncStatus] =
    useState<IMessageAutoSyncStatus | null>(null);
  const [twilioAutoSyncStatus, setTwilioAutoSyncStatus] = useState<IMessageAutoSyncStatus | null>(
    null,
  );
  const [blueBubblesWebhookConfigured, setBlueBubblesWebhookConfigured] = useState(false);
  const [blueBubblesWebhookUrl, setBlueBubblesWebhookUrl] = useState('');
  const [yahooClientId, setYahooClientId] = useState('');
  const [yahooClientSecret, setYahooClientSecret] = useState('');
  const [yahooAuthorizationUrl, setYahooAuthorizationUrl] = useState('');
  const [yahooAuthorizationState, setYahooAuthorizationState] = useState('');
  const [yahooAuthorizationCode, setYahooAuthorizationCode] = useState('');
  const [yahooOAuthStatus, setYahooOAuthStatus] = useState<YahooOAuthStatus>({
    clientConfigured: false,
    authorized: false,
    requiresReconnect: false,
    redirectUri: '',
  });
  const [message, setMessage] = useState('');
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLogSnapshot | null>(null);
  const [diagnosticLogsBusy, setDiagnosticLogsBusy] = useState(false);
  const [diagnosticLogsError, setDiagnosticLogsError] = useState('');
  const runtime = form.aiRuntime ?? {
    mode: 'api' as const,
    model: 'gpt-4o-mini',
    command: '',
    args: '',
    baseUrl: 'https://api.openai.com/v1',
    temperature: 0.8,
    maxOutputTokens: 1200,
  };
  const appleCliPlatform = navigator.platform.toLowerCase().startsWith('mac');
  const blueBubblesConfigured =
    secretState.find((item) => item.provider === 'bluebubbles')?.configured === true;
  const twilioConfigured =
    secretState.find((item) => item.provider === 'twilio')?.configured === true;
  const validTwilioConversationTarget = /^CH[0-9a-fA-F]{32}$/.test(form.smsRecipient?.trim() ?? '');
  const chatReplyDestinationReady =
    (validTwilioConversationTarget && twilioConfigured) ||
    (Boolean(form.imessageChatGuid?.trim()) && blueBubblesConfigured);
  const imageGenerationConfigured =
    secretState.find((item) => item.provider === 'image-generation')?.configured === true;
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
    void fetch('/api/bluebubbles/webhook')
      .then((response) => response.json())
      .then((result: { configured?: boolean }) =>
        setBlueBubblesWebhookConfigured(result.configured === true),
      )
      .catch(() => setMessage('Could not read BlueBubbles webhook status.'));
    void refreshImages();
    void fetch('/api/yahoo/oauth/status')
      .then((r) => r.json())
      .then(setYahooOAuthStatus)
      .catch(() => setMessage('Could not read Yahoo connection status.'));
  }, []);

  async function refreshDiagnosticLogs() {
    if (diagnosticLogsBusy) return;
    setDiagnosticLogsBusy(true);
    setDiagnosticLogsError('');
    try {
      const response = await fetch('/api/diagnostics/logs');
      const result = (await response.json()) as DiagnosticLogSnapshot & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not read local runtime logs.');
      setDiagnosticLogs(result);
    } catch (error) {
      setDiagnosticLogsError(
        error instanceof Error ? error.message : 'Could not read local runtime logs.',
      );
    } finally {
      setDiagnosticLogsBusy(false);
    }
  }

  useEffect(() => {
    if (!form.imessageAutoSyncEnabled) return;
    let active = true;
    const refresh = () => {
      void fetch('/api/memory/imessage-sync/status')
        .then((response) => (response.ok ? response.json() : null))
        .then((status: IMessageAutoSyncStatus | null) => {
          if (active && status) setImessageAutoSyncStatus(status);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [form.imessageAutoSyncEnabled]);

  useEffect(() => {
    if (!form.twilioConversationAutoSyncEnabled) return;
    let active = true;
    const refresh = () => {
      void fetch('/api/memory/twilio-conversation-sync/status')
        .then((response) => (response.ok ? response.json() : null))
        .then((status: IMessageAutoSyncStatus | null) => {
          if (active && status) setTwilioAutoSyncStatus(status);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [form.twilioConversationAutoSyncEnabled]);

  useEffect(() => {
    if (!focusTarget) return;
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
    target.scrollIntoView({
      behavior: preferredScrollBehavior(
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
      block: 'start',
    });
    target.focus({ preventScroll: true });
    onFocusTargetHandled();
  }, [dataDirectory, focusTarget, onFocusTargetHandled]);

  async function persistSettings(): Promise<AppSettings> {
    if (
      form.actions.some(
        (action) => action.schedule.enabled && !isValidTimezone(action.schedule.timezone.trim()),
      )
    ) {
      throw new Error('Choose a valid timezone such as America/New_York or UTC.');
    }
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    const result = (await response.json()) as AppSettings & { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'Could not save settings.');
    onSaved(result);
    return result;
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      await persistSettings();
      setMessage('Settings saved locally.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save settings.');
    }
  }

  async function testRuntime() {
    setRuntimeBusy(true);
    setMessage('Saving settings and testing the runtime…');
    try {
      const savedSettings = await persistSettings();
      const response = await fetch('/api/ai/test', { method: 'POST' });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'AI runtime test failed.');
      if (savedSettings.aiRuntime && savedSettings.aiRuntime.mode !== 'api')
        onRuntimeTested(savedSettings.aiRuntime);
      setMessage('AI runtime responded. The test sent no league data.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI runtime test failed.');
    } finally {
      setRuntimeBusy(false);
    }
  }

  async function discoverModels() {
    setRuntimeBusy(true);
    setMessage('Saving API settings and discovering available models…');
    try {
      const savedSettings = await persistSettings();
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
    onCredentialsChanged();
    setMessage('Credential saved to the operating system credential store.');
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
    if (provider === 'bluebubbles') {
      setBlueBubblesWebhookConfigured(false);
      setBlueBubblesWebhookUrl('');
    }
    onCredentialsChanged();
    setMessage('Credential removed.');
  }

  async function createBlueBubblesWebhook() {
    const response = await fetch('/api/bluebubbles/webhook', { method: 'POST' });
    const result = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !result.url) {
      setMessage(result.error ?? 'Could not create a BlueBubbles webhook URL.');
      return;
    }
    setBlueBubblesWebhookConfigured(true);
    setBlueBubblesWebhookUrl(result.url);
    setMessage('Webhook URL created. Copy it into BlueBubbles now; it is shown only once.');
  }

  async function revokeBlueBubblesWebhook() {
    const response = await fetch('/api/bluebubbles/webhook', { method: 'DELETE' });
    if (!response.ok) {
      setMessage('Could not revoke the BlueBubbles webhook URL.');
      return;
    }
    setBlueBubblesWebhookConfigured(false);
    setBlueBubblesWebhookUrl('');
    setMessage('Webhook URL revoked.');
  }

  async function testTwilioCredentials() {
    setCredentialTestBusy(true);
    setMessage('Checking Twilio credentials without sending a message…');
    try {
      const response = await fetch('/api/credentials/twilio/test', { method: 'POST' });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Twilio credential check failed.');
      setMessage('Twilio credentials are valid. No SMS was sent.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Twilio credential check failed.');
    } finally {
      setCredentialTestBusy(false);
    }
  }

  async function testResendCredentials() {
    const recipient = resendTestRecipient.trim();
    if (!recipient || !window.confirm(`Send a data-free test email to ${recipient}?`)) return;
    setCredentialTestBusy(true);
    setMessage('Sending the confirmed test email…');
    try {
      const response = await fetch('/api/credentials/resend/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipient, confirmation: 'SEND_TEST' }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Resend test email failed.');
      setMessage(`Resend sent a data-free test email to ${recipient}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Resend test email failed.');
    } finally {
      setCredentialTestBusy(false);
    }
  }

  async function createImage() {
    setImageGenerationBusy(true);
    setGeneratedImage('');
    setMessage('Generating image. The prompt will be sent to the image provider.');
    try {
      const response = await fetch('/api/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt }),
      });
      const result = (await response.json()) as {
        id?: string;
        src?: string;
        saved?: boolean;
        createdAt?: string;
        size?: number;
        mimeType?: string;
        error?: string;
      };
      if (!response.ok || !result.src)
        throw new Error(result.error ?? 'Image generation did not return an image.');
      setGeneratedImage(result.src);
      if (result.saved && result.id && result.createdAt && result.size && result.mimeType) {
        setLocalImages((images) => [
          {
            id: result.id!,
            createdAt: result.createdAt!,
            size: result.size!,
            mimeType: result.mimeType!,
          },
          ...images,
        ]);
        setMessage('Image generated and saved in your local data folder.');
      } else {
        setMessage('Image preview generated. Download it to keep a local copy.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Image generation failed.');
    } finally {
      setImageGenerationBusy(false);
    }
  }

  async function refreshImages() {
    try {
      const response = await fetch('/api/images');
      if (response.ok) setLocalImages(await response.json());
    } catch {
      setMessage('Could not read the local image library.');
    }
  }

  async function removeLocalImage(id: string) {
    if (!window.confirm('Permanently delete this image from the local data folder?')) return;
    const response = await fetch(`/api/images/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage('Could not delete that local image.');
      return;
    }
    setLocalImages((images) => images.filter((image) => image.id !== id));
    if (generatedImage === `/api/images/${id}`) setGeneratedImage('');
    setMessage('Local image deleted.');
  }

  async function saveYahooClient() {
    const response = await fetch('/api/yahoo/oauth/client', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: yahooClientId, clientSecret: yahooClientSecret }),
    });
    if (!response.ok) {
      const result = await response.json();
      setMessage(result.error ?? 'Could not save Yahoo app credentials.');
      return;
    }
    setYahooClientId('');
    setYahooClientSecret('');
    setYahooOAuthStatus((current) => ({ ...current, clientConfigured: true }));
    setMessage('Yahoo app credentials saved to the operating system credential store.');
  }

  async function authorizeYahoo() {
    const response = await fetch('/api/yahoo/oauth/start');
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? 'Could not start Yahoo authorization.');
      return;
    }
    setYahooAuthorizationUrl(result.authorizationUrl as string);
    setYahooAuthorizationState(result.state as string);
    setYahooAuthorizationCode('');
    setMessage(
      'Open Yahoo in a new tab, approve Fantasy Sports access, and copy the code back here.',
    );
  }

  async function completeYahooAuthorization() {
    const response = await fetch('/api/yahoo/oauth/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: yahooAuthorizationState, code: yahooAuthorizationCode }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? 'Could not complete Yahoo authorization.');
      return;
    }
    setYahooOAuthStatus((current) => ({
      ...current,
      authorized: true,
      requiresReconnect: false,
    }));
    setYahooAuthorizationUrl('');
    setYahooAuthorizationState('');
    setYahooAuthorizationCode('');
    setMessage(
      'Yahoo Fantasy is authorized. Access tokens are stored in the operating system credential store.',
    );
    onCredentialsChanged();
  }

  async function disconnectYahoo() {
    const response = await fetch('/api/yahoo/oauth/token', { method: 'DELETE' });
    if (!response.ok) {
      setMessage('Could not remove Yahoo authorization.');
      return;
    }
    setYahooOAuthStatus((current) => ({
      ...current,
      authorized: false,
      requiresReconnect: false,
    }));
    onCredentialsChanged();
    setMessage('Yahoo authorization removed from the operating system credential store.');
  }

  function handleRestoredSettings(restoredSettings: AppSettings) {
    onSaved(restoredSettings);
    setForm(restoredSettings);
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

  return (
    <form className="settings-page" onSubmit={saveSettings}>
      <div className="page-title-block">
        <div>
          <p className="section-overline">MAKE IT YOURS</p>
          <h1>Settings</h1>
          <p>Control the voice, providers, and what your league-mate is allowed to do.</p>
        </div>
        <button type="submit" className="primary-button">
          <Save size={15} /> Save settings
        </button>
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
          <button type="button" onClick={() => setMessage('')}>
            ×
          </button>
        </div>
      )}
      <YahooConnectionSection
        headingRef={yahooHeadingRef}
        status={yahooOAuthStatus}
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
      />
      <DesktopSettingsSections
        dataDirectoryHeadingRef={dataDirectoryHeadingRef}
        onDataDirectoryLoaded={setDataDirectory}
        onNotice={setMessage}
      />
      <LocalBackupSection
        onNotice={setMessage}
        onRestored={onRestored}
        onSettingsRestored={handleRestoredSettings}
      />
      <WritingStyleSection
        headingRef={voiceHeadingRef}
        writingStyle={form.writingStyle}
        reportLength={form.reportLength ?? 'standard'}
        allowProfanity={form.allowProfanity}
        excludedTopics={form.excludedTopics}
        channelBoundaries={normalizeChannelBoundaries(form.channelBoundaries)}
        onWritingStyleChange={(writingStyle) =>
          setForm((current) => ({ ...current, writingStyle }))
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
      <AIRuntimeSection
        headingRef={aiHeadingRef}
        runtime={runtime}
        availableModels={availableModels}
        appleCliPlatform={appleCliPlatform}
        busy={runtimeBusy}
        onChange={setRuntime}
        onDiscoverModels={() => void discoverModels()}
        onTestRuntime={() => void testRuntime()}
      />
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
      <section className="settings-card">
        <AutomaticActionsSection
          actions={form.actions}
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
        <small className="schedule-explainer">
          Reports use the league’s latest connected data. One-time events run on their selected
          local date and time if the service is running that day. Review mode saves a draft;
          automatic delivery uses the channel and recipient configured below.
        </small>
        <label className="switch-label">
          <input
            type="checkbox"
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
                {hours < 24 ? `${hours} hours` : hours === 168 ? '7 days' : `${hours / 24} days`}
              </option>
            ))}
          </select>
        </label>
        <small className="schedule-explainer">
          The Leagues page warns at this age. Old snapshots remain available, but may no longer
          reflect current rosters or standings.
        </small>
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
        <div className="news-source-settings">
          <h3>SCHEDULED LEAGUE REFRESH RETRIES</h3>
          <label>
            ADDITIONAL ATTEMPTS
            <select
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
            Retries only transient league refresh failures with a short backoff. Authentication and
            permission errors stop immediately. Report generation and message delivery are never
            repeated by this setting.
          </small>
        </div>
        <div className="news-source-settings">
          <h3>FOOTBALL NEWS SOURCES</h3>
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
            Only selected built-in feeds are fetched. Clear all to disable external news requests.
            FOX Sports permits its feed for individual or nonprofit noncommercial use and requires
            attribution, which appears on each headline; review its{' '}
            <a href="https://www.foxsports.com/rss-feeds" target="_blank" rel="noreferrer">
              feed terms
            </a>{' '}
            before enabling it.
          </small>
          <label className="switch-label news-source-option">
            <input
              type="checkbox"
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
            include only exact current-roster name/team matches for the league week. Matched rows
            are sent to your selected AI runtime with the report. The source updates daily during
            the season and its retrieval time and link appear in the report when cited. Data is
            attributed to{' '}
            <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">
              nflverse-data contributors
            </a>{' '}
            under{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
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
            Football headlines refresh automatically after this interval. Use the refresh icon on
            the League desk to fetch them sooner.
          </p>
        </div>
        <div className="settings-fields two recipients">
          <label>
            EMAIL RECIPIENT
            <input
              value={form.emailRecipient ?? ''}
              onChange={(event) =>
                setForm((current) => ({ ...current, emailRecipient: event.target.value }))
              }
              placeholder="league@example.com"
            />
          </label>
          <label>
            SMS RECIPIENT OR TWILIO GROUP SID
            <input
              value={form.smsRecipient ?? ''}
              onChange={(event) =>
                setForm((current) => ({ ...current, smsRecipient: event.target.value }))
              }
              placeholder="+15555550123"
            />
            <small>
              Use a phone number for direct SMS or an existing Twilio Conversations SID (CH…) to
              send reports into that group. The app does not create conversations or add members.
            </small>
          </label>
          <label>
            IMESSAGE GROUP CHAT ID
            <input
              value={form.imessageChatGuid ?? ''}
              onChange={(event) =>
                setForm((current) => ({ ...current, imessageChatGuid: event.target.value }))
              }
              placeholder="iMessage chat GUID from BlueBubbles"
            />
            <small>
              Connect a BlueBubbles server below, then use its chat GUID for the group you want to
              receive reports.
            </small>
          </label>
          <label>
            YOUR NAME IN THE GROUP CHAT
            <input
              required
              value={form.imessageOwnerName ?? 'League owner'}
              maxLength={100}
              onChange={(event) =>
                setForm((current) => ({ ...current, imessageOwnerName: event.target.value }))
              }
              placeholder="The name friends use for you"
            />
            <small>Used to identify messages sent from your own iMessage account.</small>
          </label>
        </div>
        <label className="switch-label">
          <input
            type="checkbox"
            checked={form.twilioConversationAutoSyncEnabled ?? false}
            disabled={!form.memoryEnabled || !validTwilioConversationTarget || !twilioConfigured}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                twilioConversationAutoSyncEnabled: event.target.checked,
              }))
            }
          />
          Automatically sync this Twilio Conversations group
        </label>
        <div className="schedule-fields">
          <label>
            CHECK FOR NEW TWILIO MESSAGES
            <select
              value={form.twilioConversationSyncIntervalMinutes ?? 15}
              disabled={!form.twilioConversationAutoSyncEnabled}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  twilioConversationSyncIntervalMinutes: Number(event.target.value) as
                    5 | 15 | 30 | 60,
                }))
              }
            >
              {[5, 15, 30, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  Every {minutes} minutes
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="schedule-explainer">
          When enabled, the running app checks only the configured Twilio group. History is imported
          page by page using the same local deduplication and retention rules as manual sync. AI
          analysis still requires its separate opt-in; memory must remain enabled.
        </p>
        {(!validTwilioConversationTarget || !twilioConfigured) && (
          <p className="schedule-explainer">
            Set an existing Twilio Conversations SID as the SMS target and save Twilio credentials
            before enabling automatic sync.
          </p>
        )}
        {twilioAutoSyncStatus?.lastCheckedAt && (
          <p className="schedule-explainer" role="status">
            Last automatic Twilio check:{' '}
            {new Date(twilioAutoSyncStatus.lastCheckedAt).toLocaleString()}.
            {twilioAutoSyncStatus.lastError
              ? ` ${twilioAutoSyncStatus.lastError}`
              : ` ${twilioAutoSyncStatus.lastAddedMessages ?? 0} new messages imported.`}
          </p>
        )}
        <label className="switch-label">
          <input
            type="checkbox"
            checked={form.imessageAutoSyncEnabled}
            disabled={
              !form.memoryEnabled || !form.imessageChatGuid?.trim() || !blueBubblesConfigured
            }
            onChange={(event) =>
              setForm((current) => ({ ...current, imessageAutoSyncEnabled: event.target.checked }))
            }
          />
          Automatically sync this group chat
        </label>
        <div className="schedule-fields">
          <label>
            CHECK FOR NEW MESSAGES
            <select
              value={form.imessageSyncIntervalMinutes}
              disabled={!form.imessageAutoSyncEnabled}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  imessageSyncIntervalMinutes: Number(event.target.value) as 5 | 15 | 30 | 60,
                }))
              }
            >
              {[5, 15, 30, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  Every {minutes} minutes
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="schedule-explainer">
          When enabled, the running app checks only this chat on the selected interval. New message
          text stays local unless conversation analysis is separately enabled. Turning off member
          memory disables polling. Retention settings still apply.
        </p>
        {!blueBubblesConfigured && (
          <p className="schedule-explainer">
            Save BlueBubbles server settings in Credentials before enabling automatic sync.
          </p>
        )}
        <div className="schedule-fields">
          <div>
            <strong>Live message webhook</strong>
            <p className="schedule-explainer">
              Optional when BlueBubbles and Sunday Sidekick run on the same computer. Create a
              private local URL, then add it as a <code>new-message</code> webhook in BlueBubbles.
              It triggers the same bounded history sync and memory settings as polling. The URL
              contains a secret and is shown once; regenerate it if you lose it.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="small-button"
                onClick={() => void createBlueBubblesWebhook()}
              >
                {blueBubblesWebhookConfigured ? 'Regenerate webhook URL' : 'Create webhook URL'}
              </button>
              {blueBubblesWebhookConfigured && (
                <button
                  type="button"
                  className="small-button danger"
                  onClick={() => void revokeBlueBubblesWebhook()}
                >
                  Revoke webhook
                </button>
              )}
            </div>
            {blueBubblesWebhookUrl && (
              <div className="credential-test">
                <input
                  type="text"
                  readOnly
                  value={blueBubblesWebhookUrl}
                  aria-label="Private BlueBubbles webhook URL"
                />
                <button
                  type="button"
                  className="small-button"
                  onClick={() => {
                    void navigator.clipboard.writeText(blueBubblesWebhookUrl);
                    setMessage('Webhook URL copied. Paste it into BlueBubbles.');
                  }}
                >
                  <Copy size={13} /> Copy URL
                </button>
              </div>
            )}
          </div>
        </div>
        {imessageAutoSyncStatus?.lastCheckedAt && (
          <p className="schedule-explainer" role="status">
            Last automatic check: {new Date(imessageAutoSyncStatus.lastCheckedAt).toLocaleString()}.
            {imessageAutoSyncStatus.lastError
              ? ` ${imessageAutoSyncStatus.lastError}`
              : ` ${imessageAutoSyncStatus.lastAddedMessages ?? 0} new messages imported.`}
          </p>
        )}
        <div className="settings-fields two recipients">
          <label>
            GROUP CHAT AGENT NAME OR MENTION
            <input
              maxLength={60}
              required
              value={form.chatAgentName ?? 'Sunday Sidekick'}
              onChange={(event) =>
                setForm((current) => ({ ...current, chatAgentName: event.target.value }))
              }
              placeholder="Sunday Sidekick"
            />
          </label>
          <label>
            LEAGUE CONTEXT FOR CHAT REPLIES
            <select
              value={form.chatReplyLeagueId ?? ''}
              disabled={leagues.length === 0}
              onChange={(event) =>
                setForm((current) => ({ ...current, chatReplyLeagueId: event.target.value }))
              }
            >
              {leagues.length === 0 && <option value="">Connect a league first</option>}
              {leagues.map((league) => (
                <option value={league.id} key={league.id}>
                  {league.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="switch-label">
          <input
            type="checkbox"
            checked={form.chatRepliesEnabled === true}
            disabled={!form.memoryEnabled || !chatReplyDestinationReady || leagues.length === 0}
            onChange={(event) =>
              setForm((current) => ({ ...current, chatRepliesEnabled: event.target.checked }))
            }
          />
          Draft a reply when someone directly addresses the agent
        </label>
        <label className="switch-label">
          <input
            type="checkbox"
            checked={form.chatRepliesAutoSend === true}
            disabled={form.chatRepliesEnabled !== true}
            onChange={(event) =>
              setForm((current) => ({ ...current, chatRepliesAutoSend: event.target.checked }))
            }
          />
          Send generated chat replies automatically
        </label>
        <p className="schedule-explainer">
          This is off by default. When enabled, a group sync checks new messages for a first-line “
          {form.chatAgentName || 'Sunday Sidekick'}” or “@{form.chatAgentName || 'Sunday Sidekick'}”
          mention, sends that message and the selected league context to your configured AI runtime,
          and saves a reply draft. By default, review and send from Schedule & drafts. If you
          separately enable automatic sending, generated replies go directly to the configured
          group. The configured group channel is used, and member notes are included only when their
          separate report-context setting is enabled.
        </p>
      </section>
      <CredentialsSection
        headingRef={credentialsHeadingRef}
        credentialStoreAvailable={credentialStoreAvailable}
        secretState={secretState}
        secretValues={secretValues}
        onSecretValueChange={(provider, value) =>
          setSecretValues((current) => ({ ...current, [provider]: value }))
        }
        onSaveSecret={(provider) => void saveSecret(provider)}
        onRemoveSecret={(provider) => void removeSecret(provider)}
        credentialTestBusy={credentialTestBusy}
        resendTestRecipient={resendTestRecipient}
        onResendTestRecipientChange={setResendTestRecipient}
        onTestTwilio={() => void testTwilioCredentials()}
        onTestResend={() => void testResendCredentials()}
        imageGenerationConfigured={imageGenerationConfigured}
        imagePrompt={imagePrompt}
        onImagePromptChange={setImagePrompt}
        generatedImage={generatedImage}
        imageGenerationBusy={imageGenerationBusy}
        onCreateImage={() => void createImage()}
        localImages={localImages}
        onRemoveImage={(id) => void removeLocalImage(id)}
      />
      <section className="settings-card">
        <div className="settings-card-title">
          <div>
            <h2>Local runtime logs</h2>
            <p>Recent background service events stored on this computer.</p>
          </div>
          <button
            type="button"
            className="small-button"
            onClick={() => void refreshDiagnosticLogs()}
            disabled={diagnosticLogsBusy}
          >
            <RefreshCw size={14} className={diagnosticLogsBusy ? 'spinning' : ''} />
            {diagnosticLogsBusy ? 'Loading…' : 'Refresh logs'}
          </button>
        </div>
        <small>
          Only structured operational events and reviewed metadata are shown. Request bodies,
          conversation text, provider output, and credentials are omitted.
        </small>
        {diagnosticLogsError && (
          <p className="schedule-explainer" role="alert">
            {diagnosticLogsError}
          </p>
        )}
        {diagnosticLogs && !diagnosticLogs.available && (
          <p className="schedule-explainer">
            File-based diagnostics are available in the packaged app and installed source service. A
            service started directly from a terminal writes logs there instead.
          </p>
        )}
        {diagnosticLogs?.available && diagnosticLogs.entries.length === 0 && (
          <p className="schedule-explainer">No structured log entries have been captured yet.</p>
        )}
        {diagnosticLogs?.entries.length ? (
          <ol className="diagnostic-log-list" aria-label="Recent local runtime events">
            {diagnosticLogs.entries.map((entry, index) => (
              <li
                className={`diagnostic-log-row ${entry.level}`}
                key={`${entry.timestamp}-${index}`}
              >
                <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time>
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
