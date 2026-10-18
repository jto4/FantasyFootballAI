import {
  reportDataProblemAt,
  nextSchedule,
  type AppSettings,
  type ScheduledRun,
  type LeagueConnection,
} from '@sidekick/core';
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
  manualSnapshot = false,
  league,
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
  manualSnapshot?: boolean;
  league?: LeagueConnection | undefined;
  onRetry: (run: ScheduledRun) => void;
  settings?: AppSettings;
  onEditAction?: (kind: AppSettings['actions'][number]['kind']) => void;
}) {
  const orderedActions = [...actions].sort(
    (a, b) =>
      Number(isActiveSchedule(b)) - Number(isActiveSchedule(a)) ||
      (isActiveSchedule(a)
        ? (nextSchedule(a.schedule).at ?? Infinity) - (nextSchedule(b.schedule).at ?? Infinity) || 0
        : 0),
  );
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
          {manualSnapshot && (
            <p role="note">
              This selected league uses a manual snapshot. Schedule saved-data drafts from a recent
              import, or connect provider access for refreshed reports.
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
        {orderedActions.map((action) => {
          const scheduled = isActiveSchedule(action);
          const automaticSend =
            scheduled && action.mode === 'automatic' && action.channel !== 'dashboard';
          const problem =
            scheduled && league && (!action.leagueIds || action.leagueIds.includes(league.id))
              ? reportDataProblemAt(
                  league,
                  action,
                  settings?.leagueStaleAfterHours,
                  nextSchedule(action.schedule).at,
                )
              : undefined;
          return (
            <article className="schedule-card" key={action.kind}>
              <span className="panel-kicker">
                {scheduled ? (automaticSend ? 'AUTO-SEND' : 'DRAFT SCHEDULE') : 'ON DEMAND'}
              </span>
              <h2>{reportName(action.kind)}</h2>
              <SchedulePlan action={action} />
              {scheduled && timezoneLabel(action.schedule.timezone).startsWith('Local time') && (
                <small>{timezoneLabel(action.schedule.timezone)}</small>
              )}
              {scheduled && (
                <p>
                  {action.dataMode === 'saved'
                    ? `Uses saved league data · draft only${problem ? '' : ` · up to ${settings?.leagueStaleAfterHours ?? 24} hours old`}`
                    : automaticSend
                      ? 'Refreshes the platform and sends automatically.'
                      : 'Refreshes the platform and saves a draft in Reports.'}
                </p>
              )}
              {problem && <p role="status">{problem}</p>}
              {scheduled && settings && action.channel !== 'dashboard' && (
                <p>
                  Destination: {action.channel} ·{' '}
                  {action.channel === 'email'
                    ? settings.emailRecipient || 'No recipient chosen'
                    : action.channel === 'sms'
                      ? settings.smsRecipient || 'No recipient chosen'
                      : settings.imessageChatGuid || 'No conversation chosen'}
                </p>
              )}
              {scheduled &&
                ['offseason-update', 'power-rankings', 'matchup-preview'].includes(action.kind) && (
                  <details className="schedule-rules">
                    <summary>Season rules</summary>
                    <p>
                      {action.kind === 'offseason-update'
                        ? 'Recurring updates pause while the saved league data shows an active season.'
                        : 'Recurring weekly reports pause when the saved league data marks the season complete.'}
                    </p>
                  </details>
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
          );
        })}
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

function isActiveSchedule(action: AppSettings['actions'][number]): boolean {
  return action.enabled && action.schedule.enabled && !action.schedule.completedAt;
}
