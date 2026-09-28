import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { AppSettings, AIProvider } from '@sidekick/core';
import {
  CredentialStoreUnavailableError,
  CredentialValidationError,
  type CredentialProvider,
} from './credentials.js';

export interface ProviderRouteDependencies {
  listCredentialProviders: () => Promise<unknown>;
  saveCredential: (provider: string | undefined, value: string) => Promise<void>;
  removeCredential: (provider: string | undefined) => Promise<void>;
  readCredential: (provider: CredentialProvider) => Promise<string | null>;
  settingsSnapshot: () => AppSettings;
  configuredAI: (settings: AppSettings) => Promise<AIProvider | null>;
  verifyTwilioCredentials: (
    accountSid: string,
    authToken: string,
  ) => Promise<{ valid: boolean; reason?: string }>;
  sendResendTestEmail: (
    apiKey: string,
    from: string,
    recipient: string,
    idempotencyKey: string,
  ) => Promise<void>;
  discoverModels: (
    apiKey: string,
    model: string | undefined,
    baseUrl: string | undefined,
  ) => Promise<string[]>;
}

/** Keep provider setup and health endpoints together, with only the narrow provider operations injected. */
export function createProviderRouter(dependencies: ProviderRouteDependencies): Router {
  const router = Router();

  router.get('/api/credentials', async (_req, res) => {
    try {
      res.json(await dependencies.listCredentialProviders());
    } catch {
      res.status(503).json({ error: 'The operating system credential store is unavailable.' });
    }
  });

  router.put('/api/credentials/:provider', async (req, res) => {
    const body = req.body as { value?: unknown } | null;
    const value = body?.value;
    if (typeof value !== 'string')
      return res.status(400).json({ error: 'Credential value is required.' });
    try {
      await dependencies.saveCredential(req.params.provider, value);
      res.status(204).end();
    } catch (error) {
      if (error instanceof CredentialValidationError)
        return res.status(400).json({ error: error.message });
      if (error instanceof CredentialStoreUnavailableError)
        return res.status(503).json({ error: error.message });
      res.status(503).json({ error: 'The operating system credential store is unavailable.' });
    }
  });

  router.delete('/api/credentials/:provider', async (req, res) => {
    try {
      if (req.params.provider === 'bluebubbles')
        await dependencies.removeCredential('bluebubbles-webhook-token');
      await dependencies.removeCredential(req.params.provider);
      res.status(204).end();
    } catch (error) {
      if (error instanceof CredentialValidationError)
        return res.status(400).json({ error: error.message });
      if (error instanceof CredentialStoreUnavailableError)
        return res.status(503).json({ error: error.message });
      res.status(503).json({ error: 'The operating system credential store is unavailable.' });
    }
  });

  router.post('/api/credentials/twilio/test', async (_req, res) => {
    try {
      const config = parseSecret(await dependencies.readCredential('twilio'));
      const accountSid = config.accountSid;
      const authToken = config.authToken;
      if (typeof accountSid !== 'string' || typeof authToken !== 'string')
        return res.status(400).json({ error: 'Save valid Twilio settings before testing.' });
      const result = await dependencies.verifyTwilioCredentials(accountSid, authToken);
      if (result.valid) return res.json({ connected: true });
      if (result.reason === 'credentials')
        return res.status(401).json({
          error: 'Twilio rejected these credentials. Check the Account SID and auth token.',
        });
      return res.status(502).json({ error: 'Twilio could not be reached. Try again later.' });
    } catch {
      return res
        .status(503)
        .json({ error: 'The operating system credential store is unavailable.' });
    }
  });

  router.post('/api/credentials/resend/test', async (req, res) => {
    const body = req.body as { recipient?: unknown; confirmation?: unknown } | null;
    const recipient = body?.recipient;
    if (body?.confirmation !== 'SEND_TEST')
      return res.status(400).json({ error: 'Confirm the test email before sending.' });
    if (typeof recipient !== 'string' || !isValidEmailAddress(recipient))
      return res.status(400).json({ error: 'Enter a valid test email address.' });

    let config: Record<string, unknown>;
    try {
      config = parseSecret(await dependencies.readCredential('resend'));
    } catch {
      return res
        .status(503)
        .json({ error: 'The operating system credential store is unavailable.' });
    }
    if (typeof config.apiKey !== 'string' || typeof config.from !== 'string')
      return res.status(400).json({ error: 'Save valid Resend settings before testing.' });
    try {
      await dependencies.sendResendTestEmail(
        config.apiKey,
        config.from,
        recipient,
        `setup-test-${randomUUID()}`,
      );
      return res.json({ sent: true });
    } catch {
      return res
        .status(502)
        .json({ error: 'Resend could not send the test email. Check the key and sender address.' });
    }
  });

  router.post('/api/ai/test', async (_req, res) => {
    const settings = dependencies.settingsSnapshot();
    try {
      if (settings.aiRuntime?.mode === 'apple-cli' && process.platform !== 'darwin') {
        return res.status(409).json({
          error: 'Apple Foundation Models CLI is available on supported macOS versions only.',
        });
      }
      const ai = await dependencies.configuredAI(settings);
      if (!ai) {
        return res.status(409).json({
          error:
            settings.aiRuntime?.mode === 'apple-cli'
              ? 'Apple Foundation Models CLI requires macOS 27 or later with the fm command available.'
              : settings.aiRuntime?.mode === 'cli'
                ? 'Set an installed AI CLI command in Settings.'
                : 'Save an AI API key in Settings before testing the runtime.',
        });
      }
      await ai.generate({
        system: 'Reply with exactly OK and no other text.',
        prompt: 'This is a connection test. Reply OK.',
        temperature: 0,
      });
      res.json({ ok: true });
    } catch {
      // Provider and CLI error details may contain local paths or credentials.
      res.status(502).json({
        error:
          settings.aiRuntime?.mode === 'apple-cli'
            ? 'The Apple Foundation Models test failed. Confirm macOS 27 or later is installed, Apple Intelligence is available, and the fm command works in Terminal.'
            : 'The AI runtime test failed. Check the API key, model, endpoint, or CLI command.',
      });
    }
  });

  router.post('/api/ai/models', async (_req, res) => {
    const runtime = dependencies.settingsSnapshot().aiRuntime;
    if (runtime?.mode !== 'api')
      return res.status(409).json({ error: 'Model discovery is available for API runtimes only.' });
    try {
      const key = await dependencies.readCredential('openai');
      if (!key)
        return res.status(409).json({ error: 'Save an AI API key in Settings before discovery.' });
      const models = await dependencies.discoverModels(key, runtime.model, runtime.baseUrl);
      res.json({ models });
    } catch {
      // Provider errors can contain endpoint details or credentials; only return actionable guidance.
      res.status(502).json({
        error:
          'Could not discover models. Check the API key and endpoint, or enter a model manually.',
      });
    }
  });

  return router;
}

function parseSecret(value: string | null): Record<string, unknown> {
  try {
    return value ? (JSON.parse(value) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isValidEmailAddress(value: string): boolean {
  return (
    value.length <= 320 &&
    !/[\r\n]/.test(value) &&
    /^[^\s@<>]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)
  );
}
