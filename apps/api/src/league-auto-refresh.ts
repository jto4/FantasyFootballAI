import type { FootballGame, LeagueConnection } from '@sidekick/core';
import { logEvent, errorName } from './logger.js';

const hour = 3_600_000;
/** Refresh at least this often even without games, so morning roster moves appear. */
export const maximumAgeMs = 12 * hour;
/** Refresh shortly before kickoffs, when late injury and lineup news lands. */
const preKickoffMs = 90 * 60_000;
const preKickoffMaxAgeMs = hour;
/** During games, refresh whenever the last sync is older than this. */
const liveMaxAgeMs = 10 * 60_000;
/** NFL games usually end within four hours of kickoff. */
const gameLengthMs = 4 * hour;

/**
 * Provider-connected leagues that should refresh now. Manual snapshot imports are never
 * refreshed automatically: they have no provider access and must be reimported by the owner.
 */
export function leaguesDueForRefresh(
  leagues: LeagueConnection[],
  games: FootballGame[],
  now: number,
): LeagueConnection[] {
  const kickoffs = games
    .filter((game) => game.seasonType === 'REG' && game.kickoffAt)
    .map((game) => Date.parse(game.kickoffAt!))
    .filter(Number.isFinite);
  return leagues.filter((league) => {
    if (league.connectionMode === 'snapshot') return false;
    const synced = league.lastSyncedAt ? Date.parse(league.lastSyncedAt) : NaN;
    if (!Number.isFinite(synced) || synced > now) return true;
    const age = now - synced;
    if (age >= maximumAgeMs) return true;
    const kickoffSoon = kickoffs.some((at) => at > now && at - now <= preKickoffMs);
    if (kickoffSoon && age >= preKickoffMaxAgeMs) return true;
    // While games are on, matchup points change constantly; keep them within one check.
    const gameLive = kickoffs.some((at) => at <= now && now < at + gameLengthMs);
    if (gameLive && age >= liveMaxAgeMs) return true;
    // A game that finished after the last sync changed scores and standings.
    return kickoffs.some((at) => at + gameLengthMs > synced && at + gameLengthMs <= now);
  });
}

/** Checks every 15 minutes and refreshes due leagues one at a time. */
export function startLeagueAutoRefresh(dependencies: {
  leagues: () => LeagueConnection[];
  games: (season: number) => Promise<FootballGame[]>;
  refresh: (league: LeagueConnection) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
}) {
  const now = dependencies.now ?? Date.now;
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const leagues = dependencies
        .leagues()
        .filter((league) => league.connectionMode !== 'snapshot');
      const seasons = [...new Set(leagues.map((league) => league.season).filter(Boolean))];
      const games = (
        await Promise.all(
          seasons.map((season) => dependencies.games(season!).catch(() => [] as FootballGame[])),
        )
      ).flat();
      for (const league of leaguesDueForRefresh(leagues, games, now())) {
        try {
          await dependencies.refresh(league);
          logEvent('info', 'league.auto_refresh.succeeded', { component: 'league-refresh' });
        } catch (error) {
          logEvent('warn', 'league.auto_refresh.failed', {
            component: 'league-refresh',
            errorName: errorName(error),
          });
        }
      }
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => void tick(), dependencies.intervalMs ?? 15 * 60_000);
  timer.unref();
  return { tick, stop: () => clearInterval(timer) };
}
