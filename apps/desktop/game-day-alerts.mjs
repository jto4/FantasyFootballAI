import { readFile, writeFile } from 'node:fs/promises';

const hour = 3_600_000;
const reasons = {
  out: 'is out',
  inactive: 'is inactive today',
  doubtful: 'is doubtful',
  bye: 'is on bye',
};

const minutesOfDay = (time) => {
  const date = new Date(time);
  return date.getHours() * 60 + date.getMinutes();
};
/** Whether a local time is inside quiet hours that may wrap past midnight ("23:00"–"08:00"). */
export function inQuietHours(time, start, end) {
  if (!start || !end) return false;
  const toMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const from = toMinutes(start),
    to = toMinutes(end),
    now = minutesOfDay(time);
  if (from === to) return false;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/**
 * Notifications due for one league's alert report, following the owner's notification choices
 * (which alerts, how many hours before kickoff, quiet hours). Each problem is announced once per
 * week: starter problems inside the lead time before that player's kickoff, an out-of-date
 * imported league inside the 48 hours before the team's next kickoff, watched players ruled out,
 * and an optional game-day summary in the 90 minutes before the first starter's kickoff. A new
 * reason for the same player (doubtful, then inactive) is announced again. During quiet hours
 * nothing is sent; problems still due are sent on the first poll after they end.
 */
export function dueNotifications(report, now, sent) {
  const prefs = {
    out: true,
    inactive: true,
    doubtful: true,
    bye: true,
    stale: true,
    watchlist: true,
    gameDaySummary: false,
    leadHours: 24,
    ...report.notifications,
  };
  if (inQuietHours(now, prefs.quietStart, prefs.quietEnd)) return [];
  const due = [];
  const league = encodeURIComponent(report.leagueId);
  for (const alert of report.alerts ?? []) {
    if (prefs[alert.reason] === false) continue;
    const kickoff = Date.parse(alert.kickoffAt ?? report.nextKickoffAt ?? '');
    if (!Number.isFinite(kickoff) || kickoff <= now || kickoff - now > prefs.leadHours * hour)
      continue;
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
  if (prefs.watchlist)
    for (const watched of report.watchlist ?? []) {
      const kickoff = Date.parse(watched.kickoffAt ?? '');
      if (!Number.isFinite(kickoff) || kickoff <= now || kickoff - now > prefs.leadHours * hour)
        continue;
      const key = `${report.leagueId}:${report.week}:watch:${watched.playerId}:${watched.status}`;
      if (sent.has(key)) continue;
      due.push({
        key,
        title: `${watched.name} is ${String(watched.status).toLowerCase()}`,
        body: `${report.leagueName}: a player on your watchlist.`,
        hash: `#/desk?league=${league}`,
      });
    }
  const summary = report.gameDaySummary;
  if (prefs.gameDaySummary && summary) {
    const kickoff = Date.parse(summary.kickoffAt);
    const key = `${report.leagueId}:${report.week}:summary`;
    if (Number.isFinite(kickoff) && kickoff > now && kickoff - now <= 90 * 60_000 && !sent.has(key))
      due.push({
        key,
        title: `${report.leagueName}: kickoff soon`,
        body:
          `You're projected for ${summary.projected.toFixed(1)}` +
          (summary.opponentProjected !== undefined
            ? ` vs ${summary.opponentProjected.toFixed(1)}${summary.opponentName ? ` (${summary.opponentName})` : ''}`
            : '') +
          (summary.winProbability !== undefined
            ? `, a ${Math.round(summary.winProbability * 100)}% chance to win.`
            : '.'),
        hash: `#/desk?league=${league}`,
      });
  }
  const next = Date.parse(report.nextKickoffAt ?? '');
  if (
    prefs.stale &&
    report.snapshot?.stale &&
    Number.isFinite(next) &&
    next > now &&
    next - now <= 48 * hour
  ) {
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
