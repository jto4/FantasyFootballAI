import express from 'express';
import type { MemberMemory } from '@sidekick/core';
import type { AppState } from './store.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemberMemoryRouter } from './member-memory-routes.js';

describe('member memory API routes', () => {
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

  async function startServer() {
    const profile: MemberMemory = {
      id: 'profile-1',
      name: 'League manager',
      sourceName: 'Group export',
      importedAt: '2026-09-01T00:00:00.000Z',
      sourceText: 'Private source messages',
      sourceAuthorId: 'private-author-key',
      styleNotes: 'Brief and dry',
      contextNotes: 'Drafted a kicker early',
      leagueIds: ['league-1'],
    };
    const state = {
      settings: { imessageSyncCursor: 'cursor-before-delete' },
      leagues: [],
      reports: [],
      memories: [profile],
      playerProjections: [],
      scheduledRuns: [],
    } as unknown as AppState;
    const store = {
      snapshot: () => structuredClone(state),
      update: async (mutate: (current: AppState) => void) => mutate(state),
    };
    const app = express();
    app.use(express.json());
    app.use(createMemberMemoryRouter({ store }));
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not bind a port.');
    return { baseUrl: `http://127.0.0.1:${address.port}`, state };
  }

  it('updates owner preferences while withholding source text and author identifiers', async () => {
    const { baseUrl, state } = await startServer();
    const response = await fetch(`${baseUrl}/api/memory/profile-1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '  Manager  ',
        styleNotes: 'One line',
        contextNotes: 'Won last year',
        banterPreference: 'Keep it playful',
        avoidTopics: 'Work',
        includeInReports: false,
        leagueIds: ['league-2'],
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: 'profile-1',
      name: 'Manager',
      banterPreference: 'Keep it playful',
      avoidTopics: 'Work',
      includeInReports: false,
      leagueIds: ['league-2'],
    });
    expect(body).not.toHaveProperty('sourceText');
    expect(body).not.toHaveProperty('sourceAuthorId');
    expect(state.memories[0]?.sourceText).toBe('Private source messages');
  });

  it('rejects malformed profile fields and invalid league scopes without changing state', async () => {
    const { baseUrl, state } = await startServer();
    const before = structuredClone(state.memories);
    const response = await fetch(`${baseUrl}/api/memory/profile-1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Manager',
        styleNotes: '',
        contextNotes: '',
        leagueIds: ['league-1', 'league-1'],
      }),
    });
    expect(response.status).toBe(400);
    expect(state.memories).toEqual(before);

    const missing = await fetch(`${baseUrl}/api/memory/profile-1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);
  });

  it('exports owner-managed source data without private author keys and deletes all profiles with cursor reset', async () => {
    const { baseUrl, state } = await startServer();
    const exported = await fetch(`${baseUrl}/api/memory/export`);
    expect(exported.headers.get('content-disposition')).toContain('sunday-sidekick-memory.json');
    const exportedProfiles = await exported.json();
    expect(exportedProfiles).toEqual([
      expect.objectContaining({ sourceText: 'Private source messages' }),
    ]);
    expect(exportedProfiles[0]).not.toHaveProperty('sourceAuthorId');
    const source = await fetch(`${baseUrl}/api/memory/profile-1/source`);
    expect(await source.text()).toBe('Private source messages');

    const deleted = await fetch(`${baseUrl}/api/memory`, { method: 'DELETE' });
    expect(deleted.status).toBe(204);
    expect(state.memories).toEqual([]);
    expect(state.settings).not.toHaveProperty('imessageSyncCursor');
  });
});
