import {
  nextSchedule,
  reportDataProblemAt,
  type AppSettings,
  type LeagueConnection,
} from '@sidekick/core';
import { reportName } from './beginner-flow';
import { schedulePlanLabel } from './SchedulePlan';
import { formatDateTime } from './date-format';
export function HomeStatus({
  settings,
  league,
  aiReady,
  aiChecking,
  onLeagues,
  onAI,
  onSchedules,
  onDelivery,
}: {
  settings: AppSettings;
  league: LeagueConnection | undefined;
  aiReady: boolean;
  aiChecking: boolean;
  onLeagues: () => void;
  onAI: () => void;
  onSchedules: () => void;
  onDelivery: () => void;
}) {
  const scoped = settings.actions.filter(
    (action) =>
      Boolean(league) &&
      action.enabled &&
      action.schedule.enabled &&
      (!action.leagueIds || action.leagueIds.includes(league?.id ?? '')),
  );
  const next = scoped
    .map((action) => ({ action, plan: nextSchedule(action.schedule) }))
    .filter(
      (item) =>
        item.plan.at !== undefined &&
        item.plan.status !== 'missed' &&
        item.plan.status !== 'finished',
    )
    .sort((a, b) => a.plan.at! - b.plan.at!)[0];
  const automatic = settings.actions.filter(
    (action) =>
      action.enabled &&
      action.schedule.enabled &&
      !action.schedule.completedAt &&
      action.mode === 'automatic' &&
      action.channel !== 'dashboard' &&
      action.leagueIds?.length !== 0,
  );
  const dataProblem =
    next && league
      ? reportDataProblemAt(league, next.action, settings.leagueStaleAfterHours, next.plan.at)
      : undefined;
  return (
    <section className="home-status" aria-label="Your league at a glance">
      <h2>Your league at a glance</h2>
      <div>
        <p>
          {league
            ? league.connectionMode === 'snapshot'
              ? `Browser snapshot imported ${formatDateTime(league.snapshotImportedAt ?? league.connectedAt)}. Provider update time is unverified.`
              : `League data last updated ${formatDateTime(league.lastSyncedAt ?? league.connectedAt)}.`
            : 'No league connected yet.'}
        </p>
        <button type="button" className="text-button" onClick={onLeagues}>
          {league ? 'Update league data' : 'Connect a league'}
        </button>
      </div>
      <div>
        <p>
          {aiChecking
            ? 'Checking the report writer…'
            : aiReady
              ? 'Report writer is ready.'
              : 'Report writer needs setup or a connection check.'}
        </p>
        {!aiReady && !aiChecking && (
          <button type="button" className="text-button" onClick={onAI}>
            Fix AI connection
          </button>
        )}
      </div>
      <div>
        <p>
          {next
            ? `${reportName(next.action.kind)} · ${next.action.dataMode === 'saved' ? 'Saved-data draft · ' : ''}${schedulePlanLabel(next.action)}`
            : 'No upcoming report schedule for this league.'}
        </p>
        {dataProblem && <p role="status">{dataProblem}</p>}
        <button type="button" className="text-button" onClick={onSchedules}>
          Manage schedules
        </button>
      </div>
      <div>
        <p>
          {automatic.length || (settings.chatRepliesEnabled && settings.chatRepliesAutoSend)
            ? `${automatic.length} report schedules are set to send automatically${settings.chatRepliesEnabled && settings.chatRepliesAutoSend ? '; automatic chat replies are also on' : ''}.`
            : 'Nothing sends automatically.'}
        </p>
        <button type="button" className="text-button" onClick={onDelivery}>
          Review automatic delivery
        </button>
      </div>
      <small>
        Planned reports need the app running, current league data, and a working AI connection.
        Seasonal reports may pause outside their season.
      </small>
    </section>
  );
}
