import { randomUUID } from 'node:crypto';
import {
  leaguesForAction,
  reportDataProblem,
  leagueSeasonPhase,
  scheduledReportPhaseSkipReason,
  type ActionSetting,
  type LeagueConnection,
} from '@sidekick/core';
import type { LocalStore } from './store.js';
import type { ScheduledLeagueResult } from './store-types.js';
import type { createReportService } from './report-service.js';
import { retryLeagueFetch } from './sync-retry.js';
import { leagueSyncErrorMessage } from './sync-errors.js';

/** Preserve the latest owner label and the sync timestamp in the evidence passed to generation. */
export async function saveSyncedLeague(
  store: LocalStore,
  fetched: LeagueConnection,
): Promise<LeagueConnection | undefined> {
  let synced: LeagueConnection | undefined;
  const lastSyncedAt = new Date().toISOString();
  await store.update((state) => {
    state.leagues = state.leagues.map((current) => {
      if (current.id !== fetched.id) return current;
      synced = {
        ...fetched,
        displayName: current.displayName,
        connectedAt: current.connectedAt,
        lastSyncedAt,
      };
      return synced;
    });
  });
  return synced;
}

export function createScheduledReportRunner({
  store,
  fetchLeague,
  generateAndSaveReport,
}: {
  store: LocalStore;
  fetchLeague: (league: LeagueConnection) => Promise<LeagueConnection>;
  generateAndSaveReport: ReturnType<typeof createReportService>['generateAndSaveReport'];
}) {
  return async function runScheduledAction(
    action: ActionSetting,
    occurrenceKey?: string,
  ): Promise<void> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    let currentAction: ActionSetting | undefined;
    let claimed = false;
    await store.update((state) => {
      const savedAction = state.settings.actions.find((item) => item.kind === action.kind);
      if (
        !savedAction?.enabled ||
        !savedAction.schedule.enabled ||
        !sameScheduleOccurrence(savedAction, action)
      )
        return;
      if (occurrenceKey && state.scheduledRuns.some((run) => run.occurrenceKey === occurrenceKey))
        return;
      if (action.schedule.frequency === 'once') {
        if (savedAction.schedule.frequency !== 'once' || savedAction.schedule.completedAt) return;
        savedAction.schedule.completedAt = startedAt;
      }
      state.scheduledRuns.unshift({
        id: runId,
        kind: action.kind,
        startedAt,
        status: 'running',
        ...(occurrenceKey ? { occurrenceKey } : {}),
      });
      state.scheduledRuns = state.scheduledRuns.slice(0, 100);
      currentAction = structuredClone(savedAction);
      claimed = true;
    });
    if (!claimed || !currentAction) return;
    const allLeagues = store.snapshot().leagues;
    const selectedLeagueIds = currentAction.leagueIds;
    const leagueIds = leaguesForAction(currentAction, allLeagues).map((league) => league.id);
    const failures: string[] = [];
    const leagueResults: ScheduledLeagueResult[] = [];
    try {
      if (selectedLeagueIds?.length === 0)
        failures.push('No leagues are selected for this scheduled action.');
      else if (selectedLeagueIds && leagueIds.length === 0)
        failures.push('No selected leagues are currently connected.');
      for (const leagueId of leagueIds) {
        const latestState = store.snapshot();
        const league = latestState.leagues.find((item) => item.id === leagueId);
        if (!league) continue;
        const latestAction = latestState.settings.actions.find((item) => item.kind === action.kind);
        if (!latestAction?.enabled || !latestAction.schedule.enabled) break;

        let refreshed: LeagueConnection;
        const dataProblem = reportDataProblem(
          league,
          latestAction,
          latestState.settings.leagueStaleAfterHours,
        );
        if (dataProblem) {
          failures.push(`${league.displayName}: ${dataProblem}`);
          leagueResults.push({
            leagueId: league.id,
            displayName: league.displayName,
            status: 'failed',
            detail: dataProblem,
          });
          continue;
        }
        if (latestAction.dataMode === 'saved') {
          refreshed = structuredClone(league);
        } else {
          try {
            refreshed = await retryLeagueFetch(
              () => fetchLeague(league),
              store.settingsSnapshot().scheduledSyncRetries ?? 0,
            );
            const latest = store.snapshot().leagues.find((l) => l.id === league.id);
            if (
              latest?.connectionMode !== league.connectionMode ||
              latest?.snapshotImportedAt !== league.snapshotImportedAt
            ) {
              leagueResults.push({
                leagueId: league.id,
                displayName: league.displayName,
                status: 'skipped',
                detail: 'The league data source changed during refresh; no report was generated.',
              });
              continue;
            }
            const synced = await saveSyncedLeague(store, refreshed);
            if (!synced) continue;
            refreshed = synced;
          } catch (error) {
            const detail = leagueSyncErrorMessage(error);
            await store.update((state) => {
              state.leagues = state.leagues.map((item) =>
                item.id === league.id ? { ...item, lastSyncError: detail } : item,
              );
            });
            failures.push(`${league.displayName}: ${detail}`);
            leagueResults.push({
              leagueId: league.id,
              displayName: league.displayName,
              status: 'failed',
              detail,
            });
            continue;
          }
        }

        const current = store.settingsSnapshot().actions.find((item) => item.kind === action.kind);
        if (
          !current?.enabled ||
          !current.schedule.enabled ||
          !sameScheduleOccurrence(current, currentAction) ||
          (current.leagueIds !== undefined && !current.leagueIds.includes(league.id))
        ) {
          leagueResults.push({
            leagueId: league.id,
            displayName: league.displayName,
            status: 'skipped',
            detail: 'The schedule or league scope changed during sync; no report was generated.',
          });
          continue;
        }

        if (current.dataMode === 'saved') {
          const latest = store.snapshot().leagues.find((l) => l.id === league.id);
          const issue = latest
            ? reportDataProblem(latest, current, store.settingsSnapshot().leagueStaleAfterHours)
            : 'The league was disconnected.';
          if (
            issue ||
            latest?.snapshotImportedAt !== refreshed.snapshotImportedAt ||
            latest?.lastSyncedAt !== refreshed.lastSyncedAt
          ) {
            leagueResults.push({
              leagueId: league.id,
              displayName: league.displayName,
              status: 'skipped',
              detail:
                issue ??
                'Saved league data changed; wait for the next occurrence or generate a new draft manually.',
            });
            continue;
          }
        }

        const phaseSkip = scheduledReportPhaseSkipReason(
          action.kind,
          leagueSeasonPhase(refreshed),
          action.schedule.frequency,
        );
        if (phaseSkip) {
          leagueResults.push({
            leagueId: refreshed.id,
            displayName: refreshed.displayName,
            status: 'skipped',
            detail: phaseSkip,
          });
          continue;
        }

        try {
          const result =
            current.dataMode === 'saved'
              ? await generateAndSaveReport(
                  refreshed,
                  store.reportSnapshot(),
                  action.kind,
                  false,
                  'dashboard',
                  undefined,
                  undefined,
                  'saved',
                )
              : await generateAndSaveReport(
                  refreshed,
                  store.reportSnapshot(),
                  action.kind,
                  true,
                  action.channel,
                );
          if (result.deliveryError) {
            failures.push(`${league.displayName}: automatic delivery failed; report remains saved`);
            leagueResults.push({
              leagueId: league.id,
              displayName: league.displayName,
              status: 'failed',
              detail: 'Report saved, but automatic delivery failed. Review its delivery status.',
            });
          } else {
            leagueResults.push({
              leagueId: league.id,
              displayName: league.displayName,
              status: 'succeeded',
              ...(current.dataMode === 'saved'
                ? {
                    detail:
                      'Draft created from saved league data; no refresh or delivery was attempted.',
                  }
                : {}),
            });
          }
        } catch {
          const detail = 'Report generation failed. Check AI settings and try again.';
          failures.push(`${league.displayName}: ${detail}`);
          leagueResults.push({
            leagueId: league.id,
            displayName: league.displayName,
            status: 'failed',
            detail,
          });
        }
      }
      if (failures.length) throw new Error(failures.join('; ').slice(0, 1000));
    } finally {
      const finishedAt = new Date().toISOString();
      await store.update((state) => {
        const run = state.scheduledRuns.find((item) => item.id === runId);
        if (!run) return;
        run.finishedAt = finishedAt;
        run.status = failures.length ? 'failed' : 'succeeded';
        if (leagueResults.length) run.leagueResults = leagueResults;
        run.detail = failures.length
          ? failures.join('; ').slice(0, 1000)
          : `${leagueResults.filter((result) => result.status === 'succeeded').length} league(s) processed; ${leagueResults.filter((result) => result.status === 'skipped').length} paused by season phase.`;
      });
    }
  };
}

function sameScheduleOccurrence(current: ActionSetting, scheduled: ActionSetting): boolean {
  const left = current.schedule;
  const right = scheduled.schedule;
  return (
    current.dataMode === scheduled.dataMode &&
    left.frequency === right.frequency &&
    left.weekday === right.weekday &&
    left.dayOfMonth === right.dayOfMonth &&
    left.date === right.date &&
    left.time === right.time &&
    left.timezone === right.timezone
  );
}
