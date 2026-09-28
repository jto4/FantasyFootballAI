import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeagueConnection, Platform } from '@sidekick/core';
import type { AppState, LocalStore } from './store.js';
import { createLeagueRouter } from './league-routes.js';

describe('league API routes', () => {
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

  async function startServer(
    state: AppState,
    fetchLeague: (
      platform: Platform,
      leagueId: string,
      season?: number,
    ) => Promise<LeagueConnection> = async (_platform, leagueId) => league(leagueId),
    reconcileCalendar = vi.fn(),
  ) {
    const store = {
      snapshot: () => state,
      update: async (mutator: (current: AppState) => void) => {
        mutator(state);
      },
    } as Pick<LocalStore, 'snapshot' | 'update'>;
    const app = express();
    app.use(express.json());
    app.use(
      createLeagueRouter({
        store,
        fetchLeague,
        syncErrorMessage: () => 'Provider authorization failed. Check the league connection.',
        reconcileCalendar,
      }),
    );
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

  function league(id: string, overrides: Partial<LeagueConnection> = {}): LeagueConnection {
    return {
      id,
      platform: 'sleeper',
      name: 'Test league',
      displayName: 'Test league',
      teamCount: 1,
      scoring: {},
      settings: {},
      teams: [],
      connectedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  function stateWithLeague(): AppState {
    return {
      settings: { actions: [], chatRepliesEnabled: true, chatRepliesAutoSend: true },
      leagues: [league('league-a', { displayName: 'Owner league' })],
      reports: [],
      memories: [],
      playerProjections: [{ id: 'projection-a', leagueId: 'league-a' }],
      scheduledRuns: [],
    } as unknown as AppState;
  }

  it('validates platform input and persists only a successfully fetched league', async () => {
    const state = stateWithLeague();
    const fetchLeague = vi.fn(async (_platform: Platform, id: string) => league(id));
    const baseUrl = await startServer(state, fetchLeague);

    expect((await fetch(`${baseUrl}/api/leagues`, { method: 'POST', body: '{}' })).status).toBe(
      400,
    );
    const invalidSeason = await fetch(`${baseUrl}/api/leagues`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform: 'espn', leagueId: 'league-b', season: 1999 }),
    });
    expect(invalidSeason.status).toBe(400);
    expect(fetchLeague).not.toHaveBeenCalled();

    const connected = await fetch(`${baseUrl}/api/leagues`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform: 'sleeper', leagueId: ' league-b ', name: 'New league' }),
    });
    expect(connected.status).toBe(201);
    expect(await connected.json()).toMatchObject({ id: 'league-b', displayName: 'New league' });
    expect(state.leagues.map(({ id }) => id)).toEqual(['league-a', 'league-b']);
  });

  it('keeps known league details on refresh failure and replaces them after recovery', async () => {
    const state = stateWithLeague();
    const fetchLeague = vi
      .fn<(platform: Platform, leagueId: string, season?: number) => Promise<LeagueConnection>>()
      .mockRejectedValueOnce(new Error('sensitive provider response'))
      .mockResolvedValueOnce(league('league-a', { name: 'Updated league' }));
    const baseUrl = await startServer(state, fetchLeague);

    const failed = await fetch(`${baseUrl}/api/leagues/league-a/refresh`, { method: 'POST' });
    expect(failed.status).toBe(502);
    expect(state.leagues[0]).toMatchObject({
      displayName: 'Owner league',
      lastSyncError: 'Provider authorization failed. Check the league connection.',
    });
    expect(JSON.stringify(state)).not.toContain('sensitive provider response');

    const recovered = await fetch(`${baseUrl}/api/leagues/league-a/refresh`, { method: 'POST' });
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({
      name: 'Updated league',
      displayName: 'Owner league',
      connectedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(state.leagues[0]).not.toHaveProperty('lastSyncError');
  });

  it('removes league-owned data and reconciles calendar events on disconnect', async () => {
    const state = stateWithLeague();
    state.settings.chatReplyLeagueId = 'league-a';
    state.settings.calendarEvents = [
      { id: 'event-a', leagueId: 'league-a' },
      { id: 'event-b', leagueId: 'league-b' },
    ] as NonNullable<AppState['settings']['calendarEvents']>;
    const reconcileCalendar = vi.fn();
    const baseUrl = await startServer(state, undefined, reconcileCalendar);

    expect((await fetch(`${baseUrl}/api/leagues/league-a`, { method: 'DELETE' })).status).toBe(204);
    expect(state.leagues).toHaveLength(0);
    expect(state.playerProjections).toHaveLength(0);
    expect(state.settings.calendarEvents).toEqual([{ id: 'event-b', leagueId: 'league-b' }]);
    expect(state.settings.chatReplyLeagueId).toBeUndefined();
    expect(state.settings.chatRepliesEnabled).toBe(false);
    expect(state.settings.chatRepliesAutoSend).toBe(false);
    expect(reconcileCalendar).toHaveBeenCalledWith(state.settings.calendarEvents);
  });
});
