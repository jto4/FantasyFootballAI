import { useEffect, useRef, useState } from 'react';
import type { AppSettings } from '@sidekick/core';
import { requestJson } from '../api-client';
import type { CredentialProvider } from '../app-state';

type Runtime = NonNullable<AppSettings['aiRuntime']>;

/**
 * Whether the saved AI connection works. Each configuration is checked once, without sending any
 * league data, and an OpenAI-style connection needs its key saved first.
 */
export function useAiConnection(input: {
  runtime: Runtime | undefined;
  credentialProviders: CredentialProvider[];
  stateLoaded: boolean;
  /** Guided setup runs its own test, so this one waits. */
  paused: boolean;
}) {
  const { runtime, credentialProviders, stateLoaded, paused } = input;
  const [testedSignature, setTestedSignature] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [credentialRevision, setCredentialRevision] = useState(0);
  const lastChecked = useRef('');
  const signature = runtime ? JSON.stringify(runtime) : '';
  const keySaved = credentialProviders.some(
    (provider) => provider.provider === 'openai' && provider.configured,
  );
  const ready = Boolean(
    runtime && testedSignature === signature && (runtime.mode !== 'api' || keySaved),
  );
  useEffect(() => {
    if (paused || !stateLoaded || !runtime || testedSignature === signature) return;
    if (runtime.mode === 'api' && !keySaved) return;
    if (lastChecked.current === signature) return;
    lastChecked.current = signature;
    const abort = new AbortController();
    setChecking(true);
    setError('');
    void requestJson(
      '/api/ai/test',
      (value): value is { ok: true } =>
        Boolean(value && typeof value === 'object' && 'ok' in value && value.ok === true),
      { method: 'POST', signal: abort.signal },
      60000,
    )
      .then(() => {
        if (!abort.signal.aborted) setTestedSignature(signature);
      })
      .catch((failure) => {
        if (!abort.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : 'Could not test your AI connection.',
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setChecking(false);
      });
    return () => {
      abort.abort();
      if (lastChecked.current === signature) lastChecked.current = '';
      setChecking(false);
    };
  }, [
    stateLoaded,
    paused,
    credentialRevision,
    signature,
    runtime?.mode === 'api'
      ? credentialProviders
          .map((provider) => `${provider.provider}:${provider.configured}`)
          .join('|')
      : '',
  ]);
  return {
    ready,
    checking,
    error,
    /** A test elsewhere (Settings, guided setup) passed for this configuration. */
    markTested(tested: Runtime) {
      setTestedSignature(JSON.stringify(tested));
      setError('');
    },
    /** A saved key changed, so the connection must be checked again. */
    recheck() {
      setTestedSignature('');
      setCredentialRevision((current) => current + 1);
      lastChecked.current = '';
    },
  };
}
