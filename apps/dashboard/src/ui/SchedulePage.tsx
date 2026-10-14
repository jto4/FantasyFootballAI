import type { AppSettings, ScheduledRun } from '@sidekick/core';
import { reportName } from './beginner-flow';
import { formatTime } from './date-format';
import { SchedulePlan } from './SchedulePlan';
import { timezoneLabel } from './timezone-label';

export type { ScheduledRun } from '@sidekick/core';

export function SchedulePage({
  actions,
  scheduledRuns,
  retryingRunId,
  onGenerate,
  generatingKind = '',
  onEditSchedule,
  leagueName,
  onRetry,
  settings,
  onEditAction,
}: {
  actions: AppSettings['actions'];
  scheduledRuns: ScheduledRun[];
  retryingRunId: string;
  onGenerate: (kind: string) => void;
  generatingKind?: string;
  onEditSchedule?: () => void;
  leagueName?: string | undefined;
  onRetry: (run: ScheduledRun) => void;
  settings?: AppSettings;
  onEditAction?: (kind: AppSettings['actions'][number]['kind']) => void;
}) {
  return (
    <>
      <div className="page-title-block">
        <div>
          <p className="section-overline">REPORTING & DELIVERY</p>
          <h1>Schedule</h1>
          <p>
            Choose when reports are created and whether you review them first. Creating a report
            yourself always saves a draft.
          </p>
          {leagueName && (
            <p>
              Selected league: <strong>{leagueName}</strong>
            </p>
          )}
        </div>
        {onEditSchedule && (
          <button type="button" className="primary-button" onClick={onEditSchedule}>
            Set up schedules
          </button>
        )}
      </div>
      <div className="schedule-grid">
        {actions.map((action) => (
          <article className="schedule-card" key={action.kind}>
            <span className="panel-kicker">{action.channel.toUpperCase()}</span>
            <h2>{reportName(action.kind)}</h2>
            <SchedulePlan action={action} />
            {settings && (
              <p>
                Destination:{' '}
                {action.channel === 'dashboard'
                  ? 'Saved draft in Reports'
                  : `${action.channel} · ${action.channel === 'email' ? settings.emailRecipient || 'No recipient chosen' : action.channel === 'sms' ? settings.smsRecipient || 'No recipient chosen' : settings.imessageChatGuid || 'No conversation chosen'}`}
              </p>
            )}
            <p>
              {!action.enabled
                ? 'Action disabled'
                : action.schedule.enabled
                  ? action.schedule.frequency === 'once'
                    ? `Runs once on ${formatScheduleDate(action.schedule.date)} at ${action.schedule.time} · ${timezoneLabel(action.schedule.timezone)}${action.schedule.completedAt ? ' · completed' : ''}`
                    : `Runs ${action.schedule.frequency === 'daily' ? 'daily' : action.schedule.frequency === 'monthly' ? `monthly on day ${action.schedule.dayOfMonth}` : `every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][action.schedule.weekday]}`} at ${action.schedule.time} · ${timezoneLabel(action.schedule.timezone)}`
                  : action.mode === 'automatic'
                    ? 'No schedule · manual generation saves a draft'
                    : 'No automatic schedule · save as a draft'}
            </p>
            <small>
              {action.enabled
                ? action.mode === 'automatic'
                  ? 'Configured channel may send reports automatically.'
                  : 'Scheduled reports wait in the review queue.'
                : 'Enable this action in Settings to schedule it.'}
            </small>
            {(action.kind === 'offseason-update' ||
              action.kind === 'power-rankings' ||
              action.kind === 'matchup-preview') && (
              <small>
                {action.kind === 'offseason-update'
                  ? 'Recurring updates pause while fresh league data shows an active season.'
                  : 'Recurring weekly reports pause when fresh league data marks the season complete.'}
              </small>
            )}
            <button
              className="text-button"
              disabled={Boolean(generatingKind)}
              onClick={() => onGenerate(action.kind)}
            >
              {generatingKind === action.kind ? 'Generating…' : 'Generate draft'} <span>→</span>
            </button>
            {onEditAction && (
              <button
                type="button"
                className="small-button"
                onClick={() => onEditAction(action.kind)}
              >
                Edit {reportName(action.kind).toLowerCase()} schedule
              </button>
            )}
          </article>
        ))}
      </div>
      <p>
        The next run is a planned time. Keep the local service running and your computer awake.
        League season, stale data, or a connection problem can pause a report.
      </p>
      <div className="section-heading drafts-heading">
        <div>
          <p className="section-overline">JOB HISTORY</p>
          <h2>Recent scheduled runs</h2>
        </div>
      </div>
      <div className="report-list">
        {scheduledRuns.slice(0, 10).map((run) => (
          <article className="report-card" key={run.id}>
            <div>
              <span className={`credential-status ${run.status === 'succeeded' ? 'ready' : ''}`}>
                {run.status.toUpperCase()}
              </span>
              <h3>{run.calendarEventTitle ?? run.kind.replaceAll('-', ' ')}</h3>
              {run.calendarEventTitle && <small>{run.kind.replaceAll('-', ' ')}</small>}
              <p>{run.detail ?? 'Scheduled job is running.'}</p>
              {run.leagueResults && run.leagueResults.length > 0 && (
                <ul className="scheduled-league-results">
                  {run.leagueResults.map((result) => (
                    <li key={result.leagueId}>
                      <span
                        className={`credential-status ${result.status === 'succeeded' ? 'ready' : ''}`}
                      >
                        {result.status.toUpperCase()}
                      </span>
                      <span>
                        <strong>{result.displayName}</strong>
                        {result.detail && <small>{result.detail}</small>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {run.status === 'failed' &&
                run.leagueResults?.some((result) => result.status === 'failed') && (
                  <button
                    className="small-button"
                    disabled={Boolean(retryingRunId)}
                    onClick={() => onRetry(run)}
                  >
                    {retryingRunId === run.id ? 'Retrying…' : 'Retry failed as drafts'}
                  </button>
                )}
              <small>{formatTime(run.startedAt)}</small>
            </div>
          </article>
        ))}
        {scheduledRuns.length === 0 && (
          <div className="empty-activity">Scheduled runs will appear here after a job runs.</div>
        )}
      </div>
    </>
  );
}

function formatScheduleDate(value?: string): string {
  if (!value) return 'an unset date';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00.000Z`));
}
