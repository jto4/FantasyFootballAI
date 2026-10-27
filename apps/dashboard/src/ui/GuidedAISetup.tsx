import { useEffect, useState } from 'react';
import { isAppSettings, settingsSectionPatch, type AppSettings } from '@sidekick/core';
import { requestJson, requestResponse } from './api-client';
import { isAppState, isCredentialProviders } from './app-state';
import { FriendlyError, aiProblemMessage } from './FriendlyError';

type KeyProvider = 'openai' | 'anthropic';
const providers: Record<
  KeyProvider,
  {
    name: string;
    label: string;
    about: string;
    keysUrl: string;
    runtime: NonNullable<AppSettings['aiRuntime']>;
  }
> = {
  openai: {
    name: 'OpenAI',
    label: 'OpenAI API key',
    about:
      'Use an OpenAI account with API billing enabled. API usage is billed separately from ChatGPT.',
    keysUrl: 'https://platform.openai.com/api-keys',
    runtime: {
      mode: 'api',
      model: 'gpt-6-luna',
      baseUrl: 'https://api.openai.com/v1',
      command: '',
      args: '',
      temperature: 0.8,
      maxOutputTokens: 4000,
    },
  },
  anthropic: {
    name: 'Claude',
    label: 'Anthropic API key',
    about:
      'Use an Anthropic account with API credits. API usage is billed separately from a Claude subscription.',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    runtime: {
      mode: 'anthropic-api',
      model: 'claude-opus-5-5',
      // Not used for Claude, but saved settings require an https address.
      baseUrl: 'https://api.anthropic.com',
      command: '',
      args: '',
      temperature: 0.8,
      maxOutputTokens: 4000,
    },
  },
};

export function GuidedAISetup({
  settings,
  onSaved,
  onReady,
  onCredentialsChanged,
  onAdvanced,
  onBusyChange,
}: {
  settings: AppSettings;
  onSaved: (settings: AppSettings) => void;
  onReady: (runtime: NonNullable<AppSettings['aiRuntime']>) => void;
  onCredentialsChanged: (provider?: string) => void;
  onAdvanced: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [key, setKey] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [provider, setProvider] = useState<KeyProvider>(
    settings.aiRuntime?.mode === 'anthropic-api' ? 'anthropic' : 'openai',
  );
  // A saved connection that keeps failing (for example an unverified Codex) can be replaced here.
  const [replacing, setReplacing] = useState(false);
  const chosen = providers[provider];
  const existing =
    !replacing && Boolean(settings.aiRuntime && (settings.aiRuntime.mode !== 'api' || configured));
  useEffect(() => {
    const abort = new AbortController();
    void requestJson('/api/credentials', isCredentialProviders, { signal: abort.signal })
      .then((providers) =>
        setConfigured(
          providers.some((provider) => provider.provider === 'openai' && provider.configured),
        ),
      )
      .catch((failure) => {
        if (!abort.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : 'Could not check your saved connection.',
          );
      });
    return () => abort.abort();
  }, []);
  async function connect() {
    if (busy) return;
    setBusy(true);
    onBusyChange(true);
    setError('');
    setReady(false);
    try {
      // Re-read the revision before a guided save so another window's settings are never overwritten.
      const current = await requestJson('/api/state?view=summary', isAppState);
      let saved = current.settings;
      if (key.trim()) {
        const credentials = await requestJson('/api/credentials', isCredentialProviders);
        // The "openai" key slot also serves OpenAI-compatible services; never overwrite a key
        // that another service is using.
        if (
          provider === 'openai' &&
          credentials.some((saved) => saved.provider === 'openai' && saved.configured) &&
          current.settings.aiRuntime?.mode === 'api' &&
          current.settings.aiRuntime.baseUrl !== 'https://api.openai.com/v1'
        )
          throw new Error(
            'Another AI connection is already saved. Test that connection or use Advanced to change providers.',
          );
        const runtime = chosen.runtime;
        saved = await requestJson('/api/settings/ai', isAppSettings, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'If-Match': String(current.settings.sectionRevisions?.ai ?? 0),
          },
          body: JSON.stringify(
            settingsSectionPatch({ ...current.settings, aiRuntime: runtime }, 'ai'),
          ),
        });
        await requestResponse(`/api/credentials/${provider}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: key.trim() }),
        });
        setKey('');
        setConfigured(true);
        setReplacing(false);
        onCredentialsChanged(provider);
        onSaved(saved);
      }
      const test = await requestJson(
        '/api/ai/test',
        (value): value is { ok: true } =>
          Boolean(value && typeof value === 'object' && 'ok' in value && value.ok === true),
        { method: 'POST' },
        60000,
      );
      if (test.ok && saved.aiRuntime) {
        onReady(saved.aiRuntime);
        setReady(true);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not connect to AI.');
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="guided-ai-setup">
      <h3>{existing ? 'Check your saved AI connection' : `Connect with ${chosen.name}`}</h3>
      {!existing && (
        <div className="segmented" role="radiogroup" aria-label="AI service">
          {(Object.keys(providers) as KeyProvider[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={provider === option}
              className={provider === option ? 'active' : ''}
              disabled={busy}
              onClick={() => {
                setProvider(option);
                setKey('');
                setError('');
              }}
            >
              {providers[option].name}
            </button>
          ))}
        </div>
      )}
      <p>
        {existing
          ? 'We’ll send a small connection test. No league data is included.'
          : chosen.about}
      </p>
      {!existing && (
        <ol>
          <li>
            <a href={chosen.keysUrl} target="_blank" rel="noreferrer">
              Create {provider === 'openai' ? 'an OpenAI' : 'an Anthropic'} API key
            </a>{' '}
            in your own account.
          </li>
          <li>Paste the key below. It is saved in this computer’s secure credential store.</li>
          <li>We’ll choose a starting model and test the connection for you.</li>
        </ol>
      )}
      {!existing && (
        <label>
          {chosen.label}
          <input
            type="password"
            autoComplete="off"
            value={key}
            maxLength={4096}
            disabled={busy}
            onChange={(event) => {
              setKey(event.target.value);
              setReady(false);
            }}
            placeholder="Paste your API key"
          />
        </label>
      )}
      {error && (
        <FriendlyError
          message={aiProblemMessage(
            error,
            'Your AI connection needs attention. Check your key and API billing, or open Advanced for another connection.',
          )}
          detail={error}
          action="Try again"
          onAction={() => void connect()}
        />
      )}
      {ready && (
        <p role="status" className="connection-success">
          ✓ Your AI connection works. You’re ready to create your first draft.
        </p>
      )}
      {configured === null && !error && <p role="status">Checking for a saved connection…</p>}
      <button
        type="button"
        className="primary-button"
        disabled={busy || (!existing && !key.trim()) || configured === null}
        onClick={() => void connect()}
      >
        {busy
          ? 'Checking connection…'
          : existing && !key.trim()
            ? 'Test connection'
            : 'Connect and test'}
      </button>
      {!existing && !key.trim() && (
        <small>Paste your API key to connect. You can finish setup later.</small>
      )}
      <p className="guided-ai-more">
        {existing && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setReplacing(true);
              setError('');
              setReady(false);
            }}
          >
            Use an API key instead
          </button>
        )}
        <button type="button" className="text-button" disabled={busy} onClick={onAdvanced}>
          Other services, local tools and models
        </button>
      </p>
    </section>
  );
}
