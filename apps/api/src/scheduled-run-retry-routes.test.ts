import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultActionSettings, type LeagueConnection } from '@sidekick/core';
import { LocalStore } from './store.js';
import { createScheduledRunRetryRouter } from './scheduled-run-retry-routes.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0)) await clean();
});

async function setup(fetchLeague: (league: LeagueConnection) => Promise<LeagueConnection>) {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-retry-routes-'));
  const store = new LocalStore(join(root, 'state.sqlite'));
  await store.load();
  const league: LeagueConnection = {
    id: 'league',
    platform: 'sleeper',
    name: 'League',
    displayName: 'League',
    teamCount: 2,
    teams: [],
    scoring: {},
    settings: { seasonStatus: 'in_season', currentWeek: 6, playoff_start_week: 14 },
    connectedAt: '2026-09-01T12:00:00Z',
  };
  const action = structuredClone(defaultActionSettings.find((a) => a.kind === 'power-rankings')!);
  action.leagueIds = [league.id];
  await store.update((state) => {
    state.leagues = [league];
    state.settings.actions = [action];
    state.scheduledRuns = [
      {
        id: 'failed-run',
        kind: action.kind,
        startedAt: '2026-10-01T09:00:00Z',
        finishedAt: '2026-10-01T09:01:00Z',
        status: 'failed',
        leagueResults: [
          { leagueId: league.id, displayName: league.displayName, status: 'failed', detail: 'x' },
        ],
      },
    ];
  });
  const generate = vi.fn(async () => ({
    report: {
      id: 'r',
      leagueId: league.id,
      kind: action.kind,
      title: 'Report',
      body: 'Report',
      citations: [],
      createdAt: new Date().toISOString(),
      status: 'draft' as const,
    },
  }));
  const app = express();
  app.use(createScheduledRunRetryRouter({ store, fetchLeague, generateAndSaveReport: generate }));
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port.');
  cleanups.push(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  return { store, league, generate, baseUrl: `http://127.0.0.1:${address.port}` };
}

it('retries failed leagues as a new run that only creates drafts', async () => {
  const { store, league, generate, baseUrl } = await setup(async (item) => item);
  const response = await fetch(`${baseUrl}/api/scheduled-runs/failed-run/retry`, {
    method: 'POST',
  });
  expect(response.status).toBe(201);
  const run = (await response.json()) as { retryOf: string; status: string };
  expect(run).toMatchObject({ retryOf: 'failed-run', status: 'succeeded' });
  expect(generate).toHaveBeenCalledTimes(1);
  expect((generate.mock.calls[0] as unknown as [LeagueConnection])[0].id).toBe(league.id);
  expect(store.snapshot().scheduledRuns).toHaveLength(2);
});

it('records a failed league without generating when the provider read fails', async () => {
  const { generate, baseUrl } = await setup(async () => {
    throw new Error('provider down');
  });
  const response = await fetch(`${baseUrl}/api/scheduled-runs/failed-run/retry`, {
    method: 'POST',
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ status: 'failed' });
  expect(generate).not.toHaveBeenCalled();
});

it('rejects unknown runs and runs without failures', async () => {
  const { store, baseUrl } = await setup(async (item) => item);
  expect(
    (await fetch(`${baseUrl}/api/scheduled-runs/missing/retry`, { method: 'POST' })).status,
  ).toBe(404);
  await store.update((state) => {
    state.scheduledRuns[0]!.status = 'succeeded';
  });
  expect(
    (await fetch(`${baseUrl}/api/scheduled-runs/failed-run/retry`, { method: 'POST' })).status,
  ).toBe(409);
});
