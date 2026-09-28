import type { LeagueSeasonPhase } from '@sidekick/core';

export function seasonKicker(
  phase: LeagueSeasonPhase,
  currentWeek: number | undefined,
  isInferredPlayoffStart: boolean,
  seasonYear: number | undefined,
  currentYear = new Date().getFullYear(),
): string {
  if (phase === 'complete') return 'SEASON COMPLETE';
  if (phase === 'offseason') return 'DRAFT WINDOW';
  if (Number.isInteger(currentWeek) && currentWeek !== undefined && currentWeek > 0) {
    const playoffLabel =
      phase === 'playoffs' ? (isInferredPlayoffStart ? ' · POSSIBLE PLAYOFFS' : ' · PLAYOFFS') : '';
    return `WEEK ${currentWeek}${playoffLabel}`;
  }
  return seasonYear ? `${seasonYear} SEASON` : `${currentYear} SEASON`;
}

export function seasonHeroHeadline(
  phase: LeagueSeasonPhase,
  currentWeek: number | undefined,
  isInferredPlayoffStart: boolean,
  hasLeague: boolean,
): string {
  if (phase === 'complete' && hasLeague)
    return 'The season is in the books. Let’s see who still has bragging rights.';
  if (phase === 'offseason' && hasLeague)
    return 'Draft prep is on. Let’s see who is building a contender and who is already overthinking it.';
  if (Number.isInteger(currentWeek) && currentWeek !== undefined && currentWeek > 0) {
    if (phase === 'playoffs') {
      return isInferredPlayoffStart
        ? `Week ${currentWeek} may be a playoff week. Let's see who's still in it.`
        : `Week ${currentWeek}: the playoff stakes are here.`;
    }
    return `Week ${currentWeek} is ready for a fresh look.`;
  }
  return hasLeague
    ? 'Your league is ready for a fresh look.'
    : 'Let’s make the league chat interesting.';
}
