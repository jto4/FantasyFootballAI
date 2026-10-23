import express from 'express';
import { expect, it } from 'vitest';
import { createLeagueRouter } from './league-routes.js';
import { LocalStore } from './store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const raw = {
  id: 123,
  seasonId: 2026,
  members: [{ email: 'discard@example.test', notification: 'discard' }],
  settings: {
    name: 'Private league',
    scoringSettings: { scoringItems: [{ statId: 53, points: 0.5 }] },
  },
  status: { currentMatchupPeriod: 6 },
  teams: [
    {
      id: 1,
      name: 'Owner team',
      roster: {
        entries: [
          {
            playerId: 10,
            lineupSlotId: 0,
            playerPoolEntry: {
              player: {
                id: 10,
                fullName: 'Example Quarterback',
                defaultPositionId: 1,
                injuryStatus: 'ACTIVE',
                stats: [
                  {
                    seasonId: 2026,
                    scoringPeriodId: 6,
                    statSourceId: 1,
                    statSplitTypeId: 1,
                    stats: { 53: 4 },
                    appliedStats: { 53: 2 },
                    appliedTotal: 2,
                  },
                ],
              },
            },
          },
        ],
      },
    },
  ],
  schedule: [],
};
it('imports validated browser data, discards unrelated account fields, persists snapshot provenance and refuses false refresh', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sidekick-espn-import-'));
  const store = new LocalStore(join(dir, 'state.sqlite'), join(dir, 'missing.json'));
  await store.load();
  let calls = 0;
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(
    createLeagueRouter({
      store,
      fetchLeague: async () => {
        calls++;
        throw Error('not authorized');
      },
      syncErrorMessage: () => '',
      reconcileCalendar: () => {},
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('port');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const send = (value: unknown, id = '123') =>
      fetch(`${base}/api/leagues/import/espn?league=${id}&season=2026`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: JSON.stringify(value),
      });
    expect((await send(raw, '124')).status).toBe(400);
    expect(store.snapshot().leagues).toEqual([]);
    const response = await send(raw);
    expect(response.status).toBe(201);
    const league = await response.json();
    expect(league.connectionMode).toBe('snapshot');
    expect(league.snapshotImportedAt).toBeTruthy();
    expect(league.lastSyncedAt).toBeUndefined();
    expect(league.teams[0].roster).toHaveLength(1);
    expect(JSON.stringify(league)).not.toContain('discard');
    expect((await fetch(`${base}/api/leagues/123/refresh`, { method: 'POST' })).status).toBe(409);
    expect(calls).toBe(0);
    await store.close();
    await store.load();
    expect(store.snapshot().leagues[0]?.connectionMode).toBe('snapshot');
    // The app makes its own projections; ESPN's in the snapshot are not saved.
    expect(store.snapshot().playerProjections).toHaveLength(0);
    expect((await send({ ...raw, teams: [raw.teams[0], raw.teams[0]] })).status).toBe(400);
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
