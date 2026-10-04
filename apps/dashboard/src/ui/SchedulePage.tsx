import type { AppSettings, ScheduledRun } from '@sidekick/core';
import { formatTime } from './date-format';

export type { ScheduledRun } from '@sidekick/core';

export function SchedulePage({
  actions,
  scheduledRuns,
  retryingRunId,
  onGenerate,
  generatingKind = '',
  onRetry,
}: {
  actions: AppSettings['actions'];
  scheduledRuns: ScheduledRun[];
  retryingRunId: string;
  onGenerate: (kind: string) => void;
  generatingKind?: string;
  onRetry: (run: ScheduledRun) => void;
}) {
  return (
    <>
      <div className="page-title-block">
        <div>
          <p className="section-overline">REPORTING & DELIVERY</p>
          <h1>Schedule</h1>
          <p>
            Scheduled jobs follow each action’s draft or automatic delivery policy. Manual
            generation always creates a draft.
          </p>
        </div>
      </div>
      <div className="schedule-grid">
        {actions.map((action) => (
          <article className="schedule-card" key={action.kind}>
            <span className="panel-kicker">{action.channel.toUpperCase()}</span>
            <h2>{action.kind.replaceAll('-', ' ')}</h2>
            <p>
              {!action.enabled
                ? 'Action disabled'
                : action.schedule.enabled
                  ? action.schedule.frequency === 'once'
                    ? `Runs once on ${formatScheduleDate(action.schedule.date)} at ${action.schedule.time} · ${action.schedule.timezone}${action.schedule.completedAt ? ' · completed' : ''}`
                    : `Runs ${action.schedule.frequency === 'daily' ? 'daily' : action.schedule.frequency === 'monthly' ? `monthly on day ${action.schedule.dayOfMonth}` : `every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][action.schedule.weekday]}`} at ${action.schedule.time} · ${action.schedule.timezone}`
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
          </article>
        ))}
      </div>
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
