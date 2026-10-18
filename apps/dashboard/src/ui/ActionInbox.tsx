import {
  addCalendarDays,
  reportDataProblemAt,
  localDateTimeInstants,
  leagueSyncFreshness,
  leaguesForAction,
  localDateTimeInTimezone,
  scheduledReportPhaseSkipReason,
  leagueSeasonPhase,
  type AppSettings,
  type LeagueConnection,
  type ReportSummary,
  type ReportSchedule,
} from '@sidekick/core';
import type { ScheduledRun } from './SchedulePage';

function nextDate(
  schedule: ReportSchedule,
  now: Date,
): { date: string; instant: number } | undefined {
  if (!schedule.enabled || schedule.completedAt) return undefined;
  const local = localDateTimeInTimezone(now.toISOString(), schedule.timezone);
  if (!local) return undefined;
  if (schedule.frequency === 'once') {
    const instant = schedule.date
      ? localDateTimeInstants(schedule.date, schedule.time, schedule.timezone).find(
          (value) => value >= now.getTime(),
        )
      : undefined;
    return instant === undefined || !schedule.date ? undefined : { date: schedule.date, instant };
  }
  for (let offset = 0; offset <= 31; offset++) {
    const date = addCalendarDays(local.date, offset);
    if (!date) continue;
    const day = new Date(`${date}T12:00:00Z`);
    if (schedule.frequency === 'weekly' && day.getUTCDay() !== schedule.weekday) continue;
    if (schedule.frequency === 'monthly' && day.getUTCDate() !== schedule.dayOfMonth) continue;
    const instant = localDateTimeInstants(date, schedule.time, schedule.timezone).find(
      (value) => value >= now.getTime(),
    );
    if (instant !== undefined) return { date, instant };
  }
  return undefined;
}
export function ActionInbox({
  league,
  reports,
  settings,
  scheduledRuns,
  counts,
  onReview,
  onSchedule,
  onRefresh,
}: {
  league: LeagueConnection | undefined;
  reports: ReportSummary[];
  counts?: { drafts: number; issues: number } | undefined;
  settings: AppSettings;
  scheduledRuns: ScheduledRun[];
  onReview: () => void;
  onSchedule: () => void;
  onRefresh: () => void;
}) {
  const drafts = reports.filter(
    (report) =>
      (!league || report.leagueId === league.id) &&
      report.status === 'draft' &&
      !report.deliveryState,
  );
  const deliveries = reports.filter(
    (report) =>
      (!league || report.leagueId === league.id) &&
      (report.deliveryState === 'failed' || report.deliveryState === 'uncertain'),
  );
  const draftCount = counts?.drafts ?? drafts.length;
  const issueCount = counts?.issues ?? deliveries.length;
  const now = new Date();
  const staleAfterMs = (settings.leagueStaleAfterHours ?? 24) * 3600000;
  const freshness = league ? leagueSyncFreshness(league, now.getTime(), staleAfterMs) : 'unknown';
  const upcoming = settings.actions
    .filter(
      (action) =>
        action.enabled &&
        league &&
        leaguesForAction(action, [league]).length > 0 &&
        (!league ||
          freshness !== 'fresh' ||
          !scheduledReportPhaseSkipReason(
            action.kind,
            leagueSeasonPhase(league),
            action.schedule.frequency,
          )),
    )
    .flatMap((action) => {
      const next = nextDate(action.schedule, now);
      return next
        ? [
            {
              title: action.kind.replaceAll('-', ' '),
              ...next,
              time: action.schedule.time,
              timezone: action.schedule.timezone,
              mode: action.mode,
              dataProblem: league
                ? reportDataProblemAt(league, action, settings.leagueStaleAfterHours, next.instant)
                : undefined,
              savedData: action.dataMode === 'saved',
            },
          ]
        : [];
    });
  for (const event of settings.calendarEvents ?? [])
    if (!event.completedAt && (!league || event.leagueId === league.id)) {
      const local = localDateTimeInTimezone(now.toISOString(), event.timezone);
      if (local && `${event.date} ${event.time}` >= `${local.date} ${local.time}`) {
        const instant = localDateTimeInstants(event.date, event.time, event.timezone).find(
          (value) => value >= now.getTime(),
        );
        if (instant !== undefined)
          upcoming.push({
            title: event.title,
            date: event.date,
            instant,
            time: event.time,
            timezone: event.timezone,
            mode: 'draft',
            dataProblem:
              league?.connectionMode === 'snapshot'
                ? 'Calendar events need provider access. Use a saved-data report schedule for this manual import.'
                : undefined,
            savedData: false,
          });
      }
    }
  upcoming.sort((a, b) => a.instant - b.instant);
  const next = upcoming[0];
  const lastRun = scheduledRuns.find(
    (run) => !league || run.leagueResults?.some((result) => result.leagueId === league.id),
  );
  return (
    <section className="action-inbox" aria-label="Commissioner next actions">
      <article>
        <p className="section-overline">WAITING FOR YOU</p>
        <h3>
          {draftCount} {draftCount === 1 ? 'draft' : 'drafts'} to review
        </h3>
        <p>
          {draftCount
            ? 'Read and edit before choosing a destination.'
            : 'Your review queue is clear.'}
        </p>
        <button type="button" className="text-button" onClick={onReview}>
          Open reports →
        </button>
      </article>
      <article>
        <p className="section-overline">NEXT REPORT</p>
        <h3>
          {next?.dataProblem ? 'Report needs league data' : (next?.title ?? 'No upcoming report')}
        </h3>
        <p>
          {next?.dataProblem
            ? next.dataProblem
            : next
              ? `${next.date} at ${next.time} · ${next.timezone} · ${next.savedData ? 'Saved-data draft' : next.mode === 'automatic' ? 'Automatic delivery' : 'Draft for review'}`
              : 'Choose a schedule or generate a draft when needed.'}
        </p>
        {next?.dataProblem && (
          <small>
            {next.title} · {next.date} at {next.time} · {next.timezone}
          </small>
        )}
        {lastRun?.status === 'failed' && <p role="status">Latest job needs attention.</p>}
        <button type="button" className="text-button" onClick={onSchedule}>
          Review schedule →
        </button>
      </article>
      <article>
        <p className="section-overline">LEAGUE DATA</p>
        <h3>
          {league?.connectionMode === 'snapshot'
            ? 'Manual league snapshot'
            : !league
              ? 'Connect your league'
              : freshness === 'fresh'
                ? 'League data is up to date'
                : freshness === 'stale'
                  ? 'Refresh recommended'
                  : 'Last update unknown'}
        </h3>
        <p>
          {league?.connectionMode === 'snapshot'
            ? 'Reimport to update this league. Import time does not verify the provider’s update time.'
            : (league?.lastSyncError ?? 'Reports use the latest saved league data.')}
        </p>
        <button type="button" className="text-button" disabled={!league} onClick={onRefresh}>
          {league?.connectionMode === 'snapshot' ? 'Import updated roster →' : 'Refresh league →'}
        </button>
      </article>
      <article>
        <p className="section-overline">DELIVERY</p>
        <h3>{issueCount ? `${issueCount} need attention` : 'No delivery issues'}</h3>
        <p>
          {issueCount
            ? 'Check failed or unknown outcomes before retrying.'
            : 'Sent reports and provider receipts stay in Reports.'}
        </p>
        <button type="button" className="text-button" onClick={onReview}>
          Check delivery →
        </button>
      </article>
    </section>
  );
}
