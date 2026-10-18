import type { ActionSetting, LeagueConnection } from './domain-types.js';
import { defaultLeagueStaleAfterHours, isLeagueStaleAfterHours } from './league-status.js';

/** Saved-data scheduling is an explicit, scoped draft policy, never a refresh fallback. */
export function isValidReportDataMode(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  return (
    action.dataMode === undefined ||
    (action.dataMode === 'saved' &&
      action.mode === 'draft' &&
      action.channel === 'dashboard' &&
      Array.isArray(action.leagueIds) &&
      action.leagueIds.length > 0 &&
      action.leagueIds.length <= 100 &&
      new Set(action.leagueIds).size === action.leagueIds.length &&
      action.leagueIds.every(
        (id) =>
          typeof id === 'string' &&
          id.length > 0 &&
          id.length <= 200 &&
          !/[\u0000-\u001f\u007f]/.test(id),
      ))
  );
}

export function reportDataProblem(
  league: LeagueConnection,
  action: ActionSetting,
  maximumAgeHours: number = defaultLeagueStaleAfterHours,
  now = Date.now(),
): string | undefined {
  if (!isValidReportDataMode(action))
    return 'Saved-data reports require an explicit league selection and dashboard drafts only.';
  if (action.dataMode !== 'saved')
    return league.connectionMode === 'snapshot'
      ? 'Provider refresh is unavailable for this manual import. Choose saved data in the schedule to create drafts from a recent import.'
      : undefined;
  if (!action.leagueIds?.includes(league.id))
    return 'This league is not selected for saved-data reports.';
  const hours = isLeagueStaleAfterHours(maximumAgeHours)
    ? maximumAgeHours
    : defaultLeagueStaleAfterHours;
  const at = Date.parse(
    league.connectionMode === 'snapshot'
      ? (league.snapshotImportedAt ?? '')
      : (league.lastSyncedAt ?? ''),
  );
  if (!Number.isFinite(now) || !Number.isFinite(at) || at > now || now - at >= hours * 3600000)
    return `Import or refresh league data saved within the last ${hours} hours before this draft can run. The provider's update time may still be unverified.`;
  return undefined;
}

/** Planned-time readiness also checks the current clock so future-dated imports cannot look valid. */
export function reportDataProblemAt(
  league: LeagueConnection,
  action: ActionSetting,
  maximumAgeHours: number | undefined,
  plannedAt: number | undefined,
  now = Date.now(),
): string | undefined {
  const current = reportDataProblem(league, action, maximumAgeHours, now);
  if (current || plannedAt === undefined || !Number.isFinite(plannedAt) || plannedAt <= now)
    return current;
  if (!reportDataProblem(league, action, maximumAgeHours, plannedAt)) return undefined;
  const hours = isLeagueStaleAfterHours(maximumAgeHours)
    ? maximumAgeHours
    : defaultLeagueStaleAfterHours;
  return `This saved copy will expire before the planned run. Import or sync again within ${hours} hours of that run.`;
}
