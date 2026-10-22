import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dueNotifications, startGameDayAlerts } from './game-day-alerts.mjs';

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
