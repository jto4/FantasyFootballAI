import { Router } from 'express';
import type { MemberMemory } from '@sidekick/core';
import { isValidMemberLeagueIds } from './privacy.js';
import type { LocalStore } from './store.js';

export interface MemberMemoryRouteDependencies {
  store: Pick<LocalStore, 'snapshot' | 'update'>;
}

/** Owner controls for profile notes and imported source text stay behind one route boundary. */
export function createMemberMemoryRouter(dependencies: MemberMemoryRouteDependencies): Router {
  const router = Router();
  const { store } = dependencies;

  router.put('/api/memory/:id', async (req, res) => {
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return res.status(400).json({ error: 'Invalid profile fields.' });
    const {
      name,
      styleNotes,
      contextNotes,
      banterPreference,
      avoidTopics,
      includeInReports,
      leagueIds,
    } = body;
    if (
      typeof name !== 'string' ||
      name.trim().length === 0 ||
      name.length > 100 ||
      typeof styleNotes !== 'string' ||
      styleNotes.length > 4000 ||
      typeof contextNotes !== 'string' ||
      contextNotes.length > 4000 ||
      (banterPreference !== undefined &&
        (typeof banterPreference !== 'string' || banterPreference.length > 1000)) ||
      (avoidTopics !== undefined &&
        (typeof avoidTopics !== 'string' || avoidTopics.length > 1000)) ||
      (includeInReports !== undefined && typeof includeInReports !== 'boolean') ||
      !isValidMemberLeagueIds(leagueIds)
    )
      return res.status(400).json({ error: 'Invalid profile fields.' });

    let updated: MemberMemory | undefined;
    await store.update((current) => {
      const profile = current.memories.find((item) => item.id === req.params.id);
      if (!profile) return;
      profile.name = name.trim();
      profile.styleNotes = styleNotes;
      profile.contextNotes = contextNotes;
      if (typeof banterPreference === 'string') profile.banterPreference = banterPreference;
      if (typeof avoidTopics === 'string') profile.avoidTopics = avoidTopics;
      if (typeof includeInReports === 'boolean') profile.includeInReports = includeInReports;
      if (leagueIds === null) delete profile.leagueIds;
      else if (Array.isArray(leagueIds)) profile.leagueIds = leagueIds as string[];
      updated = profile;
    });
    if (!updated) return res.status(404).json({ error: 'Member profile not found.' });
    res.json({ ...updated, sourceText: undefined, sourceAuthorId: undefined });
  });

  router.delete('/api/memory', async (_req, res) => {
    await store.update((current) => {
      current.memories = [];
      delete current.settings.imessageSyncCursor;
    });
    res.status(204).end();
  });

  router.delete('/api/memory/:id', async (req, res) => {
    const found = store.snapshot().memories.some((item) => item.id === req.params.id);
    if (!found) return res.status(404).json({ error: 'Member profile not found.' });
    await store.update((current) => {
      current.memories = current.memories.filter((item) => item.id !== req.params.id);
    });
    res.status(204).end();
  });

  router.get('/api/memory/export', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="sunday-sidekick-memory.json"');
    res.json(
      store.snapshot().memories.map(({ sourceAuthorId: _privateAuthorId, ...profile }) => profile),
    );
  });

  router.get('/api/memory/:id/source', (req, res) => {
    const profile = store.snapshot().memories.find((item) => item.id === req.params.id);
    if (!profile) return res.status(404).json({ error: 'Member profile not found.' });
    res.type('text/plain').send(profile.sourceText);
  });

  return router;
}
