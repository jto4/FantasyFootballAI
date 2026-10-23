import { expect, it } from 'vitest';
import type { FootballGame, PropLine } from '@sidekick/core';
import { PropLineLedger, startPropLineCapture } from './prop-line-ledger.js';

const game = (id: string, kickoffAt: string, week = 7): FootballGame => ({
  id,
  season: 2026,
  week,
  seasonType: 'REG',
  date: kickoffAt.slice(0, 10),
  home: 'SEA',
  away: 'KC',
  kickoffAt,
});
const line = (gameId: string, value: number, overOdds?: number): PropLine => ({
  id: `espn:${gameId}:3139477:passing_yards:${value}`,
  gameId,
  playerName: 'Patrick Mahomes',
  stat: 'passing_yards',
  line: value,
  sportsbook: 'DraftKings',
  source: 'espn',
  observedAt: '2026-10-23T00:00:00Z',
  ...(overOdds !== undefined ? { overOdds, underOdds: -110 } : {}),
});

it('keeps the first line, the last line each day and the last line before kickoff', () => {
  const ledger = new PropLineLedger(':memory:');
  const sunday = game('2026_07_KC_SEA', '2026-10-26T00:20:00.000Z');
  ledger.record([line(sunday.id, 220.5)], [sunday], '2026-10-23T12:00:00.000Z');
  ledger.record([line(sunday.id, 224.5)], [sunday], '2026-10-23T20:00:00.000Z');
  ledger.record([line(sunday.id, 230.5, -115)], [sunday], '2026-10-25T23:50:00.000Z');
  // After kickoff nothing changes, so the closing line stays the last pre-game one.
  expect(ledger.record([line(sunday.id, 260.5)], [sunday], '2026-10-26T01:00:00.000Z')).toBe(0);
  const [history] = ledger.list(sunday.id);
  expect(history).toMatchObject({
    key: '2026_07_KC_SEA:3139477:passing_yards:DraftKings',
    espnId: '3139477',
    first: { line: 220.5, at: '2026-10-23T12:00:00.000Z' },
    closing: { line: 230.5, overOdds: -115, underOdds: -110 },
    observations: 3,
  });
  expect(Object.keys(history!.daily)).toEqual(['2026-10-23', '2026-10-25']);
  expect(history!.daily['2026-10-23']!.line).toBe(224.5);
  expect(ledger.summary()).toEqual({ lines: 1, games: 1 });
  ledger.close();
});

it('captures every game of the week once a day and near-kickoff games on each tick', async () => {
  let now = Date.parse('2026-10-23T12:00:00.000Z');
  const soon = game('2026_07_PIT_NO', '2026-10-23T13:30:00.000Z');
  const later = game('2026_07_KC_SEA', '2026-10-26T00:20:00.000Z');
  const nextWeek = game('2026_08_KC_SEA', '2026-11-02T00:20:00.000Z', 8);
  const fetched: string[] = [];
  const ledger = new PropLineLedger(':memory:');
  const capture = startPropLineCapture({
    data: {
      get: async () =>
        ({ season: 2026, games: [soon, later, nextWeek] }) as unknown as Awaited<
          ReturnType<Parameters<typeof startPropLineCapture>[0]['data']['get']>
        >,
    },
    props: {
      props: async (g) => {
        fetched.push(g.id);
        return { gameId: g.id, lines: [line(g.id, 200.5)], priced: false, warnings: [] };
      },
    },
    ledger,
    now: () => now,
  });
  await capture.tick();
  expect(fetched).toEqual([soon.id, later.id]);
  now += 20 * 60_000;
  fetched.length = 0;
  await capture.tick();
  expect(fetched).toEqual([soon.id]);
  capture.stop();
  expect(ledger.summary()).toEqual({ lines: 2, games: 2 });
  ledger.close();
});
