import express from 'express';
import type { AppState, DashboardStateSnapshot } from './store.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStateRouter } from './state-routes.js';

describe('state API routes', () => {
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
    dashboardSnapshot?: () => DashboardStateSnapshot,
  ): Promise<{ baseUrl: string; snapshot: ReturnType<typeof vi.fn> }> {
    const app = express();
    const snapshot = vi.fn(() => state);
    app.use(
      createStateRouter({
        snapshot,
        ...(dashboardSnapshot ? { dashboardSnapshot } : {}),
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
    return { baseUrl: `http://127.0.0.1:${address.port}`, snapshot };
  }

  function makeState(): AppState {
    return {
      settings: { actions: [] },
      leagues: [],
      reports: [],
      memories: [
        {
          id: 'member-1',
          memberName: 'League Manager',
          styleNotes: 'Short, dry jokes',
          contextNotes: '',
          sourceName: 'Conversation export',
          importedAt: '2026-09-01T00:00:00.000Z',
          sourceText: 'Private imported message',
          sourceAuthorId: 'author-1',
          includeInAIContext: false,
        },
      ],
      playerProjections: [],
      scheduledRuns: [],
    } as unknown as AppState;
  }

  it('omits projection rows and imported source text from dashboard state', async () => {
    const state = makeState();
    state.playerProjections = [
      {
        id: 'projection-1',
        leagueId: 'league-1',
        sourceName: 'Private import',
        sourceUrl: 'https://example.test/projections.csv',
        playerName: 'Test Player',
        position: 'QB',
        nflTeam: 'TST',
        week: 1,
        projectedPoints: 10,
        scoringMatched: true,
        importedAt: '2026-09-01T00:00:00.000Z',
      },
    ];
    const dashboardSnapshot = vi.fn(
      () =>
        ({
          settings: state.settings,
          leagues: state.leagues,
          reports: state.reports,
          scheduledRuns: state.scheduledRuns,
          memories: state.memories.map(({ sourceText, sourceAuthorId, ...profile }) => ({
            ...profile,
            sourceLength: sourceText.length,
            canMergeImportedConversation: !sourceAuthorId,
          })),
        }) as DashboardStateSnapshot,
    );
    const { baseUrl, snapshot } = await startServer(state, dashboardSnapshot);

    const response = await fetch(`${baseUrl}/api/state`);
    const payload = (await response.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(payload);
    const memories = payload.memories as Array<Record<string, unknown>>;

    expect(payload).not.toHaveProperty('playerProjections');
    expect(serialized).not.toContain('Private imported message');
    expect(serialized).not.toContain('author-1');
    expect(memories[0]).toMatchObject({ canMergeImportedConversation: false, sourceLength: 24 });
    expect(dashboardSnapshot).toHaveBeenCalledOnce();
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('validates report list limits and gives bounded league summaries', async () => {
    const { baseUrl } = await startServer(makeState());

    expect((await fetch(`${baseUrl}/api/reports?limit=0`)).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/reports?limit=51`)).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/reports?limit=5`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/leagues/missing`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/scheduled-runs`)).status).toBe(200);
  });
});
