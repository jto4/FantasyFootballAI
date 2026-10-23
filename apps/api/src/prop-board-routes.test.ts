import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import type { FootballDataSnapshot, LeagueConnection } from '@sidekick/core';
import { createPropBoardRouter, PropLeanStore } from './prop-board-routes.js';
import type { LocalStore } from './store.js';

const servers: (() => void)[] = [];
afterEach(() => servers.splice(0).forEach((close) => close()));

const game = (id: string, week: number, kickoffAt: string) => ({
  id,
  season: 2026,
  week,
  seasonType: 'REG' as const,
  date: kickoffAt.slice(0, 10),
  home: 'SEA',
  away: 'KC',
  kickoffAt,
});

it('builds the board for the next week, saves pre-kickoff leans, and grades finished ones', async () => {
  let now = Date.parse('2026-10-23T12:00:00Z');
  const history = [3, 4, 5, 6].map((week) => ({
    playerId: 'x',
    name: 'Fictional Receiver',
    position: 'WR',
    team: 'SEA',
    opponent: 'LA',
    gameId: `2026_0${week}_LA_SEA`,
    season: 2026,
    week,
    seasonType: 'REG' as const,
    stats: { receiving_yards: 90 },
  }));
  const data: FootballDataSnapshot = {
    season: 2026,
    players: [...history],
    games: [game('2026_07_KC_SEA', 7, '2026-10-26T00:20:00.000Z')],
    market: [],
    sources: [],
    warnings: [],
    playerForecasts: [
      {
        espnId: '1',
        name: 'Fictional Receiver',
        position: 'WR',
        team: 'SEA',
        season: 2026,
        week: 7,
        issuedWeek: 7,
        stats: { receiving_yards: 100 },
        sourceId: 'espn-forecasts-2026-0',
      },
    ],
  };
  const leans = new PropLeanStore(':memory:');
  const app = express();
  app.use(
    createPropBoardRouter({
      data: { get: async () => data },
      props: {
        props: async (g) => ({
          gameId: g.id,
          lines: [
            {
              id: `espn:${g.id}:1:receiving_yards:40.5`,
              gameId: g.id,
              playerName: 'Fictional Receiver',
              stat: 'receiving_yards',
              line: 40.5,
              sportsbook: 'DraftKings',
              source: 'espn',
              observedAt: '2026-10-23T00:00:00Z',
            },
          ],
          priced: false,
          warnings: [],
        }),
      },
      store: {
        snapshot: () =>
          ({
            leagues: [
              {
                id: 'afton',
                platform: 'espn',
                teams: [
                  { id: '10', name: 'Horses', roster: [{ id: '1', name: 'Fictional Receiver' }] },
                ],
              } as unknown as LeagueConnection,
            ],
          }) as ReturnType<LocalStore['snapshot']>,
      },
      leans,
      now: () => now,
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  servers.push(() => (server.close(), leans.close()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const board = (await (await fetch(`${url}/api/props/board?league=afton`)).json()) as {
    week: number;
    model: unknown;
    rows: { fantasyTeam?: string; lean?: { side: string } }[];
    record: { pending: number };
  };
  expect(board.week).toBe(7);
  expect(board.rows[0]).toMatchObject({
    fantasyTeam: 'Horses',
    model: { side: 'over', source: 'blend' },
    lean: { side: 'over' },
  });
  expect(board.model).toEqual({ marketWeight: 0.25, fitted: false, gradedForFit: 0 });
  expect(board.record.pending).toBe(1);

  // After the game, the stats arrive and the saved lean is graded.
  now = Date.parse('2026-10-27T12:00:00Z');
  data.games = [game('2026_08_KC_SEA', 8, '2026-11-02T00:20:00.000Z')];
  data.players = [
    ...history,
    {
      playerId: 'x',
      name: 'Fictional Receiver',
      position: 'WR',
      team: 'SEA',
      opponent: 'KC',
      gameId: '2026_07_KC_SEA',
      season: 2026,
      week: 7,
      seasonType: 'REG',
      stats: { receiving_yards: 52 },
    },
  ];
  const record = (await (await fetch(`${url}/api/props/record`)).json()) as {
    record: { overall: { wins: number }; pending: number };
    recent: { result: { actual: number } }[];
  };
  expect(record.record).toMatchObject({ pending: 0, overall: { wins: 1 } });
  expect(record.recent[0]!.result.actual).toBe(52);
  expect((await fetch(`${url}/api/props/board?x=1`)).status).toBe(400);
});
