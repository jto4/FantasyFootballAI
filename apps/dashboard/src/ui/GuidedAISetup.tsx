import { useEffect, useState } from 'react';
import { isAppSettings, settingsSectionPatch, type AppSettings } from '@sidekick/core';
import { requestJson, requestResponse } from './api-client';
import { isAppState, isCredentialProviders } from './app-state';
import { FriendlyError } from './FriendlyError';

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
  const existing = Boolean(settings.aiRuntime && (settings.aiRuntime.mode !== 'api' || configured));
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
        if (
          credentials.some((provider) => provider.provider === 'openai' && provider.configured) &&
          (current.settings.aiRuntime?.mode !== 'api' ||
            current.settings.aiRuntime.baseUrl !== 'https://api.openai.com/v1')
        )
          throw new Error(
            'Another AI connection is already saved. Test that connection or use Advanced to change providers.',
          );
        const runtime: NonNullable<AppSettings['aiRuntime']> = {
          mode: 'api',
          model: 'gpt-4o-mini',
          baseUrl: 'https://api.openai.com/v1',
          command: '',
          args: '',
          temperature: 0.8,
          maxOutputTokens: 1200,
        };
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
        await requestResponse('/api/credentials/openai', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: key.trim() }),
        });
        setKey('');
        setConfigured(true);
        onCredentialsChanged('openai');
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
      <h3>{existing ? 'Check your saved AI connection' : 'Connect with OpenAI'}</h3>
      <p>
        {existing
          ? 'We’ll send a small connection test. No league data is included.'
          : 'Use an OpenAI account with API billing enabled. API usage is billed separately from ChatGPT.'}
      </p>
      {!existing && (
        <p>
          <a
            href="https://help.openai.com/en/articles/9039756-managing-billing-settings-on-chatgpt-web-and-platform"
            target="_blank"
            rel="noreferrer"
          >
            About OpenAI API billing
          </a>
        </p>
      )}
      {!existing && (
        <ol>
          <li>
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
              Create an OpenAI API key
            </a>{' '}
            in your own account.
          </li>
          <li>Paste the key below. It is saved in this computer’s secure credential store.</li>
          <li>We’ll choose a starting model and test the connection for you.</li>
        </ol>
      )}
      {!existing && (
        <label>
          OpenAI API key
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
          message="Your AI connection needs attention. Check your key and API billing, or open Advanced for another connection."
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
      <details>
        <summary>Advanced: another AI service or a local tool</summary>
        <p>Keep full control over your provider, model, server address, and local tools.</p>
        <button type="button" className="small-button" disabled={busy} onClick={onAdvanced}>
          Open AI settings
        </button>
      </details>
    </section>
  );
}
