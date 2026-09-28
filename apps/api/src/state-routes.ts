import { Router } from 'express';
import type { AppState, DashboardStateSnapshot } from './store.js';
import { summarizeLeagues, summarizeReports } from './mcp-data.js';
import { summarizeProjectionSources } from './projections.js';

export interface StateRouteDependencies {
  snapshot: () => AppState;
  dashboardSnapshot?: () => DashboardStateSnapshot;
}

/** Read-only local state endpoints are kept separate from API startup and background work. */
export function createStateRouter(dependencies: StateRouteDependencies): Router {
  const router = Router();

  router.get('/api/state', (_req, res) => {
    if (dependencies.dashboardSnapshot) return res.json(dependencies.dashboardSnapshot());
    const state = dependencies.snapshot();
    const { playerProjections: _projections, ...dashboardState } = state;
    void _projections;
    res.json({
      ...dashboardState,
      memories: dashboardState.memories.map(({ sourceText, ...profile }) => {
        const publicProfile = { ...profile };
        delete publicProfile.sourceAuthorId;
        return {
          ...publicProfile,
          canMergeImportedConversation: !profile.sourceAuthorId,
          sourceLength: sourceText.length,
        };
      }),
    });
  });

  router.get('/api/projections', (_req, res) => {
    res.json(summarizeProjectionSources(dependencies.snapshot().playerProjections));
  });

  router.get('/api/leagues', (_req, res) => {
    res.json(summarizeLeagues(dependencies.snapshot().leagues));
  });

  router.get('/api/leagues/:id', (req, res) => {
    const league = dependencies.snapshot().leagues.find((item) => item.id === req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found.' });
    res.json(league);
  });

  router.get('/api/reports', (req, res) => {
    const rawLeagueId = req.query.leagueId;
    const rawLimit = req.query.limit;
    if (
      (rawLeagueId !== undefined && typeof rawLeagueId !== 'string') ||
      (rawLimit !== undefined && typeof rawLimit !== 'string')
    )
      return res.status(400).json({ error: 'Invalid report query.' });
    const limit = rawLimit === undefined ? 10 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      return res.status(400).json({ error: 'Report limit must be from 1 to 50.' });
    res.json(summarizeReports(dependencies.snapshot().reports, rawLeagueId, limit));
  });

  router.get('/api/reports/:id', (req, res) => {
    const report = dependencies.snapshot().reports.find((item) => item.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    res.json(report);
  });

  router.get('/api/scheduled-runs', (_req, res) => {
    res.json(dependencies.snapshot().scheduledRuns);
  });

  return router;
}
