import type {
  ReportKind,
  LeagueConnection,
  LeagueSyncFreshness,
  LeagueSeasonPhase,
  LeagueStaleAfterHours,
  ReportSchedule,
} from './domain-types.js';
export const leagueStaleAfterHoursOptions = [6, 12, 24, 48, 72, 168] as const;
export const defaultLeagueStaleAfterHours: LeagueStaleAfterHours = 24;
/** A stale snapshot remains usable, but the dashboard prompts its owner to refresh it. */
export const leagueSyncStaleAfterMs = defaultLeagueStaleAfterHours * 60 * 60 * 1_000;

export function isLeagueStaleAfterHours(value: unknown): value is LeagueStaleAfterHours {
  return leagueStaleAfterHoursOptions.some((hours) => hours === value);
}

export function leagueSyncFreshness(
  league: Pick<LeagueConnection, 'lastSyncedAt'>,
  now = Date.now(),
  staleAfterMs = leagueSyncStaleAfterMs,
): LeagueSyncFreshness {
  const syncedAt = league.lastSyncedAt ? Date.parse(league.lastSyncedAt) : Number.NaN;
  if (
    !Number.isFinite(syncedAt) ||
    !Number.isFinite(now) ||
    !Number.isFinite(staleAfterMs) ||
    staleAfterMs <= 0 ||
    syncedAt > now
  )
    return 'unknown';
  return now - syncedAt >= staleAfterMs ? 'stale' : 'fresh';
}

/** Classify season phase only from an explicit completion flag and a bounded current/playoff week. */
export function leagueSeasonPhase(league: Pick<LeagueConnection, 'settings'>): LeagueSeasonPhase {
  const settings = league.settings;
  if (
    settings.seasonComplete === true ||
    settings.seasonStatus === 'complete' ||
    settings.seasonStatus === 'finished'
  )
    return 'complete';
  if (settings.seasonStatus === 'pre_draft' || settings.seasonStatus === 'drafting')
    return 'offseason';
  const currentWeek = boundedSettingInteger(settings.currentWeek);
  const playoffStartWeek =
    boundedSettingInteger(settings.playoffStartWeek) ??
    boundedSettingInteger(settings.playoff_start_week) ??
    boundedSettingInteger(settings.playoff_week_start);
  if (currentWeek === undefined || playoffStartWeek === undefined) return 'unknown';
  return currentWeek >= playoffStartWeek ? 'playoffs' : 'regular-season';
}

/** Keep scheduled season-specific reports quiet when a fresh platform snapshot contradicts them. */
export function scheduledReportPhaseSkipReason(
  kind: ReportKind,
  phase: LeagueSeasonPhase,
  frequency: ReportSchedule['frequency'] = 'weekly',
): string | undefined {
  if (frequency === 'once') return undefined;
  if ((kind === 'power-rankings' || kind === 'matchup-preview') && phase === 'offseason')
    return 'The platform reports a pre-draft or draft phase; recurring in-season reports are paused until the league season starts.';
  if (kind === 'offseason-update' && (phase === 'regular-season' || phase === 'playoffs'))
    return 'This league is still active; offseason updates are paused until the platform marks the season complete.';
  if ((kind === 'power-rankings' || kind === 'matchup-preview') && phase === 'complete')
    return 'The platform marks this league season complete; weekly in-season reports are paused.';
  return undefined;
}

export function boundedSettingInteger(value: unknown): number | undefined {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 30 ? numeric : undefined;
}
