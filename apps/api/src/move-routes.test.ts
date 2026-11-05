import express from 'express';
import type { LeagueConnection, MoveProposal } from '@sidekick/core';
import type { EspnSubmitOutcome } from '@sidekick/integrations';
import { afterEach, describe, expect, it } from 'vitest';
import { createMoveRouter } from './move-routes.js';
import { MoveStore } from './move-store.js';
import type { WeeklyBriefing } from './weekly-service.js';

const roster = () => [
  { id: '1', name: 'Bench QB', position: 'QB', rosterPosition: 'BENCH' },
  { id: '2', name: 'Start QB', position: 'QB', rosterPosition: 'QB' },
];
const league = (fields: Partial<LeagueConnection> = {}) =>
  ({
    id: '599',
    platform: 'espn',
    name: 'L',
    displayName: 'L',
    season: 2026,
    settings: { roster_positions: ['QB', 'BENCH'], currentWeek: 9 },
    teams: [
      { id: '10', name: 'Mine', roster: roster() },
      {
        id: '11',
        name: 'Theirs',
        roster: [{ id: '3', name: 'Their WR', position: 'WR', rosterPosition: 'BENCH' }],
      },
    ],
    ...fields,
  }) as LeagueConnection;

type MoveReply = MoveProposal & {
  directIssue?: string;
  needsBrowser?: boolean;
  move: MoveProposal;
  leagueId: string;
  request: { items: unknown[] };
};
const servers: ReturnType<ReturnType<typeof express>['listen']>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function start(options: {
  state?: { leagues: LeagueConnection[] };
  session?: string | null;
  owns?: boolean;
  outcome?: EspnSubmitOutcome;
  onSubmit?: (state: { leagues: LeagueConnection[] }) => void;
  onRefresh?: (state: { leagues: LeagueConnection[] }) => void;
  now?: () => number;
}) {
  const state = options.state ?? { leagues: [league()] };
  const moves = new MoveStore(':memory:');
  const sent: unknown[] = [];
  const app = express();
  app.use(express.json());
  app.use(
    createMoveRouter({
      store: { snapshot: () => state } as never,
      moves,
      briefing: async () =>
        ({
          week: 9,
          lineup: {
            changes: [
              {
                slot: 'QB',
                start: { id: '1', name: 'Bench QB', points: 20 },
                bench: { id: '2', name: 'Start QB', points: 15 },
              },
            ],
          },
        }) as WeeklyBriefing,
      readEspnSession: async () =>
        options.session === undefined ? 'espn_s2=x; SWID={A}' : options.session,
      refreshLeague: async () => options.onRefresh?.(state),
      espn: () => ({
        ownsTeam: async () => options.owns ?? true,
        submit: async (_league, _season, request) => {
          sent.push(request);
          options.onSubmit?.(state);
          return options.outcome ?? { outcome: 'sent' };
        },
      }),
      ...(options.now ? { now: options.now } : {}),
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as { port: number };
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    return { status: response.status, body: (await response.json()) as MoveReply };
  };
  const list = async () =>
    (await (await fetch(`http://127.0.0.1:${port}/api/moves?league=599&team=10`)).json()) as {
      moves: { status: string }[];
    };
  const propose = async () => {
    const created = await call('/api/moves', { league: '599', team: '10', kind: 'lineup' });
    expect(created.status).toBe(201);
    return created.body;
  };
  return { call, list, moves, propose, sent, state };
}

const applied = (state: { leagues: LeagueConnection[] }) => {
  state.leagues[0]!.teams[0]!.roster = [
    { id: '1', name: 'Bench QB', position: 'QB', rosterPosition: 'QB' },
    { id: '2', name: 'Start QB', position: 'QB', rosterPosition: 'BENCH' },
  ];
};

describe('roster move approval', () => {
  it('sends nothing until submitting is on and the exact move is approved', async () => {
    const app = await start({ onSubmit: applied });
    const move = await app.propose();
    expect(move).toMatchObject({ status: 'proposed', gain: 5 });
    expect(move.steps).toEqual(['Start Bench QB at QB', 'Bench Start QB (now QB)']);

    const off = await app.call(`/api/moves/${move.id}/approve`, { fingerprint: move.fingerprint });
    expect(off.status).toBe(409);
    app.moves.setDirectSubmit('599', true);
    const wrong = await app.call(`/api/moves/${move.id}/approve`, { fingerprint: 'other' });
    expect(wrong.status).toBe(409);
    expect(app.sent).toHaveLength(0);

    const done = await app.call(`/api/moves/${move.id}/approve`, { fingerprint: move.fingerprint });
    expect(done.body).toMatchObject({ status: 'confirmed', method: 'direct' });
    expect(app.sent).toHaveLength(1);

    const again = await app.call(`/api/moves/${move.id}/approve`, {
      fingerprint: move.fingerprint,
    });
    expect(again.status).toBe(409);
    expect(app.sent).toHaveLength(1);
  });

  it('does not call it done when the league doesn’t show the change', async () => {
    const app = await start({});
    app.moves.setDirectSubmit('599', true);
    const move = await app.propose();
    const result = await app.call(`/api/moves/${move.id}/approve`, {
      fingerprint: move.fingerprint,
    });
    expect(result.body.status).toBe('unconfirmed');
  });

  it('keeps an unknown result from being sent again', async () => {
    const app = await start({ outcome: { outcome: 'uncertain' } });
    app.moves.setDirectSubmit('599', true);
    const move = await app.propose();
    const approval = { fingerprint: move.fingerprint };
    expect((await app.call(`/api/moves/${move.id}/approve`, approval)).body.status).toBe(
      'unconfirmed',
    );
    expect((await app.call(`/api/moves/${move.id}/approve`, approval)).status).toBe(409);
    expect(app.sent).toHaveLength(1);
  });

  it('reports a refusal as not made', async () => {
    const app = await start({ outcome: { outcome: 'rejected', reason: 'Player is locked' } });
    app.moves.setDirectSubmit('599', true);
    const move = await app.propose();
    const result = await app.call(`/api/moves/${move.id}/approve`, {
      fingerprint: move.fingerprint,
    });
    expect(result.body).toMatchObject({ status: 'failed', message: 'Player is locked' });
  });

  it('ends the approval if the roster changed since the review', async () => {
    const app = await start({
      onRefresh: (state) => {
        state.leagues[0]!.teams[0]!.roster![0]!.rosterPosition = 'IR';
      },
    });
    app.moves.setDirectSubmit('599', true);
    const move = await app.propose();
    const result = await app.call(`/api/moves/${move.id}/approve`, {
      fingerprint: move.fingerprint,
    });
    expect(result.status).toBe(409);
    expect(result.body.move.status).toBe('expired');
    expect(app.sent).toHaveLength(0);
  });

  it('refuses a login that doesn’t own the team', async () => {
    const app = await start({ owns: false });
    app.moves.setDirectSubmit('599', true);
    const move = await app.propose();
    const result = await app.call(`/api/moves/${move.id}/approve`, {
      fingerprint: move.fingerprint,
    });
    expect(result.status).toBe(409);
    expect(app.sent).toHaveLength(0);
  });

  it('expires an approval that sat too long', async () => {
    let time = Date.parse('2026-11-04T12:00:00Z');
    const app = await start({ now: () => time });
    app.moves.setDirectSubmit('599', true);
    const move = await app.propose();
    time += 31 * 60_000;
    const result = await app.call(`/api/moves/${move.id}/approve`, {
      fingerprint: move.fingerprint,
    });
    expect(result.status).toBe(409);
    expect(app.sent).toHaveLength(0);
  });

  it('falls back to the signed-in window without a saved login', async () => {
    const app = await start({ session: null });
    app.moves.setDirectSubmit('599', true);
    const move = await app.propose();
    const approval = { fingerprint: move.fingerprint };
    const direct = await app.call(`/api/moves/${move.id}/approve`, approval);
    expect(direct.body.needsBrowser).toBe(true);

    const started = await app.call(`/api/moves/${move.id}/browser/start`, approval);
    expect(started.body).toMatchObject({ leagueId: '599', season: 2026, teamId: '10' });
    expect(started.body.request.items).toHaveLength(2);
    expect((await app.call(`/api/moves/${move.id}/browser/start`, approval)).status).toBe(409);

    applied(app.state);
    const finished = await app.call(`/api/moves/${move.id}/browser/finish`, { outcome: 'sent' });
    expect(finished.body).toMatchObject({ status: 'confirmed', method: 'browser' });
  });

  it('offers a move again when the window turns out to be signed out', async () => {
    const app = await start({ session: null });
    app.moves.setDirectSubmit('599', true);
    const move = await app.propose();
    await app.call(`/api/moves/${move.id}/browser/start`, { fingerprint: move.fingerprint });
    const result = await app.call(`/api/moves/${move.id}/browser/finish`, {
      outcome: 'signed-out',
    });
    expect(result.body.status).toBe('proposed');
  });

  it('never submits other platforms or kinds', async () => {
    const app = await start({
      state: { leagues: [league({ platform: 'sleeper' })] },
    });
    app.moves.setDirectSubmit('599', true);
    const move = await app.propose();
    expect(move.directIssue).toBeTruthy();
    const result = await app.call(`/api/moves/${move.id}/approve`, {
      fingerprint: move.fingerprint,
    });
    expect(result.status).toBe(409);
    expect(app.sent).toHaveLength(0);
  });

  it('won’t submit when the league data is on another week', async () => {
    const stale = league();
    stale.settings.currentWeek = 8;
    const app = await start({ state: { leagues: [stale] } });
    expect((await app.propose()).directIssue).toContain('different week');
  });
});

describe('moves the owner makes', () => {
  it('confirms a guided pickup once the league shows it', async () => {
    const app = await start({});
    const created = await app.call('/api/moves', {
      league: '599',
      team: '10',
      kind: 'add-drop',
      addId: '9',
      addName: 'Free Agent',
      dropId: '2',
      gain: 3.5,
    });
    expect(created.body).toMatchObject({ title: 'Add Free Agent, drop Start QB' });
    expect(created.body.directIssue).toBeTruthy();
    const waiting = await app.call(`/api/moves/${created.body.id}/guided`);
    expect(waiting.body.status).toBe('waiting');

    app.state.leagues[0]!.teams[0]!.roster = [
      { id: '1', name: 'Bench QB', position: 'QB', rosterPosition: 'QB' },
      { id: '9', name: 'Free Agent', position: 'WR', rosterPosition: 'BENCH' },
    ];
    const settled = app.moves.list('599', '10')[0]!;
    expect(settled.status).toBe('waiting');
    const read = await app.list();
    expect(read.moves[0]?.status).toBe('confirmed');
  });

  it('checks pickups and trades against real rosters', async () => {
    const app = await start({});
    const post = (body: object) => app.call('/api/moves', { league: '599', team: '10', ...body });
    expect((await post({ kind: 'add-drop', addId: '3', addName: 'Their WR' })).status).toBe(409);
    expect((await post({ kind: 'add-drop', addId: '9', addName: 'X', dropId: '3' })).status).toBe(
      409,
    );
    expect(
      (await post({ kind: 'trade', tradeTeamId: '11', giveId: '3', receiveId: '3' })).status,
    ).toBe(409);
    const trade = await post({ kind: 'trade', tradeTeamId: '11', giveId: '2', receiveId: '3' });
    expect(trade.body.title).toBe('Offer Start QB for Their WR');
  });

  it('reuses an identical open proposal and can cancel it', async () => {
    const app = await start({});
    const first = await app.propose();
    const second = await app.propose();
    expect(second.id).toBe(first.id);
    const cancelled = await app.call(`/api/moves/${first.id}/cancel`);
    expect(cancelled.body.status).toBe('cancelled');
  });
});

describe('MoveStore', () => {
  it('lets only one caller claim a move', async () => {
    const app = await start({});
    const move = await app.propose();
    expect(app.moves.claim(move.id, 'proposed', { ...move, status: 'submitting' } as never)).toBe(
      true,
    );
    expect(app.moves.claim(move.id, 'proposed', { ...move, status: 'submitting' } as never)).toBe(
      false,
    );
  });

  it('never restores a backup’s proposal as approvable', async () => {
    const app = await start({});
    const move = await app.propose();
    const target = new MoveStore(':memory:');
    target.merge(app.moves.all());
    expect(target.get(move.id)?.status).toBe('expired');
    expect(target.directSubmit('599')).toBe(false);
  });
});
