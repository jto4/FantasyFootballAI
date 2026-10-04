import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppState, LocalStore } from './store.js';
import { createProjectionRouter } from './projection-routes.js';

describe('projection API routes', () => {
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

  async function startServer(state: AppState): Promise<string> {
    const store = {
      snapshot: () => state,
      update: async (mutator: (current: AppState) => void) => {
        mutator(state);
      },
    } as Pick<LocalStore, 'snapshot' | 'update'>;
    const app = express();
    app.use(express.json());
    app.use(createProjectionRouter({ store }));
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

  function makeState(): AppState {
    return {
      settings: { actions: [] },
      leagues: [{ id: 'league-1' }],
      reports: [],
      memories: [],
      playerProjections: [],
      scheduledRuns: [],
    } as unknown as AppState;
  }

  async function importProjection(baseUrl: string, sourceName = 'Owner CSV', points = 215) {
    return fetch(`${baseUrl}/api/projections/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        leagueId: 'league-1',
        sourceName,
        sourceUrl: 'https://example.test/projections.csv',
        scoringMatched: true,
        csv: `player,position,points\nTest Player,WR,${points}`,
      }),
    });
  }

  it('validates league, scoring confirmation, URL, and projection rows', async () => {
    const baseUrl = await startServer(makeState());
    const invalidLeague = await fetch(`${baseUrl}/api/projections/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leagueId: 'missing', sourceName: 'Owner CSV', scoringMatched: true }),
    });
    expect(invalidLeague.status).toBe(404);

    const invalidSource = await fetch(`${baseUrl}/api/projections/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        leagueId: 'league-1',
        sourceName: 'Owner CSV',
        sourceUrl: 'https://example.test/data?token=private',
        scoringMatched: true,
        csv: 'player,points\nTest Player,215',
      }),
    });
    expect(invalidSource.status).toBe(400);
    expect((await importProjection(baseUrl, 'Owner CSV', Number.NaN)).status).toBe(400);

    const noScoringConfirmation = await fetch(`${baseUrl}/api/projections/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        leagueId: 'league-1',
        sourceName: 'Owner CSV',
        csv: 'player,points\nTest Player,215',
      }),
    });
    expect(noScoringConfirmation.status).toBe(400);
  });

  it('replaces the same source while preserving its source ID and deletes by source or league', async () => {
    const baseUrl = await startServer(makeState());
    expect((await importProjection(baseUrl)).status).toBe(201);
    const first = (await (await fetch(`${baseUrl}/api/projections`)).json()) as Array<{
      sourceId: string;
      count: number;
    }>;
    expect(first).toHaveLength(1);
    expect(first[0]?.count).toBe(1);

    expect((await importProjection(baseUrl, 'owner csv', 230)).status).toBe(201);
    const replaced = (await (await fetch(`${baseUrl}/api/projections`)).json()) as Array<{
      sourceId: string;
      importedAt: string;
    }>;
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.sourceId).toBe(first[0]?.sourceId);

    expect(
      (
        await fetch(`${baseUrl}/api/projections/league-1/source/${replaced[0]?.sourceId}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(204);
    expect((await (await fetch(`${baseUrl}/api/projections`)).json()).length).toBe(0);

    await importProjection(baseUrl);
    expect((await fetch(`${baseUrl}/api/projections/league-1`, { method: 'DELETE' })).status).toBe(
      204,
    );
    expect((await (await fetch(`${baseUrl}/api/projections`)).json()).length).toBe(0);
  });

  it('caps each league at eight distinct projection sources', async () => {
    const baseUrl = await startServer(makeState());
    for (let index = 1; index <= 8; index += 1) {
      expect((await importProjection(baseUrl, `Owner CSV ${index}`)).status).toBe(201);
    }

    expect((await importProjection(baseUrl, 'Owner CSV ninth')).status).toBe(409);
    expect((await (await fetch(`${baseUrl}/api/projections`)).json()).length).toBe(8);
  });
});
