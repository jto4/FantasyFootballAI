import { expect, it } from 'vitest';
import { propLineKey, type FootballGame, type PropLine } from '@sidekick/core';
import { PropLineLedger, isPropLineHistory, startPropLineCapture } from './prop-line-ledger.js';

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

it('does not rewrite an unchanged price on the same day', () => {
  const ledger = new PropLineLedger(':memory:');
  const sunday = game('2026_07_KC_SEA', '2026-10-26T00:20:00.000Z');
  expect(ledger.record([line(sunday.id, 220.5)], [sunday], '2026-10-23T12:00:00.000Z')).toBe(1);
  expect(ledger.record([line(sunday.id, 220.5)], [sunday], '2026-10-23T12:20:00.000Z')).toBe(0);
  // A new day or a new price is recorded.
  expect(ledger.record([line(sunday.id, 220.5)], [sunday], '2026-10-24T09:00:00.000Z')).toBe(1);
  expect(ledger.record([line(sunday.id, 221.5)], [sunday], '2026-10-24T09:20:00.000Z')).toBe(1);
  const [history] = ledger.list(sunday.id);
  expect(history!.observations).toBe(3);
  expect(Object.keys(history!.daily)).toEqual(['2026-10-23', '2026-10-24']);
});

it('captures every game of the week once a day and near-kickoff games on each tick', async () => {
  let now = Date.parse('2026-10-23T12:00:00.000Z');
  const soon = game('2026_07_PIT_NO', '2026-10-23T13:30:00.000Z');
  const later = game('2026_07_KC_SEA', '2026-10-26T00:20:00.000Z');
  const nextWeek = game('2026_08_KC_SEA', '2026-11-02T00:20:00.000Z', 8);
  const fetched: string[] = [];
  const ledger = new PropLineLedger(':memory:');
  let refreshed = 0;
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
    afterCapture: async () => {
      refreshed++;
    },
  });
  await capture.tick();
  expect(fetched).toEqual([soon.id, later.id]);
  expect(refreshed).toBe(1);
  now += 20 * 60_000;
  fetched.length = 0;
  await capture.tick();
  expect(fetched).toEqual([soon.id]);
  capture.stop();
  expect(ledger.summary()).toEqual({ lines: 2, games: 2 });
  ledger.close();
});

it('gives the latest line per player and stat for the chosen games, averaged across books', () => {
  const ledger = new PropLineLedger(':memory:');
  const sunday = game('2026_07_KC_SEA', '2026-10-26T00:20:00.000Z');
  const other = game('2026_07_LA_SF', '2026-10-26T00:20:00.000Z');
  const at = '2026-10-23T12:00:00.000Z';
  ledger.record(
    [line(sunday.id, 220.5), { ...line(sunday.id, 230.5), sportsbook: 'FanDuel' }],
    [sunday],
    at,
  );
  ledger.record([line(sunday.id, 224.5)], [sunday], '2026-10-24T12:00:00.000Z');
  ledger.record([line(other.id, 199.5)], [other], at);
  const lines = ledger.latestLines([sunday.id]);
  expect([...lines.keys()]).toEqual([propLineKey(sunday.id, 'Patrick Mahomes')]);
  expect(lines.get(propLineKey(sunday.id, 'Patrick Mahomes'))).toEqual({ passing_yards: 227.5 });
  ledger.close();
});

it('condenses older seasons to their first and closing lines and merges backups without overwriting', () => {
  const ledger = new PropLineLedger(':memory:');
  const old = game('2025_07_KC_SEA', '2025-10-26T00:20:00.000Z');
  const current = game('2026_07_KC_SEA', '2026-10-26T00:20:00.000Z');
  ledger.record([line(old.id, 220.5)], [old], '2025-10-23T12:00:00.000Z');
  ledger.record([line(old.id, 224.5)], [old], '2025-10-24T12:00:00.000Z');
  ledger.record([line(current.id, 240.5)], [current], '2026-10-23T12:00:00.000Z');
  expect(ledger.condenseBefore(2026)).toBe(1);
  expect(ledger.condenseBefore(2026)).toBe(0);
  const [before] = ledger.list(old.id);
  expect(before).toMatchObject({ daily: {}, first: { line: 220.5 }, closing: { line: 224.5 } });
  expect(Object.keys(ledger.list(current.id)[0]!.daily)).toHaveLength(1);

  const copy = ledger.list();
  const restored = new PropLineLedger(':memory:');
  restored.record([line(current.id, 250.5)], [current], '2026-10-24T12:00:00.000Z');
  restored.merge(copy);
  expect(restored.list()).toHaveLength(2);
  // The line already here is the newer one.
  expect(restored.list(current.id)[0]!.closing.line).toBe(250.5);
  expect(copy.every(isPropLineHistory)).toBe(true);
  expect(isPropLineHistory({ ...copy[0], closing: { line: 'x' } })).toBe(false);
  ledger.close();
  restored.close();
});
