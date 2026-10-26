import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import type {
  FootballDataSnapshot,
  LeagueConnection,
  PlayerBio,
  RosterPlayer,
} from '@sidekick/core';
import { createDynastyRouter } from './dynasty-routes.js';
import type { LocalStore } from './store.js';

const servers: (() => void)[] = [];
afterEach(() => servers.splice(0).forEach((close) => close()));

const zero = {
  passing_yards: 0,
  passing_tds: 0,
  passing_interceptions: 0,
  passing_2pt_conversions: 0,
  rushing_yards: 0,
  rushing_tds: 0,
  rushing_2pt_conversions: 0,
  receptions: 0,
  receiving_yards: 0,
  receiving_tds: 0,
  receiving_2pt_conversions: 0,
  rushing_fumbles_lost: 0,
  receiving_fumbles_lost: 0,
  sack_fumbles_lost: 0,
};
const receivers = Array.from({ length: 30 }, (_, i) => ({
  id: `p${i}`,
  name: `Receiver ${i}`,
  position: 'WR',
  nflTeam: 'KC',
  gsisId: `00-00000${String(i).padStart(2, '0')}`,
}));
const rows = receivers.flatMap((p, i) =>
  [2025, 2026].flatMap((season) =>
    Array.from({ length: season === 2025 ? 17 : 7 }, (_, week) => ({
      playerId: p.gsisId,
      name: p.name,
      position: 'WR',
      team: 'KC',
      opponent: 'LV',
      gameId: `${season}_${week}_${p.id}`,
      season,
      week: week + 1,
      seasonType: 'REG' as const,
      stats: { ...zero, receptions: 5, receiving_yards: 100 - i * 3 },
    })),
  ),
);
const data = {
  season: 2026,
  players: rows,
  games: [
    {
      id: '2026_08_KC_LV',
      season: 2026,
      week: 8,
      seasonType: 'REG',
      date: '2026-10-29',
      home: 'LV',
      away: 'KC',
      kickoffAt: '2026-10-29T17:00:00.000Z',
    },
  ],
  market: [],
  sources: [],
  warnings: [],
} as unknown as FootballDataSnapshot;
const bios = new Map<string, PlayerBio>(
  receivers.map((p, i) => [
    p.gsisId,
    {
      gsisId: p.gsisId,
      name: p.name,
      position: 'WR',
      birthDate: `${1995 + (i % 8)}-01-01`,
      rookieSeason: i === 29 ? 2026 : 2020,
      draftPick: 20 + i,
    },
  ]),
);
const league = {
  id: 'dyn',
  platform: 'sleeper',
  name: 'Dynasty',
  displayName: 'Dynasty League',
  teamCount: 4,
  scoring: { rec: 1, rec_yd: 0.1, rec_td: 6 },
  settings: {
    roster_positions: ['WR', 'WR', 'BN', 'BN', 'TAXI'],
    leagueFormat: 'dynasty',
    taxiSlots: 1,
    taxiYears: 1,
  },
  teams: [
    { id: 'a', name: 'Alpha', wins: 1, roster: receivers.slice(0, 4) },
    { id: 'b', name: 'Beta', wins: 5, roster: receivers.slice(4, 8) },
    { id: 'c', name: 'Gamma', wins: 3, roster: receivers.slice(8, 10) },
    { id: 'd', name: 'Delta', wins: 2, roster: [] },
  ],
  connectedAt: '2026-10-01T00:00:00.000Z',
} as unknown as LeagueConnection;

async function serve(snapshot: FootballDataSnapshot = data) {
  const app = express();
  app.use(express.json());
  app.use(
    createDynastyRouter({
      store: {
        snapshot: () => ({ leagues: [league] }) as unknown as ReturnType<LocalStore['snapshot']>,
        settingsSnapshot: () =>
          ({ preferences: {} }) as unknown as ReturnType<LocalStore['settingsSnapshot']>,
      },
      data: { get: async () => snapshot },
      bios: { get: async () => ({ byGsis: bios, byEspn: new Map() }) },
      catalog: async () =>
        new Map<string, RosterPlayer>(receivers.map((p) => [p.id, { ...p, sleeperId: p.id }])),
      now: () => Date.parse('2026-10-26T12:00:00Z'),
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  servers.push(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

it('returns long-term values, a rookie plan and pick values for a dynasty team', async () => {
  const url = await serve();
  const response = await fetch(`${url}/api/dynasty?league=dyn&team=a`);
  expect(response.status).toBe(200);
  const report = (await response.json()) as {
    league: { format: string; season: number };
    team: { longRank: number; outlook: string };
    roster: { id: string; value: number }[];
    rookies: { season: number; nextClass?: number; plan?: unknown };
    picks: { season: number }[];
    taxi?: { slots: number };
    keepers?: unknown;
  };
  expect(report.league).toMatchObject({ format: 'dynasty', season: 2026 });
  // Sorted by value; the younger receivers outrank slightly better older ones.
  expect(report.roster.map((p) => p.id)).toEqual(['p3', 'p2', 'p1', 'p0']);
  // Beta's receivers are younger, so they outrank Alpha's long term.
  expect(report.team).toMatchObject({ longRank: 2 });
  expect(['contender', 'build for later', 'rebuild', 'middle']).toContain(report.team.outlook);
  // Mid-season the next class is not drafted yet, so there is no plan.
  expect(report.rookies).toMatchObject({ season: 2026, nextClass: 2027 });
  expect(report.rookies.plan).toBeUndefined();
  expect(report.picks.map((p) => p.season)).toEqual([2027, 2028]);
  expect(report.taxi?.slots).toBe(1);
  expect(report.keepers).toBeUndefined();

  expect((await fetch(`${url}/api/dynasty?league=dyn&team=zz`)).status).toBe(404);
  expect((await fetch(`${url}/api/dynasty?league=dyn&team=a&x=1`)).status).toBe(400);
});

it('plans the rookie draft before the season, fewest wins picking first', async () => {
  const url = await serve({
    ...data,
    games: [{ ...data.games[0]!, week: 1, kickoffAt: '2026-10-29T17:00:00.000Z' }],
  });
  const report = (await (await fetch(`${url}/api/dynasty?league=dyn&team=a`)).json()) as {
    rookies: { plan: { slot: number; rounds: { pick: string; target?: { id: string } }[] } };
  };
  expect(report.rookies.plan.slot).toBe(1);
  expect(report.rookies.plan.rounds.map((r) => r.pick)).toEqual(['1.01', '2.01', '3.01', '4.01']);
  // The one unrostered rookie is the first-round target; later rounds have nobody left.
  expect(report.rookies.plan.rounds.map((r) => r.target?.id)).toEqual([
    'p29',
    undefined,
    undefined,
    undefined,
  ]);
});

it('checks trades both ways and rejects players the team does not have', async () => {
  const url = await serve();
  const post = (body: unknown) =>
    fetch(`${url}/api/dynasty/trade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const ok = await post({
    league: 'dyn',
    team: 'a',
    partner: 'b',
    give: { playerIds: ['p0'] },
    receive: { playerIds: ['p4', 'p5'], picks: [{ season: 2027, round: 1, tier: 'late' }] },
  });
  expect(ok.status).toBe(200);
  const result = (await ok.json()) as {
    yours: { net: number; released: unknown[]; receive: { picks: { label: string }[] } };
    theirs: { net: number };
  };
  expect(result.yours.released).toHaveLength(1);
  expect(result.yours.receive.picks[0]!.label).toBe('2027 1.04');
  expect(result.theirs).toBeDefined();

  expect(
    (await post({ league: 'dyn', team: 'a', give: { playerIds: ['p4'] }, receive: {} })).status,
  ).toBe(400);
  expect(
    (
      await post({
        league: 'dyn',
        team: 'a',
        give: { playerIds: [], picks: [{ season: 2027, round: 1, tier: 'soon' }] },
        receive: { playerIds: [] },
      })
    ).status,
  ).toBe(400);
  expect((await post({ league: 'dyn', team: 'a', give: {}, receive: {} })).status).toBe(400);
});
