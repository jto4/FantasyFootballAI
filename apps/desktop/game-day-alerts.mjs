import { readFile, writeFile } from 'node:fs/promises';

const hour = 3_600_000;
const reasons = {
  out: 'is out',
  inactive: 'is inactive today',
  doubtful: 'is doubtful',
  bye: 'is on bye',
};

/**
 * Notifications due for one league's alert report. Each problem is announced once per week:
 * starter problems inside the 24 hours before that player's kickoff (game-day inactives arrive
 * about 90 minutes before, and a new reason for the same player is announced again), and an out-of-date imported
 * league inside the 48 hours before the team's next kickoff.
 */
export function dueNotifications(report, now, sent) {
  const due = [];
  const league = encodeURIComponent(report.leagueId);
  for (const alert of report.alerts ?? []) {
    const kickoff = Date.parse(alert.kickoffAt ?? report.nextKickoffAt ?? '');
    if (!Number.isFinite(kickoff) || kickoff <= now || kickoff - now > 24 * hour) continue;
    const key = `${report.leagueId}:${report.week}:${alert.playerId}:${alert.reason}`;
    if (sent.has(key)) continue;
    due.push({
      key,
      title: `${alert.name} ${reasons[alert.reason] ?? 'needs a look'}`,
      body:
        `${report.leagueName}: they're in your starting lineup. ` +
        (alert.replacement?.name && Number.isFinite(alert.replacement.estimate)
          ? `Start ${alert.replacement.name} instead (${alert.replacement.estimate.toFixed(1)} projected).`
          : 'Open lineup advice to swap.'),
      hash: `#/advice?mode=lineup&league=${league}`,
    });
  }
  const next = Date.parse(report.nextKickoffAt ?? '');
  if (report.snapshot?.stale && Number.isFinite(next) && next > now && next - now <= 48 * hour) {
    const key = `${report.leagueId}:${report.week}:stale`;
    if (!sent.has(key))
      due.push({
        key,
        title: `${report.leagueName} is out of date`,
        body: 'Re-import the league before lineups lock so advice uses this week’s rosters.',
        hash: '#/leagues',
      });
  }
  return due;
}

/**
 * Polls the local service for each saved team every 15 minutes while the app runs. Sent keys
 * persist so a restart does not repeat a notification. Failures wait for the next poll.
 */
export function startGameDayAlerts({
  statePath,
  teams,
  fetchReport,
  notify,
  now = Date.now,
  intervalMs = 15 * 60_000,
}) {
  let sent;
  let running = false;
  async function loadSent() {
    if (sent) return sent;
    try {
      const value = JSON.parse(await readFile(statePath, 'utf8'));
      sent = new Set(Array.isArray(value) ? value.filter((k) => typeof k === 'string') : []);
    } catch {
      sent = new Set();
    }
    return sent;
  }
  async function tick() {
    if (running) return;
    running = true;
    try {
      const keys = await loadSent();
      for (const [leagueId, teamId] of Object.entries(teams()).slice(0, 10)) {
        const report = await fetchReport(leagueId, teamId).catch(() => undefined);
        if (!report) continue;
        for (const notification of dueNotifications(report, now(), keys)) {
          notify(notification);
          keys.add(notification.key);
        }
      }
      // Keep the newest keys; older weeks can never be due again.
      const kept = [...keys].slice(-300);
      sent = new Set(kept);
      await writeFile(statePath, JSON.stringify(kept), { mode: 0o600 }).catch(() => undefined);
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  const first = setTimeout(() => void tick(), 60_000);
  first.unref?.();
  return {
    tick,
    stop() {
      clearInterval(timer);
      clearTimeout(first);
    },
  };
}
