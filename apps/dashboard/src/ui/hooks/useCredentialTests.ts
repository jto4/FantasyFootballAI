import { useState } from 'react';

/** Provider credential checks. Only the Resend test sends anything, and only after confirmation. */
export function useCredentialTests(setMessage: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const [resendRecipient, setResendRecipient] = useState('');
  async function run(start: string, check: () => Promise<string>, failure: string) {
    setBusy(true);
    setMessage(start);
    try {
      setMessage(await check());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : failure);
    } finally {
      setBusy(false);
    }
  }
  const testTwilio = () =>
    run(
      'Checking Twilio credentials without sending a message…',
      async () => {
        const response = await fetch('/api/credentials/twilio/test', { method: 'POST' });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Twilio credential check failed.');
        return 'Twilio credentials are valid. No SMS was sent.';
      },
      'Twilio credential check failed.',
    );
  const testEspn = () =>
    run(
      'Checking the saved ESPN session with a connected league…',
      async () => {
        const response = await fetch('/api/credentials/espn/test', { method: 'POST' });
        const result = (await response.json()) as {
          connected?: boolean;
          league?: string;
          season?: number;
          error?: string;
        };
        if (!response.ok || result.connected !== true)
          throw new Error(result.error ?? 'ESPN session check failed.');
        return `ESPN access verified for ${result.league ?? 'the connected league'}${result.season ? ` (${result.season})` : ''}. No league data was changed.`;
      },
      'ESPN session check failed.',
    );
  async function testResend() {
    const recipient = resendRecipient.trim();
    if (!recipient || !window.confirm(`Send a data-free test email to ${recipient}?`)) return;
    await run(
      'Sending the confirmed test email…',
      async () => {
        const response = await fetch('/api/credentials/resend/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ recipient, confirmation: 'SEND_TEST' }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Resend test email failed.');
        return `Resend sent a data-free test email to ${recipient}.`;
      },
      'Resend test email failed.',
    );
  }
  return { busy, resendRecipient, setResendRecipient, testTwilio, testEspn, testResend };
}
