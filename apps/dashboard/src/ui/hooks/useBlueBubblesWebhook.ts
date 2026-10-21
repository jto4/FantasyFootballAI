import { useState } from 'react';

/** The webhook URL embeds a secret token, so it is held only in memory and shown once. */
export function useBlueBubblesWebhook(setMessage: (message: string) => void) {
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  function clear(isConfigured: boolean) {
    setConfigured(isConfigured);
    setError('');
    setLoading(false);
    setUrl('');
  }
  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/bluebubbles/webhook');
      const result: unknown = await response.json();
      if (
        !response.ok ||
        !result ||
        typeof result !== 'object' ||
        typeof (result as { configured?: unknown }).configured !== 'boolean'
      )
        throw new Error('Could not read BlueBubbles webhook status.');
      setConfigured((result as { configured: boolean }).configured);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not read BlueBubbles webhook status.',
      );
    } finally {
      setLoading(false);
    }
  }
  async function create() {
    const response = await fetch('/api/bluebubbles/webhook', { method: 'POST' });
    const result = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !result.url) {
      setMessage(result.error ?? 'Could not create a BlueBubbles webhook URL.');
      return;
    }
    clear(true);
    setUrl(result.url);
    setMessage('Webhook URL created. Copy it into BlueBubbles now; it is shown only once.');
  }
  async function revoke() {
    const response = await fetch('/api/bluebubbles/webhook', { method: 'DELETE' });
    if (!response.ok) {
      setMessage('Could not revoke the BlueBubbles webhook URL.');
      return;
    }
    clear(false);
    setMessage('Webhook URL revoked.');
  }
  return { configured, loading, error, url, refresh, create, revoke, reset: () => clear(false) };
}
