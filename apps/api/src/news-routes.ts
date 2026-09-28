import { Router } from 'express';
import type { FootballNewsSnapshot } from '@sidekick/integrations';

export interface NewsRouteDependencies {
  getNews: (forceRefresh?: boolean) => Promise<FootballNewsSnapshot>;
}

/** Keep the dashboard news API separate from the long-lived runtime and cache setup. */
export function createNewsRouter(dependencies: NewsRouteDependencies): Router {
  const router = Router();

  router.get('/api/news', async (_req, res, next) => {
    try {
      res.json(await dependencies.getNews());
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/news/refresh', async (_req, res, next) => {
    try {
      res.json(await dependencies.getNews(true));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
