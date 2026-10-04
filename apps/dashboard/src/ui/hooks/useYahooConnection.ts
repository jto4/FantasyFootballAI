import { useState } from 'react';
import type { YahooOAuthStatus } from '../YahooConnectionSection';
function isYahooOAuthStatus(value: unknown): value is YahooOAuthStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Record<string, unknown>;
  return (
    typeof status.clientConfigured === 'boolean' &&
    typeof status.authorized === 'boolean' &&
    typeof status.requiresReconnect === 'boolean' &&
    typeof status.redirectUri === 'string'
  );
}

export function useYahooConnection(
  setMessage: (message: string) => void,
  onCredentialsChanged: () => void,
) {
  const [yahooClientId, setYahooClientId] = useState('');
  const [yahooClientSecret, setYahooClientSecret] = useState('');
  const [yahooAuthorizationUrl, setYahooAuthorizationUrl] = useState('');
  const [yahooAuthorizationState, setYahooAuthorizationState] = useState('');
  const [yahooAuthorizationCode, setYahooAuthorizationCode] = useState('');
  const [yahooStatusLoading, setYahooStatusLoading] = useState(true);
  const [yahooStatusError, setYahooStatusError] = useState('');
  const [yahooOAuthStatus, setYahooOAuthStatus] = useState<YahooOAuthStatus>({
    clientConfigured: false,
    authorized: false,
    requiresReconnect: false,
    redirectUri: '',
  });

  async function refreshYahooOAuthStatus() {
    setYahooStatusLoading(true);
    setYahooStatusError('');
    try {
      const response = await fetch('/api/yahoo/oauth/status');
      const result: unknown = await response.json();
      if (!response.ok || !isYahooOAuthStatus(result))
        throw new Error('Could not read Yahoo connection status.');
      setYahooOAuthStatus(result);
    } catch (error) {
      setYahooStatusError(
        error instanceof Error ? error.message : 'Could not read Yahoo connection status.',
      );
    } finally {
      setYahooStatusLoading(false);
    }
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
    setYahooStatusError('');
    setYahooStatusLoading(false);
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
    setYahooStatusError('');
    setYahooStatusLoading(false);
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
    setYahooStatusError('');
    setYahooStatusLoading(false);
    onCredentialsChanged();
    setMessage('Yahoo authorization removed from the operating system credential store.');
  }

  return {
    yahooClientId,
    setYahooClientId,
    yahooClientSecret,
    setYahooClientSecret,
    yahooAuthorizationUrl,
    yahooAuthorizationState,
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
  };
}
