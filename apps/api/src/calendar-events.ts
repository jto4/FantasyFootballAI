import { randomUUID } from 'node:crypto';
import type { LeagueCalendarEvent, LeagueConnection, ReportKind } from '@sidekick/core';
import { connectorFor } from '@sidekick/integrations';
import type { readCredential, saveCredential } from './credentials.js';
import { saveSyncedLeague } from './scheduled-reports.js';
import type { LocalStore, ScheduledLeagueResult } from './store.js';
import { leagueSyncErrorMessage } from './sync-errors.js';
import { retryLeagueFetch } from './sync-retry.js';
import { getYahooAccessToken } from './yahoo-token.js';

export interface CalendarEventDeps {
  store: LocalStore;
  readCredential: typeof readCredential;
  saveCredential: typeof saveCredential;
  yahooRedirectUri: () => string;
  generateAndSaveReport: (
    league: LeagueConnection,
    reports: ReturnType<LocalStore['reportSnapshot']>,
    kind: ReportKind,
    automatic: boolean,
    channel: 'dashboard',
  ) => Promise<unknown>;
}

/**
 * Runs a league-calendar event once: claims it, refreshes the league from its provider, and saves
 * a draft report. Calendar events never send messages; the run record explains any failure.
 */
export async function runLeagueCalendarEvent(
  event: LeagueCalendarEvent,
  deps: CalendarEventDeps,
): Promise<void> {
  const { store, readCredential, saveCredential, yahooRedirectUri, generateAndSaveReport } = deps;
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  let claimed = false;
  await store.update((state) => {
    const savedEvent = state.settings.calendarEvents?.find(
      (candidate) => candidate.id === event.id,
    );
    if (
      !savedEvent ||
      savedEvent.completedAt ||
      savedEvent.leagueId !== event.leagueId ||
      savedEvent.kind !== event.kind ||
      savedEvent.date !== event.date ||
      savedEvent.time !== event.time ||
      savedEvent.timezone !== event.timezone
    )
      return;
    savedEvent.completedAt = startedAt;
    state.scheduledRuns.unshift({
      id: runId,
      kind: event.kind,
      startedAt,
      status: 'running',
      calendarEventId: event.id,
      calendarEventTitle: savedEvent.title,
      leagueResults: [
        {
          leagueId: event.leagueId,
          displayName:
            state.leagues.find((league) => league.id === event.leagueId)?.displayName ??
            'Disconnected league',
          status: 'failed',
          detail:
            'Calendar event was interrupted before completion; retry as a draft after review.',
        },
      ],
    });
    state.scheduledRuns = state.scheduledRuns.slice(0, 100);
    claimed = true;
  });
  if (!claimed) return;
  const leagueResults: ScheduledLeagueResult[] = [];
  let detail: string;
  let failureDetail: string | undefined;
  try {
    const league = store.snapshot().leagues.find((candidate) => candidate.id === event.leagueId);
    if (!league) {
      failureDetail = 'This league is no longer connected.';
      throw new Error(failureDetail);
    }
    if (league.connectionMode === 'snapshot') {
      failureDetail =
        'Calendar reports need provider refresh. For this manual import, use a saved-data report schedule instead.';
      throw new Error(failureDetail);
    }
    const credential =
      league.platform === 'espn'
        ? ((await readCredential('espn')) ?? undefined)
        : league.platform === 'yahoo'
          ? ((await getYahooAccessToken({ readCredential, saveCredential }, yahooRedirectUri())) ??
            undefined)
          : undefined;
    let refreshed: LeagueConnection;
    try {
      refreshed = await retryLeagueFetch(
        () => connectorFor(league.platform, credential, league.season).fetchLeague(league.id),
        store.settingsSnapshot().scheduledSyncRetries ?? 0,
      );
    } catch (error) {
      const syncFailure = leagueSyncErrorMessage(error);
      failureDetail = syncFailure;
      await store.update((state) => {
        state.leagues = state.leagues.map((current) =>
          current.id === league.id ? { ...current, lastSyncError: syncFailure } : current,
        );
      });
      throw error;
    }
    const synced = await saveSyncedLeague(store, refreshed);
    if (!synced) throw new Error('This league is no longer connected.');
    refreshed = synced;
    try {
      await generateAndSaveReport(
        refreshed,
        store.reportSnapshot(),
        event.kind,
        false,
        'dashboard',
      );
    } catch {
      failureDetail = 'Report generation failed. Check AI settings and try again.';
      throw new Error(failureDetail);
    }
    leagueResults.push({
      leagueId: league.id,
      displayName: league.displayName,
      status: 'succeeded',
      detail: 'A draft is ready for review; calendar events never send messages.',
    });
    detail = `Created a draft for ${league.displayName}.`;
  } catch (error) {
    const league = store.snapshot().leagues.find((candidate) => candidate.id === event.leagueId);
    const failure =
      failureDetail ??
      (error instanceof Error && error.message === 'This league is no longer connected.'
        ? error.message
        : 'Report generation failed. Check platform access and AI settings, then try again.');
    if (league) {
      leagueResults.push({
        leagueId: league.id,
        displayName: league.displayName,
        status: 'failed',
        detail: failure,
      });
    }
    detail = failure;
  } finally {
    const finishedAt = new Date().toISOString();
    await store.update((state) => {
      const run = state.scheduledRuns.find((candidate) => candidate.id === runId);
      if (!run) return;
      run.finishedAt = finishedAt;
      run.status =
        leagueResults.some((result) => result.status === 'failed') || !leagueResults.length
          ? 'failed'
          : 'succeeded';
      run.detail = detail;
      if (leagueResults.length) run.leagueResults = leagueResults;
    });
  }
}

export async function markMissedLeagueCalendarEvent(
  event: LeagueCalendarEvent,
  missedAt: Date,
  store: Pick<LocalStore, 'update'>,
): Promise<void> {
  const finishedAt = missedAt.toISOString();
  await store.update((state) => {
    const savedEvent = state.settings.calendarEvents?.find(
      (candidate) => candidate.id === event.id,
    );
    if (!savedEvent || savedEvent.completedAt) return;
    savedEvent.completedAt = finishedAt;
    state.scheduledRuns.unshift({
      id: randomUUID(),
      kind: event.kind,
      startedAt: finishedAt,
      finishedAt,
      status: 'failed',
      detail: 'Missed its scheduled local date while the app was stopped; no report was generated.',
      calendarEventId: event.id,
      calendarEventTitle: savedEvent.title,
      leagueResults: [
        {
          leagueId: event.leagueId,
          displayName:
            state.leagues.find((league) => league.id === event.leagueId)?.displayName ??
            'Disconnected league',
          status: 'failed',
          detail:
            'The event date passed while the app was stopped; retry as a draft if still useful.',
        },
      ],
    });
    state.scheduledRuns = state.scheduledRuns.slice(0, 100);
  });
}
