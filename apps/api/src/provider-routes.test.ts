import express from 'express';
import type { AIProvider } from '@sidekick/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProviderRouter } from './provider-routes.js';

describe('provider API routes', () => {
  const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  });

  async function startServer(overrides: Partial<Parameters<typeof createProviderRouter>[0]> = {}) {
    const dependencies: Parameters<typeof createProviderRouter>[0] = {
      listCredentialProviders: async () => [],
      saveCredential: async () => undefined,
      removeCredential: async () => undefined,
      readCredential: async () => null,
      settingsSnapshot: () => ({
        writingStyle: '',
        reportLength: 'standard',
        allowProfanity: false,
        excludedTopics: '',
        actions: [],
        memoryEnabled: false,
        analyzeImportsWithAI: false,
        includeMemberContextInReports: false,
        imessageAutoSyncEnabled: false,
        imessageSyncIntervalMinutes: 15 as const,
      }),
      configuredAI: async () => null,
      verifyTwilioCredentials: async () => ({ valid: true }),
      sendResendTestEmail: async () => undefined,
      discoverModels: async () => ['test-model'],
      ...overrides,
    };
    const app = express();
    app.use(express.json());
    app.use(createProviderRouter(dependencies));
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not bind a port.');
    return `http://127.0.0.1:${address.port}`;
  }

  it('saves and removes only credential references, including the BlueBubbles webhook token', async () => {
    const saveCredential = vi.fn(async () => undefined);
    const removeCredential = vi.fn(async () => undefined);
    const baseUrl = await startServer({ saveCredential, removeCredential });

    const saved = await fetch(`${baseUrl}/api/credentials/openai`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: ' secret ' }),
    });
    expect(saved.status).toBe(204);
    expect(saveCredential).toHaveBeenCalledWith('openai', ' secret ');

    const missingValue = await fetch(`${baseUrl}/api/credentials/openai`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missingValue.status).toBe(400);
    expect(await missingValue.json()).toEqual({ error: 'Credential value is required.' });

    const removed = await fetch(`${baseUrl}/api/credentials/bluebubbles`, { method: 'DELETE' });
    expect(removed.status).toBe(204);
    expect(removeCredential.mock.calls).toEqual([['bluebubbles-webhook-token'], ['bluebubbles']]);
  });

  it('requires explicit confirmation and a valid recipient before sending a test email', async () => {
    const sendResendTestEmail = vi.fn(async () => undefined);
    const baseUrl = await startServer({
      readCredential: async (provider) =>
        provider === 'resend'
          ? JSON.stringify({ apiKey: 'secret-key', from: 'bot@example.com' })
          : null,
      sendResendTestEmail,
    });
    const headers = { 'content-type': 'application/json' };

    const unconfirmed = await fetch(`${baseUrl}/api/credentials/resend/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ recipient: 'owner@example.com' }),
    });
    expect(unconfirmed.status).toBe(400);
    expect(sendResendTestEmail).not.toHaveBeenCalled();

    const invalid = await fetch(`${baseUrl}/api/credentials/resend/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        recipient: 'owner@example.com\r\nBcc:other@example.com',
        confirmation: 'SEND_TEST',
      }),
    });
    expect(invalid.status).toBe(400);
    expect(sendResendTestEmail).not.toHaveBeenCalled();

    const confirmed = await fetch(`${baseUrl}/api/credentials/resend/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ recipient: 'owner@example.com', confirmation: 'SEND_TEST' }),
    });
    expect(confirmed.status).toBe(200);
    expect(sendResendTestEmail).toHaveBeenCalledWith(
      'secret-key',
      'bot@example.com',
      'owner@example.com',
      expect.stringMatching(/^setup-test-/),
    );
  });

  it('sanitizes AI runtime failures and only discovers models for API runtimes', async () => {
    const settings = {
      writingStyle: '',
      reportLength: 'standard' as const,
      allowProfanity: false,
      excludedTopics: '',
      actions: [],
      memoryEnabled: false,
      analyzeImportsWithAI: false,
      includeMemberContextInReports: false,
      imessageAutoSyncEnabled: false,
      imessageSyncIntervalMinutes: 15 as const,
      aiRuntime: { mode: 'api' as const, model: 'model-x', command: '', args: '', baseUrl: '' },
    };
    const ai: AIProvider = {
      id: 'test-provider',
      generate: vi.fn().mockRejectedValue(new Error('secret=/private/key')),
    };
    const configuredAI = vi.fn(async () => ai);
    const discoverModels = vi.fn(async () => ['model-x', 'model-y']);
    const baseUrl = await startServer({
      settingsSnapshot: () => settings,
      configuredAI,
      readCredential: async (provider) => (provider === 'openai' ? 'secret-key' : null),
      discoverModels,
    });

    const test = await fetch(`${baseUrl}/api/ai/test`, { method: 'POST' });
    expect(test.status).toBe(502);
    expect(await test.json()).toEqual({
      error: 'The AI runtime test failed. Check the API key, model, endpoint, or CLI command.',
    });

    const models = await fetch(`${baseUrl}/api/ai/models`, { method: 'POST' });
    expect(models.status).toBe(200);
    expect(await models.json()).toEqual({ models: ['model-x', 'model-y'] });
    expect(discoverModels).toHaveBeenCalledWith('secret-key', 'model-x', '');
  });
});
