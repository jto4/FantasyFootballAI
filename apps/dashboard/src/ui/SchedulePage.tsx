import { FileText } from 'lucide-react';
import type { AppSettings, SavedReport } from '@sidekick/core';
import { formatTime } from './date-format';
import { reportBodyParts } from './report-body';

export type ScheduledRun = {
  id: string;
  kind: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'succeeded' | 'failed';
  detail?: string;
  calendarEventId?: string;
  calendarEventTitle?: string;
  leagueResults?: Array<{
    leagueId: string;
    displayName: string;
    status: 'succeeded' | 'failed' | 'skipped';
    detail?: string;
  }>;
  retryOf?: string;
};

export function SchedulePage({
  actions,
  reports,
  scheduledRuns,
  retryingRunId,
  onGenerate,
  onRetry,
  onSend,
}: {
  actions: AppSettings['actions'];
  reports: SavedReport[];
  scheduledRuns: ScheduledRun[];
  retryingRunId: string;
  onGenerate: (kind: string) => void;
  onRetry: (run: ScheduledRun) => void;
  onSend: (reportId: string) => void;
}) {
  return (
    <>
      <div className="page-title-block">
        <div>
          <p className="section-overline">REPORTING & DELIVERY</p>
          <h1>Schedule & drafts</h1>
          <p>Automatic jobs create reviewable drafts. Sending follows the policies in Settings.</p>
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
                    : `Runs ${action.schedule.frequency === 'daily' ? 'daily' : `every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][action.schedule.weekday]}`} at ${action.schedule.time} · ${action.schedule.timezone}`
                  : action.mode === 'automatic'
                    ? 'No schedule · automatic delivery when generated'
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
            <button className="text-button" onClick={() => onGenerate(action.kind)}>
              Generate now <span>→</span>
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
      <div className="section-heading drafts-heading">
        <div>
          <p className="section-overline">READY FOR REVIEW</p>
          <h2>Recent reports</h2>
        </div>
      </div>
      <div className="report-list">
        {reports.map((report) => (
          <article className="report-card" key={report.id}>
            <div>
              <span className="credential-status ready">{report.status.toUpperCase()}</span>
              {report.deliveryAttempts?.at(-1) && (
                <small className="delivery-history">
                  {report.deliveryAttempts.length} delivery attempt
                  {report.deliveryAttempts.length === 1 ? '' : 's'} ·{' '}
                  {report.deliveryAttempts.at(-1)?.status}
                  {report.deliveryAttempts.at(-1)?.providerMessageId
                    ? ` · ${report.deliveryAttempts.at(-1)?.providerMessageId}`
                    : ''}
                </small>
              )}
              {report.deliveryState === 'uncertain' && (
                <p className="delivery-warning" role="status">
                  Delivery outcome unknown. Check provider history before retrying.
                </p>
              )}
              {report.deliveryState === 'failed' && (
                <p className="delivery-failed" role="status">
                  Provider rejected the send. Fix its settings before retrying.
                </p>
              )}
              <h3>{report.title}</h3>
              {report.kind === 'chat-reply' && (
                <small className="delivery-history">GROUP CHAT REPLY · REVIEW BEFORE SENDING</small>
              )}
              {report.aiUsage ? (
                <small className="ai-usage">
                  {report.aiUsage.model} · {report.aiUsage.inputTokens.toLocaleString()} input +{' '}
                  {report.aiUsage.outputTokens.toLocaleString()} output tokens
                  {report.aiUsage.estimatedCostUsd !== undefined
                    ? ` · ~$${report.aiUsage.estimatedCostUsd.toFixed(6)} USD`
                    : ' · cost estimate unavailable; enter both token rates in AI settings'}
                </small>
              ) : (
                <small className="ai-usage">Token usage unavailable from this AI runtime.</small>
              )}
              <p>
                {reportBodyParts(report.body, report.citations).map((part, index) =>
                  part.kind === 'citation' ? (
                    <a
                      key={`${part.url}-${index}`}
                      href={part.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {part.title} ↗
                    </a>
                  ) : (
                    <span key={`text-${index}`}>{part.value}</span>
                  ),
                )}
              </p>
            </div>
            {report.status === 'draft' && report.deliveryState !== 'sending' && (
              <button className="small-button" onClick={() => onSend(report.id)}>
                {report.deliveryState === 'uncertain'
                  ? 'Check & retry…'
                  : report.deliveryState === 'failed'
                    ? 'Retry send'
                    : report.kind === 'chat-reply'
                      ? 'Send to group'
                      : 'Send now'}
              </button>
            )}
            {report.deliveryState === 'sending' && (
              <span className="delivery-pending">Delivery in progress…</span>
            )}
          </article>
        ))}
        {reports.length === 0 && (
          <div className="empty-state">
            <FileText size={22} />
            <strong>No reports yet.</strong>
            <p>Generate a draft from your league desk.</p>
          </div>
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
