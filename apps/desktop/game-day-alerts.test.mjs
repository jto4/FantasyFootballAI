import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dueNotifications,
  inQuietHours,
  nextCheckDelay,
  startGameDayAlerts,
} from './game-day-alerts.mjs';

const now = Date.parse('2026-10-25T12:00:00Z');
const report = {
  leagueId: 'league 1',
  teamId: 't1',
  leagueName: 'Fictional League',
  week: 8,
  nextKickoffAt: '2026-10-25T17:00:00Z',
  alerts: [
    { playerId: 'p1', name: 'Out Player', reason: 'out', kickoffAt: '2026-10-25T17:00:00Z' },
    { playerId: 'p2', name: 'Later Player', reason: 'bye', kickoffAt: '2026-10-28T00:15:00Z' },
  ],
  snapshot: { stale: true, importedAt: '2026-10-15T00:00:00Z' },
};

test('announces starter problems within a day of kickoff and stale imports within two days', () => {
  const due = dueNotifications(report, now, new Set());
  assert.deepEqual(
    due.map((n) => n.title),
    ['Out Player is out', 'Fictional League is out of date'],
  );
  assert.equal(due[0].hash, '#/advice?mode=lineup&league=league%201');
  assert.equal(due[1].hash, '#/leagues');
  // Already sent, past kickoff, or a fresh league: nothing new.
  assert.deepEqual(dueNotifications(report, now, new Set(due.map((n) => n.key))), []);
  assert.deepEqual(dueNotifications(report, Date.parse('2026-10-25T18:00:00Z'), new Set()), []);
  assert.deepEqual(
    dueNotifications({ ...report, alerts: [], snapshot: { stale: false } }, now, new Set()),
    [],
  );
});

test('announces a game-day inactive with the suggested bench replacement', () => {
  const inactive = {
    ...report,
    snapshot: undefined,
    alerts: [
      {
        playerId: 'p1',
        name: 'Questionable Player',
        reason: 'inactive',
        kickoffAt: '2026-10-25T13:00:00Z',
        replacement: { id: 'p9', name: 'Bench Player', estimate: 9.44 },
      },
    ],
  };
  const [due] = dueNotifications(inactive, now, new Set(['league 1:8:p1:doubtful']));
  assert.equal(due.title, 'Questionable Player is inactive today');
  assert.match(due.body, /Start Bench Player instead \(9\.4 projected\)\./);
});

test('polls each saved team, notifies once, and remembers sent notifications across restarts', async () => {
  const statePath = join(await mkdtemp(join(tmpdir(), 'alerts-')), 'sent.json');
  const shown = [];
  const options = {
    statePath,
    teams: () => ({ 'league 1': 't1' }),
    fetchReport: async () => report,
    notify: (n) => shown.push(n.key),
    now: () => now,
    intervalMs: 3_600_000,
  };
  const first = startGameDayAlerts(options);
  await first.tick();
  await first.tick();
  first.stop();
  assert.equal(shown.length, 2);
  const restarted = startGameDayAlerts(options);
  await restarted.tick();
  restarted.stop();
  assert.equal(shown.length, 2);
  assert.equal(JSON.parse(await readFile(statePath, 'utf8')).length, 2);
});

test('follows notification choices: kinds, lead time, quiet hours, watchlist and summary', () => {
  const base = {
    ...report,
    snapshot: undefined,
    watchlist: [
      { playerId: 'w1', name: 'Watched Player', status: 'Out', kickoffAt: '2026-10-25T17:00:00Z' },
    ],
    gameDaySummary: {
      kickoffAt: '2026-10-25T13:00:00Z',
      projected: 112.4,
      opponentProjected: 104.9,
      opponentName: 'Fictional Twos',
      winProbability: 0.63,
    },
  };
  // Defaults: starter and watchlist alerts, no summary.
  assert.deepEqual(
    dueNotifications(base, now, new Set()).map((n) => n.title),
    ['Out Player is out', 'Watched Player is out'],
  );
  const chosen = {
    ...base,
    notifications: { out: false, watchlist: false, gameDaySummary: true, leadHours: 24 },
  };
  const summaryTime = Date.parse('2026-10-25T12:00:00Z');
  const [summary] = dueNotifications(chosen, summaryTime, new Set());
  assert.equal(summary.title, 'Fictional League: kickoff soon');
  assert.match(summary.body, /112\.4 vs 104\.9 \(Fictional Twos\), a 63% chance to win/);
  // Two-hour lead time: a 17:00 kickoff is not yet due at 12:00.
  assert.deepEqual(
    dueNotifications({ ...base, notifications: { leadHours: 2 } }, now, new Set()),
    [],
  );
  // Quiet hours wrap past midnight and hold everything.
  assert.equal(inQuietHours(new Date(2026, 9, 25, 23, 30).getTime(), '23:00', '08:00'), true);
  assert.equal(inQuietHours(new Date(2026, 9, 25, 7, 59).getTime(), '23:00', '08:00'), true);
  assert.equal(inQuietHours(new Date(2026, 9, 25, 8, 0).getTime(), '23:00', '08:00'), false);
  const quietNow = new Date(2026, 9, 25, 2, 0).getTime();
  assert.deepEqual(
    dueNotifications(
      { ...base, notifications: { quietStart: '00:00', quietEnd: '06:00' } },
      quietNow,
      new Set(),
    ),
    [],
  );
});

test('checks often near kickoff and rarely when games are days away', () => {
  const hour = 3_600_000;
  const at = (hours) => new Date(now + hours * hour).toISOString();
  const interval = 15 * 60_000;
  assert.equal(nextCheckDelay([{ nextKickoffAt: at(5) }], now, interval), interval);
  assert.equal(nextCheckDelay([{ nextKickoffAt: at(49) }], now, interval), interval);
  assert.equal(nextCheckDelay([{ nextKickoffAt: at(120) }], now, interval), 3 * hour);
  // Wake up in time for the 50-hour window.
  assert.equal(nextCheckDelay([{ nextKickoffAt: at(51) }], now, interval), hour);
  assert.equal(nextCheckDelay([{}], now, interval), 3 * hour);
  // Watched players' games count too.
  assert.equal(
    nextCheckDelay([{ nextKickoffAt: at(120), nextWatchKickoffAt: at(10) }], now, interval),
    interval,
  );
  assert.equal(
    nextCheckDelay([{ nextKickoffAt: at(120) }, { nextKickoffAt: at(3) }], now, interval),
    interval,
  );
});

test('checks a newly chosen team right away during an idle wait', async () => {
  const statePath = join(await mkdtemp(join(tmpdir(), 'alerts-')), 'sent.json');
  let current = { 'league 1': 't1' };
  const fetched = [];
  let fire;
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = (fn) => ((fire = fn), { unref() {} });
  try {
    const alerts = startGameDayAlerts({
      statePath,
      teams: () => current,
      fetchReport: async (league, team) => (
        fetched.push(team),
        { ...report, alerts: [], nextKickoffAt: undefined, snapshot: undefined }
      ),
      notify: () => undefined,
      now: () => now,
    });
    await alerts.tick();
    fire();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(fetched, ['t1']);
    current = { 'league 1': 't2' };
    fire();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(fetched, ['t1', 't2']);
    alerts.stop();
  } finally {
    globalThis.setInterval = realSetInterval;
  }
});
