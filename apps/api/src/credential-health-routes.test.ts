import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeagueConnection } from '@sidekick/core';
import {
  createCredentialHealthRouter,
  type CredentialHealthRouteDependencies,
} from './credential-health-routes.js';

const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];
const league = {
  id: 'league-123',
  platform: 'espn',
  name: 'Test ESPN',
  displayName: 'Commissioner League',
  season: 2026,
} as LeagueConnection;

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

async function startServer(overrides: Partial<CredentialHealthRouteDependencies> = {}) {
  const dependencies: CredentialHealthRouteDependencies = {
    readEspnCredential: vi.fn(async () => 'owner-cookie-secret'),
    connectedEspnLeague: vi.fn(() => league),
    verifyEspnLeagueAccess: vi.fn(async () => undefined),
    ...overrides,
  };
  const app = express();
  app.use(createCredentialHealthRouter(dependencies));
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

describe('ESPN credential health route', () => {
  it('verifies access through a connected league without exposing the session cookie', async () => {
    const { url, dependencies } = await startServer();
    const response = await fetch(`${url}/api/credentials/espn/test`, { method: 'POST' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      connected: true,
      league: 'Commissioner League',
      season: 2026,
    });
    expect(dependencies.verifyEspnLeagueAccess).toHaveBeenCalledWith(league, 'owner-cookie-secret');
    expect(JSON.stringify(body)).not.toContain('owner-cookie-secret');
  });

  it('asks for a stored cookie or connected ESPN league before making a provider request', async () => {
    const noCookie = await startServer({ readEspnCredential: vi.fn(async () => null) });
    const missingCookie = await fetch(`${noCookie.url}/api/credentials/espn/test`, {
      method: 'POST',
    });
    expect(missingCookie.status).toBe(409);
    expect(await missingCookie.json()).toMatchObject({
      error: expect.stringContaining('Save an ESPN'),
    });
    expect(noCookie.dependencies.verifyEspnLeagueAccess).not.toHaveBeenCalled();

    const noLeague = await startServer({ connectedEspnLeague: vi.fn(() => undefined) });
    const missingLeague = await fetch(`${noLeague.url}/api/credentials/espn/test`, {
      method: 'POST',
    });
    expect(missingLeague.status).toBe(409);
    expect(await missingLeague.json()).toMatchObject({
      error: expect.stringContaining('Connect an ESPN'),
    });
    expect(noLeague.dependencies.verifyEspnLeagueAccess).not.toHaveBeenCalled();
  });

  it('returns sanitized platform guidance and handles credential-store outages', async () => {
    const denied = await startServer({
      verifyEspnLeagueAccess: vi.fn(async () => {
        throw new Error('401 Unauthorized owner-cookie-secret');
      }),
    });
    const rejected = await fetch(`${denied.url}/api/credentials/espn/test`, { method: 'POST' });
    const rejection = await rejected.json();
    expect(rejected.status).toBe(401);
    expect(rejection.error).toContain('Platform access expired or was rejected');
    expect(JSON.stringify(rejection)).not.toContain('owner-cookie-secret');

    const forbidden = await startServer({
      verifyEspnLeagueAccess: vi.fn(async () => {
        throw new Error('403 access denied owner-cookie-secret');
      }),
    });
    const noMembership = await fetch(`${forbidden.url}/api/credentials/espn/test`, {
      method: 'POST',
    });
    expect(noMembership.status).toBe(403);
    const permissionError = await noMembership.json();
    expect(permissionError.error).toContain('cannot access this league');
    expect(JSON.stringify(permissionError)).not.toContain('owner-cookie-secret');

    const unavailable = await startServer({
      readEspnCredential: vi.fn(async () => {
        throw new Error('native keychain path owner-cookie-secret');
      }),
    });
    const storeFailure = await fetch(`${unavailable.url}/api/credentials/espn/test`, {
      method: 'POST',
    });
    expect(storeFailure.status).toBe(503);
    expect(JSON.stringify(await storeFailure.json())).not.toContain('owner-cookie-secret');
  });
});
