import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { LocalStore } from './store.js';
import {
  isValidProjectionSourceUrl,
  normalizeProjectionSourceName,
  parseProjectionCsv,
  projectionSourceId,
  summarizeProjectionSources,
} from './projections.js';

export interface ProjectionRouteDependencies {
  store: Pick<LocalStore, 'snapshot' | 'update'>;
}

/** Keep projection import limits and replacement rules together with their input validation. */
export function createProjectionRouter(dependencies: ProjectionRouteDependencies): Router {
  const router = Router();
  const { store } = dependencies;

  router.get('/api/projections', (_req, res) => {
    res.json(summarizeProjectionSources(store.snapshot().playerProjections));
  });

  router.post('/api/projections/import', async (req, res) => {
    const body = req.body as {
      leagueId?: unknown;
      sourceName?: unknown;
      sourceUrl?: unknown;
      scoringMatched?: unknown;
      csv?: unknown;
    } | null;
    const leagueId = typeof body?.leagueId === 'string' ? body.leagueId.trim() : '';
    const sourceName = typeof body?.sourceName === 'string' ? body.sourceName.trim() : '';
    if (body?.sourceUrl !== undefined && typeof body.sourceUrl !== 'string')
      return res.status(400).json({ error: 'Source URL must be text.' });
    const sourceUrl =
      typeof body?.sourceUrl === 'string' && body.sourceUrl.trim()
        ? body.sourceUrl.trim()
        : undefined;
    if (!store.snapshot().leagues.some((league) => league.id === leagueId))
      return res
        .status(404)
        .json({ error: 'Choose a connected league before importing projections.' });
    if (!sourceName || sourceName.length > 100 || /[\u0000-\u001f\u007f]/.test(sourceName))
      return res.status(400).json({ error: 'Enter a valid projection source name.' });
    if (!isValidProjectionSourceUrl(sourceUrl))
      return res.status(400).json({
        error: 'Source URL must be public HTTPS without credentials, query, or fragment.',
      });
    if (typeof body?.scoringMatched !== 'boolean')
      return res.status(400).json({
        error: "Confirm whether the projection point values match this league's scoring.",
      });
    if (typeof body?.csv !== 'string')
      return res.status(400).json({ error: 'Choose a projection CSV file.' });
    let parsed: ReturnType<typeof parseProjectionCsv>;
    try {
      parsed = parseProjectionCsv(body.csv);
    } catch (error) {
      return res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Invalid projection CSV.' });
    }
    const sameSource = (projection: { leagueId: string; sourceName: string; sourceUrl?: string }) =>
      projection.leagueId === leagueId &&
      normalizeProjectionSourceName(projection.sourceName) ===
        normalizeProjectionSourceName(sourceName) &&
      (projection.sourceUrl ?? '') === (sourceUrl ?? '');
    const importedAt = new Date().toISOString();
    let sourceLimitExceeded = false;
    await store.update((state) => {
      const existingSource = state.playerProjections.find(sameSource);
      const sourceIds = new Set(
        state.playerProjections
          .filter((projection) => projection.leagueId === leagueId)
          .map(projectionSourceId),
      );
      if (!existingSource && sourceIds.size >= 8) {
        sourceLimitExceeded = true;
        return;
      }
      const sourceId = existingSource ? projectionSourceId(existingSource) : randomUUID();
      const projections = parsed.map((row) => ({
        id: randomUUID(),
        leagueId,
        sourceId,
        scoringMatched: body.scoringMatched as boolean,
        ...row,
        sourceName,
        ...(sourceUrl ? { sourceUrl } : {}),
        importedAt,
      }));
      state.playerProjections = [
        ...state.playerProjections.filter((projection) => !sameSource(projection)),
        ...projections,
      ];
    });
    if (sourceLimitExceeded)
      return res.status(409).json({
        error:
          'A league can keep at most 8 projection sources. Delete a source before adding another.',
      });
    res.status(201).json({ imported: parsed.length, sourceName, importedAt });
  });

  router.delete('/api/projections/:leagueId/source/:sourceId', async (req, res) => {
    await store.update((state) => {
      state.playerProjections = state.playerProjections.filter(
        (projection) =>
          projection.leagueId !== req.params.leagueId ||
          projectionSourceId(projection) !== req.params.sourceId,
      );
    });
    res.status(204).end();
  });

  router.delete('/api/projections/:leagueId', async (req, res) => {
    await store.update((state) => {
      state.playerProjections = state.playerProjections.filter(
        (projection) => projection.leagueId !== req.params.leagueId,
      );
    });
    res.status(204).end();
  });

  return router;
}
