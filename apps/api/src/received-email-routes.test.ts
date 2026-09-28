import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '@sidekick/core';
import type { ReceivedEmail, ReceivedEmailSummary } from '@sidekick/integrations';
import type { AppState, LocalStore } from './store.js';
import {
  createReceivedEmailRouter,
  type ReceivedEmailRouteDependencies,
} from './received-email-routes.js';

const emailSummary: ReceivedEmailSummary = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  from: 'Alex Manager <alex@example.com>',
  to: ['league@example.com'],
  subject: 'Lineup chat',
  createdAt: '2026-09-20T12:00:00.000Z',
  messageId: '<abc@example.com>',
};

const email: ReceivedEmail = {
  ...emailSummary,
  text: 'This lineup is a mess.\n\nOn Sep 19, someone wrote:\n> Last week was worse.',
};

const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

async function startServer(
  overrides: Partial<ReceivedEmailRouteDependencies> & { beforeUpdate?: () => void } = {},
) {
  const state = {
    settings: { memoryEnabled: true, analyzeImportsWithAI: false },
    memories: [],
  } as unknown as AppState;
  const store = {
    snapshot: vi.fn(() => state),
    update: vi.fn(async (mutate: (current: AppState) => void) => {
      overrides.beforeUpdate?.();
      mutate(state);
      return state;
    }),
  } as unknown as Pick<LocalStore, 'snapshot' | 'update'>;
  const dependencies: ReceivedEmailRouteDependencies = {
    store,
    readResendConfig: vi.fn(async () => ({ apiKey: 'test-resend-key' })),
    configuredAI: vi.fn(async () => null),
    listEmails: vi.fn(async () => [emailSummary]),
    getEmail: vi.fn(async () => email),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use(createReceivedEmailRouter(dependencies));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a port.');
  return { url: `http://127.0.0.1:${address.port}`, dependencies, state };
}

describe('Resend received-email routes', () => {
  it('lists bounded metadata, marks known message IDs, and sanitizes provider failures', async () => {
    const { url, state, dependencies } = await startServer();
    state.memories.push({
      id: 'alex',
      name: 'Alex',
      sourceName: 'Resend received email',
      importedAt: email.createdAt,
      sourceText: `[[resend-email:${email.id}]]\nbody`,
      styleNotes: '',
      contextNotes: '',
      banterPreference: '',
      avoidTopics: '',
    });

    const response = await fetch(`${url}/api/email/received`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ ...emailSummary, imported: true }]);
    expect(dependencies.listEmails).toHaveBeenCalledWith('test-resend-key');

    const unavailable = await startServer({
      listEmails: vi.fn(async () => {
        throw new Error('Resend API failed with (401) and test-resend-key');
      }),
    });
    const rejected = await fetch(`${unavailable.url}/api/email/received`);
    expect(rejected.status).toBe(502);
    const body = await rejected.text();
    expect(body).toContain('Resend rejected the saved API key');
    expect(body).not.toContain('test-resend-key');
  });

  it('imports only sender-authored text locally and deduplicates by Resend message ID', async () => {
    const { url, state, dependencies } = await startServer();
    const first = await fetch(`${url}/api/email/received/${email.id}/import`, { method: 'POST' });
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ imported: true, duplicate: false });
    expect(dependencies.configuredAI).not.toHaveBeenCalled();
    expect(state.memories).toHaveLength(1);
    expect(state.memories[0]).toMatchObject({
      sourceName: 'Resend received email',
      sourceAuthorId: 'resend:alex@example.com',
      styleNotes: 'AI analysis is off. The email was saved locally; add or edit notes below.',
    });
    expect(state.memories[0]?.sourceText).toContain('This lineup is a mess.');
    expect(state.memories[0]?.sourceText).not.toContain('Last week was worse.');

    const duplicate = await fetch(`${url}/api/email/received/${email.id}/import`, {
      method: 'POST',
    });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ imported: false, duplicate: true });
    expect(state.memories).toHaveLength(1);
    expect(dependencies.getEmail).toHaveBeenCalledTimes(2);
  });

  it('requires memory to be enabled and keeps credential-store errors private', async () => {
    const disabled = await startServer();
    disabled.state.settings.memoryEnabled = false;
    const rejected = await fetch(`${disabled.url}/api/email/received/${email.id}/import`, {
      method: 'POST',
    });
    expect(rejected.status).toBe(409);
    expect(disabled.dependencies.getEmail).not.toHaveBeenCalled();

    const unavailable = await startServer({
      readResendConfig: vi.fn(async () => {
        throw new Error('secret keychain path and password');
      }),
    });
    const failure = await fetch(`${unavailable.url}/api/email/received`);
    expect(failure.status).toBe(503);
    const body = await failure.text();
    expect(body).toContain('credential store is unavailable');
    expect(body).not.toContain('password');
  });

  it('rechecks the memory setting after the provider returns an email body', async () => {
    const setup = await startServer();
    vi.mocked(setup.dependencies.store.snapshot)
      .mockImplementationOnce(() => setup.state)
      .mockImplementationOnce(() => {
        setup.state.settings.memoryEnabled = false;
        setup.state.settings.analyzeImportsWithAI = true;
        return setup.state;
      });

    const response = await fetch(`${setup.url}/api/email/received/${email.id}/import`, {
      method: 'POST',
    });
    expect(response.status).toBe(409);
    expect(setup.dependencies.configuredAI).not.toHaveBeenCalled();
    expect(setup.state.memories).toHaveLength(0);
  });

  it('shares message content with AI only after the explicit import-analysis opt-in', async () => {
    const provider: AIProvider = {
      id: 'test-ai',
      generate: vi.fn(async () => 'Writing style:\nDry.\nLeague context:\nLikes Seattle.'),
    };
    const setup = await startServer({ configuredAI: vi.fn(async () => provider) });
    setup.state.settings.analyzeImportsWithAI = true;

    const response = await fetch(`${setup.url}/api/email/received/${email.id}/import`, {
      method: 'POST',
    });
    expect(response.status).toBe(201);
    expect(provider.generate).toHaveBeenCalledOnce();
    expect(setup.state.memories[0]).toMatchObject({
      styleNotes: 'Dry.',
      contextNotes: 'Likes Seattle.',
    });
    const prompt = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(prompt?.prompt).toContain('This lineup is a mess.');
    expect(prompt?.prompt).not.toContain('Last week was worse.');
  });

  it('does not invoke AI when import-analysis consent is revoked during runtime setup', async () => {
    const provider: AIProvider = {
      id: 'test-ai',
      generate: vi.fn(async () => 'Writing style:\nPRIVATE\nLeague context:\nPRIVATE'),
    };
    const setup = await startServer({
      configuredAI: vi.fn(async () => {
        setup.state.settings.analyzeImportsWithAI = false;
        return provider;
      }),
    });
    setup.state.settings.analyzeImportsWithAI = true;

    const response = await fetch(`${setup.url}/api/email/received/${email.id}/import`, {
      method: 'POST',
    });

    expect(response.status).toBe(201);
    expect(provider.generate).not.toHaveBeenCalled();
    expect(setup.state.memories[0]?.styleNotes).toContain('opt-in changed');
  });

  it('discards in-flight AI notes when import-analysis consent is revoked', async () => {
    const setup = await startServer();
    setup.state.settings.analyzeImportsWithAI = true;
    const provider: AIProvider = {
      id: 'test-ai',
      generate: vi.fn(async () => {
        setup.state.settings.analyzeImportsWithAI = false;
        return 'Writing style:\nPRIVATE\nLeague context:\nPRIVATE';
      }),
    };
    (setup.dependencies.configuredAI as ReturnType<typeof vi.fn>).mockResolvedValue(provider);

    const response = await fetch(`${setup.url}/api/email/received/${email.id}/import`, {
      method: 'POST',
    });

    expect(response.status).toBe(201);
    expect(provider.generate).toHaveBeenCalledOnce();
    expect(setup.state.memories[0]?.styleNotes).toContain('opt-in changed');
    expect(setup.state.memories[0]?.styleNotes).not.toContain('PRIVATE');
    expect(setup.state.memories[0]?.contextNotes).toBe('');
  });

  it('preserves existing notes when consent is revoked before persistence', async () => {
    const setup = await startServer({
      beforeUpdate: () => {
        setup.state.settings.analyzeImportsWithAI = false;
      },
    });
    setup.state.settings.analyzeImportsWithAI = true;
    setup.state.memories.push({
      id: 'alex',
      name: 'Alex Manager',
      sourceName: 'Resend received email',
      sourceAuthorId: 'resend:alex@example.com',
      importedAt: email.createdAt,
      sourceText: 'Earlier local email notes.',
      styleNotes: 'Preserve this style.',
      contextNotes: 'Preserve this context.',
      banterPreference: '',
      avoidTopics: '',
    });
    const provider: AIProvider = {
      id: 'test-ai',
      generate: vi.fn(async () => 'Writing style:\nPRIVATE\nLeague context:\nPRIVATE'),
    };
    (setup.dependencies.configuredAI as ReturnType<typeof vi.fn>).mockResolvedValue(provider);

    const response = await fetch(`${setup.url}/api/email/received/${email.id}/import`, {
      method: 'POST',
    });

    expect(response.status).toBe(201);
    expect(setup.state.memories[0]).toMatchObject({
      styleNotes: 'Preserve this style.',
      contextNotes: 'Preserve this context.',
    });
    expect(setup.state.memories[0]?.sourceText).toContain('This lineup is a mess.');
  });
});
