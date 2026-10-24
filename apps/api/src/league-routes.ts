import express, { Router } from 'express';
import { normalizeEspnLeague } from '@sidekick/integrations';
import { prunePreferences, isLeagueConnection } from '@sidekick/core';
import {
  isValidEspnSeason,
  parseLeagueInput,
  type LeagueCalendarEvent,
  type LeagueConnection,
  type Platform,
} from '@sidekick/core';
import type { LocalStore } from './store.js';

export interface LeagueRouteDependencies {
  store: Pick<LocalStore, 'snapshot' | 'update'>;
  fetchLeague: (platform: Platform, leagueId: string, season?: number) => Promise<LeagueConnection>;
  syncErrorMessage: (error: unknown) => string;
  reconcileCalendar: (events: LeagueCalendarEvent[]) => void;
}

/** Keep authorized league connection, refresh, and disconnect behavior in one router. */
export function createLeagueRouter(dependencies: LeagueRouteDependencies): Router {
  const router = Router();
  const { store } = dependencies;

  router.post(
    '/api/leagues/import/espn',
    express.raw({ type: 'application/octet-stream', limit: '6mb' }),
    async (req, res) => {
      const id = req.query.league,
        season = Number(req.query.season);
      if (
        Object.keys(req.query).some((k) => !['league', 'season'].includes(k)) ||
        typeof id !== 'string' ||
        !/^\d{1,16}$/.test(id) ||
        typeof req.query.season !== 'string' ||
        !isValidEspnSeason(season) ||
        !Buffer.isBuffer(req.body)
      )
        return res
          .status(400)
          .json({ error: 'Choose the ESPN league ID, season and saved JSON file.' });
      try {
        const raw: unknown = JSON.parse(req.body.toString('utf8'));
        if (
          !raw ||
          typeof raw !== 'object' ||
          Array.isArray(raw) ||
          String((raw as { id?: unknown }).id) !== id ||
          (raw as { seasonId?: unknown }).seasonId !== season
        )
          return res
            .status(400)
            .json({ error: 'The file does not match this ESPN league and season.' });
        const source = raw as { teams?: unknown; draftDetail?: { picks?: unknown } };
        if (
          !Array.isArray(source.teams) ||
          source.teams.length > 32 ||
          source.teams.some(
            (t) =>
              t &&
              typeof t === 'object' &&
              Array.isArray(t.roster?.entries) &&
              t.roster.entries.length > 100,
          ) ||
          (Array.isArray(source.draftDetail?.picks) && source.draftDetail.picks.length > 2000)
        )
          return res
            .status(400)
            .json({ error: 'The ESPN file exceeds supported roster or draft limits.' });
        const at = new Date().toISOString();
        const league: LeagueConnection = {
          ...normalizeEspnLeague(raw, id, season, raw),
          connectionMode: 'snapshot',
          snapshotImportedAt: at,
          connectedAt: at,
          status: 'limited',
        };
        if (
          !isLeagueConnection(league) ||
          league.teams.length !== league.teamCount ||
          new Set(league.teams.map((t) => t.id)).size !== league.teamCount
        )
          return res
            .status(400)
            .json({ error: 'This file does not contain a complete, valid ESPN league snapshot.' });
        const owned = league.teams.flatMap((t) => t.roster?.map((p) => p.id) ?? []);
        if (new Set(owned).size !== owned.length)
          return res.status(400).json({
            error:
              'The snapshot contains duplicate player ownership. Save a complete current ESPN response.',
          });
        await store.update((state) => {
          const previous = state.leagues.find((l) => l.id === id);
          league.connectedAt = previous?.connectedAt ?? at;
          league.displayName = previous?.displayName ?? league.displayName;
          state.leagues = [...state.leagues.filter((l) => l.id !== id), league];
          // The app makes its own projections, so ESPN's saved from earlier imports are removed.
          state.playerProjections = state.playerProjections.filter(
            (p) => p.leagueId !== id || !p.sourceId?.startsWith('espn-browser:'),
          );
        });
        return res.status(201).json(league);
      } catch {
        return res.status(400).json({
          error:
            'The ESPN snapshot could not be verified. Save the JSON source from the authorized browser and try again.',
        });
      }
    },
  );
  router.post('/api/leagues', async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
      return res.status(400).json({ error: 'Enter valid league connection details.' });
    const { platform, leagueId, name, season } = req.body as {
      platform?: Platform;
      leagueId?: string;
      name?: string;
      season?: number;
    };
    if (
      !platform ||
      !['sleeper', 'espn', 'yahoo'].includes(platform) ||
      typeof leagueId !== 'string' ||
      !leagueId.trim() ||
      leagueId.trim().length > 2048 ||
      /[\u0000-\u001f\u007f]/.test(leagueId)
    )
      return res.status(400).json({
        error: 'Choose a supported platform and enter a league ID.',
      });
    if (
      name !== undefined &&
      (typeof name !== 'string' || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name))
    )
      return res.status(400).json({ error: 'Custom league names must be at most 120 characters.' });
    if (season !== undefined && (platform !== 'espn' || !isValidEspnSeason(season)))
      return res
        .status(400)
        .json({ error: 'Choose a valid ESPN fantasy season between 2000 and 2099.' });

    try {
      let parsed: ReturnType<typeof parseLeagueInput>;
      try {
        parsed = parseLeagueInput(platform, leagueId);
      } catch (error) {
        return res
          .status(400)
          .json({ error: error instanceof Error ? error.message : 'Invalid league link.' });
      }
      const normalized = await dependencies.fetchLeague(
        platform,
        parsed.leagueId,
        parsed.season ?? season,
      );
      const now = new Date().toISOString();
      // Reconnecting (for example a browser snapshot switching to live refresh) keeps the
      // owner's label and original connection date.
      const existing = store.snapshot().leagues.find((item) => item.id === normalized.id);
      const league: LeagueConnection = {
        ...normalized,
        displayName:
          typeof name === 'string' && name.trim()
            ? name.trim()
            : (existing?.displayName ?? normalized.name),
        connectedAt: existing?.connectedAt ?? now,
        lastSyncedAt: now,
      };
      await store.update((state) => {
        state.leagues = [...state.leagues.filter((item) => item.id !== league.id), league];
      });
      res.status(201).json(league);
    } catch (error) {
      res.status(502).json({ error: dependencies.syncErrorMessage(error) });
    }
  });

  router.post('/api/leagues/:id/refresh', async (req, res) => {
    const current = store.snapshot().leagues.find((item) => item.id === req.params.id);
    if (!current) return res.status(404).json({ error: 'League not found.' });
    if (current.connectionMode === 'snapshot')
      return res.status(409).json({
        error:
          'This league uses a browser snapshot. Import a new ESPN file to update it, or connect a provider session for automatic refresh.',
      });
    try {
      const refreshed = await dependencies.fetchLeague(
        current.platform,
        current.id,
        current.season,
      );
      const lastSyncedAt = new Date().toISOString();
      await store.update((state) => {
        state.leagues = state.leagues.map((item) =>
          item.id === current.id
            ? {
                ...refreshed,
                displayName: item.displayName,
                connectedAt: item.connectedAt,
                lastSyncedAt,
              }
            : item,
        );
      });
      res.json(store.snapshot().leagues.find((item) => item.id === current.id));
    } catch (error) {
      const errorMessage = dependencies.syncErrorMessage(error);
      await store.update((state) => {
        state.leagues = state.leagues.map((item) =>
          item.id === current.id ? { ...item, lastSyncError: errorMessage } : item,
        );
      });
      res.status(502).json({ error: errorMessage });
    }
  });

  router.delete('/api/leagues/:id', async (req, res) => {
    await store.update((state) => {
      state.leagues = state.leagues.filter((league) => league.id !== req.params.id);
      if (state.settings.chatReplyLeagueId === req.params.id)
        delete state.settings.chatReplyLeagueId;
      if (state.leagues.length === 0) {
        state.settings.chatRepliesEnabled = false;
        state.settings.chatRepliesAutoSend = false;
      }
      state.settings.calendarEvents = (state.settings.calendarEvents ?? []).filter(
        (event) => event.leagueId !== req.params.id,
      );
      state.playerProjections = state.playerProjections.filter(
        (projection) => projection.leagueId !== req.params.id,
      );
      // Watchlist entries and nudges for the removed league would otherwise fail every later
      // settings save.
      const pruned = prunePreferences(
        state.settings.preferences,
        new Set(state.leagues.map((league) => league.id)),
      );
      if (pruned) state.settings.preferences = pruned;
    });
    dependencies.reconcileCalendar(store.snapshot().settings.calendarEvents ?? []);
    res.status(204).end();
  });

  return router;
}
