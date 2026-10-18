import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { reportDataProblem, type LeagueConnection } from '@sidekick/core';
import type { LocalStore, ScheduledLeagueResult } from './store.js';
import type { createReportService } from './report-service.js';
import { saveSyncedLeague } from './scheduled-reports.js';

export interface ScheduledRunRetryDependencies {
  store: LocalStore;
  /** Reads the latest league from its provider; must refuse manual snapshot imports. */
  fetchLeague: (league: LeagueConnection) => Promise<LeagueConnection>;
  generateAndSaveReport: ReturnType<typeof createReportService>['generateAndSaveReport'];
}

/** Retries only the failed leagues of a scheduled run, always as dashboard-reviewable drafts. */
export function createScheduledRunRetryRouter(dependencies: ScheduledRunRetryDependencies): Router {
  const router = Router();
  const { store, generateAndSaveReport } = dependencies;
  const retrying = new Set<string>();
  router.post('/api/scheduled-runs/:id/retry', async (req, res) => {
    const original = store.snapshot().scheduledRuns.find((run) => run.id === req.params.id);
    if (!original) return res.status(404).json({ error: 'Scheduled run not found.' });
    const retryAction = store
      .snapshot()
      .settings.actions.find((action) => action.kind === original.kind);
    if (!retryAction)
      return res.status(409).json({ error: 'This run uses an unsupported report type.' });
    const failedResults =
      original.leagueResults?.filter((result) => result.status === 'failed') ?? [];
    if (original.status !== 'failed' || failedResults.length === 0)
      return res.status(409).json({ error: 'This run has no failed league results to retry.' });
    if (retrying.has(original.id))
      return res.status(409).json({ error: 'A retry for this run is already in progress.' });

    retrying.add(original.id);
    const retryRun = {
      id: randomUUID(),
      kind: original.kind,
      startedAt: new Date().toISOString(),
      status: 'running' as const,
      retryOf: original.id,
    };
    await store.update((state) => {
      state.scheduledRuns.unshift(retryRun);
      state.scheduledRuns = state.scheduledRuns.slice(0, 100);
    });

    const outcomes: ScheduledLeagueResult[] = failedResults.map((result) => ({
      ...result,
      detail: 'Retry did not finish; retry this league again after reviewing its status.',
    }));
    async function persistRetryOutcomes(): Promise<void> {
      await store.update((state) => {
        const run = state.scheduledRuns.find((item) => item.id === retryRun.id);
        if (run) run.leagueResults = structuredClone(outcomes);
      });
    }
    const failures: string[] = [];
    try {
      for (const [index, failed] of failedResults.entries()) {
        const league = store.snapshot().leagues.find((item) => item.id === failed.leagueId);
        if (!league) {
          const detail = 'This league is no longer connected.';
          outcomes[index] = { ...failed, detail };
          failures.push(`${failed.displayName}: ${detail}`);
          await persistRetryOutcomes();
          continue;
        }
        const dataProblem = reportDataProblem(
          league,
          retryAction,
          store.settingsSnapshot().leagueStaleAfterHours,
        );
        if (dataProblem) {
          const detail = dataProblem;
          outcomes[index] = { ...failed, detail };
          failures.push(`${failed.displayName}: ${detail}`);
          await persistRetryOutcomes();
          continue;
        }
        let refreshed: LeagueConnection;
        try {
          if (retryAction.dataMode === 'saved') {
            refreshed = structuredClone(league);
          } else {
            const fetched = await dependencies.fetchLeague(league);
            const latest = store.snapshot().leagues.find((l) => l.id === league.id);
            if (
              latest?.connectionMode !== league.connectionMode ||
              latest?.snapshotImportedAt !== league.snapshotImportedAt
            )
              throw new Error('Data source changed.');
            const synced = await saveSyncedLeague(store, fetched);
            if (!synced) throw new Error('League disconnected.');
            refreshed = synced;
          }
          const currentAction = store
            .settingsSnapshot()
            .actions.find((a) => a.kind === retryAction.kind);
          if (
            retryAction.dataMode === 'saved' &&
            (!currentAction ||
              currentAction.dataMode !== 'saved' ||
              reportDataProblem(
                refreshed,
                currentAction,
                store.settingsSnapshot().leagueStaleAfterHours,
              ))
          )
            throw new Error('Saved data policy changed.');
          await generateAndSaveReport(
            refreshed,
            store.reportSnapshot(),
            retryAction.kind,
            false,
            retryAction.dataMode === 'saved' ? 'dashboard' : retryAction.channel,
            undefined,
            undefined,
            retryAction.dataMode,
          );

          outcomes[index] = {
            leagueId: league.id,
            displayName: league.displayName,
            status: 'succeeded',
            detail: 'A new draft is ready for review; no message was sent.',
          };
          await persistRetryOutcomes();
        } catch {
          const detail = 'Check platform access and AI settings, then try again.';
          outcomes[index] = {
            leagueId: league.id,
            displayName: league.displayName,
            status: 'failed',
            detail,
          };
          failures.push(`${league.displayName}: ${detail}`);
          await persistRetryOutcomes();
        }
      }
    } finally {
      const finishedAt = new Date().toISOString();
      await store.update((state) => {
        const run = state.scheduledRuns.find((item) => item.id === retryRun.id);
        if (!run) return;
        run.finishedAt = finishedAt;
        run.status = failures.length ? 'failed' : 'succeeded';
        run.detail = `${outcomes.filter((result) => result.status === 'succeeded').length} retry draft(s) created; ${failures.length} still failed.`;
        run.leagueResults = outcomes;
      });
      retrying.delete(original.id);
    }
    res.status(201).json(store.snapshot().scheduledRuns.find((run) => run.id === retryRun.id));
  });
  return router;
}
