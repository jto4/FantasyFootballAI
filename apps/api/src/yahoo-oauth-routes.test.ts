import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createYahooOAuthRouter, type YahooOAuthRouteDependencies } from './yahoo-oauth-routes.js';

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

async function startServer(overrides: Partial<YahooOAuthRouteDependencies> = {}) {
  const credentials = new Map<string, string>([
    [
      'yahoo-oauth-client',
      JSON.stringify({ clientId: 'client-id', clientSecret: 'client-secret' }),
    ],
    ['yahoo', 'legacy-access-token'],
  ]);
  const dependencies: YahooOAuthRouteDependencies = {
    readCredential: vi.fn(async (provider) => credentials.get(provider) ?? null),
    saveCredential: vi.fn(async (provider, value) => {
      credentials.set(provider, value);
    }),
    removeCredential: vi.fn(async (provider) => {
      credentials.delete(provider);
    }),
    createOAuthClient: vi.fn(() => ({
      authorizationUrl: (state: string) => `https://yahoo.example/authorize?state=${state}`,
      exchangeCode: vi.fn(async () => ({
        accessToken: 'private-access-token',
        refreshToken: 'private-refresh-token',
        expiresInSeconds: 3600,
      })),
    })),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use(createYahooOAuthRouter(dependencies));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a port.');
  return { url: `http://127.0.0.1:${address.port}`, dependencies };
}

describe('Yahoo OAuth routes', () => {
  it('reports configured credentials and a valid legacy access token without exposing secrets', async () => {
    const { url } = await startServer();
    const response = await fetch(`${url}/api/yahoo/oauth/status`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      clientConfigured: true,
      authorized: true,
      requiresReconnect: false,
      redirectUri: 'oob',
    });
    expect(JSON.stringify(body)).not.toContain('client-secret');
    expect(JSON.stringify(body)).not.toContain('legacy-access-token');
  });

  it('validates and trims Yahoo app credentials before saving them', async () => {
    const { url, dependencies } = await startServer();
    const invalid = await fetch(`${url}/api/yahoo/oauth/client`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'bad\nid', clientSecret: 'secret' }),
    });
    expect(invalid.status).toBe(400);

    const saved = await fetch(`${url}/api/yahoo/oauth/client`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: ' client ', clientSecret: ' secret ' }),
    });
    expect(saved.status).toBe(204);
    expect(dependencies.saveCredential).toHaveBeenCalledWith(
      'yahoo-oauth-client',
      JSON.stringify({ clientId: 'client', clientSecret: 'secret' }),
    );
  });

  it('exchanges a one-time state-bound code and saves only the returned tokens', async () => {
    const { url, dependencies } = await startServer();
    const start = await fetch(`${url}/api/yahoo/oauth/start`);
    const started = await start.json();

    expect(start.status).toBe(200);
    expect(started.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(started.authorizationUrl).toContain(encodeURIComponent(started.state));

    const complete = await fetch(`${url}/api/yahoo/oauth/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: started.state, code: 'auth-code' }),
    });
    expect(complete.status).toBe(200);
    expect(await complete.json()).toEqual({ authorized: true });

    const saved = vi
      .mocked(dependencies.saveCredential)
      .mock.calls.find(([provider]) => provider === 'yahoo');
    expect(saved?.[0]).toBe('yahoo');
    const token = JSON.parse(saved?.[1] ?? '{}') as Record<string, unknown>;
    expect(token).toMatchObject({
      accessToken: 'private-access-token',
      refreshToken: 'private-refresh-token',
    });
    expect(typeof token.expiresAt).toBe('number');

    const replay = await fetch(`${url}/api/yahoo/oauth/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: started.state, code: 'auth-code' }),
    });
    expect(replay.status).toBe(400);
  });

  it('does not exchange mismatched or missing authorization state', async () => {
    const { url, dependencies } = await startServer();
    await fetch(`${url}/api/yahoo/oauth/start`);
    const response = await fetch(`${url}/api/yahoo/oauth/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'attacker-state', code: 'auth-code' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('expired') });
    expect(dependencies.createOAuthClient).toHaveBeenCalledTimes(1);
  });

  it('reports credential-store outages without returning backend details', async () => {
    const { url } = await startServer({
      readCredential: vi.fn(async () => {
        throw new Error('/private/keychain/secret-path');
      }),
    });
    const statusResponse = await fetch(`${url}/api/yahoo/oauth/status`);
    const statusBody = await statusResponse.json();
    expect(statusResponse.status).toBe(503);
    expect(JSON.stringify(statusBody)).not.toContain('/private/keychain/secret-path');

    const response = await fetch(`${url}/api/yahoo/oauth/start`);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain('/private/keychain/secret-path');
  });
});
