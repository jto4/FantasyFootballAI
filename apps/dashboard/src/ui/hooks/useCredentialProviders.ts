import { useState } from 'react';
import { isCredentialProviders, type CredentialProvider } from '../app-state';

/** Which providers have a saved key. Only names and yes/no reach the dashboard, never the keys. */
export function useCredentialProviders(onRefreshFailed: () => void) {
  const [providers, setProviders] = useState<CredentialProvider[]>([]);
  return {
    providers,
    /** Takes the startup request's result; a bad optional read keeps the last known status. */
    async receive(response: PromiseSettledResult<Response>) {
      if (response.status !== 'fulfilled' || !response.value.ok) return;
      try {
        const result: unknown = await response.value.json();
        if (isCredentialProviders(result)) setProviders(result);
      } catch {
        // Keep the last known credential status if an optional refresh is malformed.
      }
    },
    async refresh() {
      try {
        const response = await fetch('/api/credentials');
        if (!response.ok) throw new Error(`Credential status request failed (${response.status}).`);
        const credentials: unknown = await response.json();
        if (!isCredentialProviders(credentials))
          throw new Error('Credential status response was invalid.');
        setProviders(credentials);
      } catch {
        onRefreshFailed();
      }
    },
  };
}
