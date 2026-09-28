import { Router } from 'express';
import {
  isValidEspnSeason,
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
      leagueId.trim().length > 128 ||
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
      const normalized = await dependencies.fetchLeague(platform, leagueId.trim(), season);
      const now = new Date().toISOString();
      const league: LeagueConnection = {
        ...normalized,
        displayName: typeof name === 'string' && name.trim() ? name.trim() : normalized.name,
        connectedAt: now,
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
    });
    dependencies.reconcileCalendar(store.snapshot().settings.calendarEvents ?? []);
    res.status(204).end();
  });

  return router;
}
