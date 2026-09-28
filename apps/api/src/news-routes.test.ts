import express from 'express';
import type { FootballNewsSnapshot } from '@sidekick/integrations';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNewsRouter } from './news-routes.js';

describe('news API routes', () => {
  const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  });

  async function startServer(getNews: (forceRefresh?: boolean) => Promise<FootballNewsSnapshot>) {
    const app = express();
    app.use(createNewsRouter({ getNews }));
    app.use(
      (
        error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res
          .status(503)
          .json({ error: error instanceof Error ? error.message : 'News unavailable.' });
      },
    );
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not bind a port.');
    return `http://127.0.0.1:${address.port}`;
  }

  const snapshot: FootballNewsSnapshot = {
    items: [],
    refreshedAt: '2026-09-28T00:00:00.000Z',
    stale: false,
  };

  it('serves cached news and explicitly forces refresh when requested', async () => {
    const getNews = vi.fn(async () => snapshot);
    const baseUrl = await startServer(getNews);

    const cached = await fetch(`${baseUrl}/api/news`);
    expect(cached.status).toBe(200);
    expect(await cached.json()).toEqual(snapshot);

    const refreshed = await fetch(`${baseUrl}/api/news/refresh`, { method: 'POST' });
    expect(refreshed.status).toBe(200);
    expect(await refreshed.json()).toEqual(snapshot);
    expect(getNews).toHaveBeenNthCalledWith(1);
    expect(getNews).toHaveBeenNthCalledWith(2, true);
  });

  it('passes cache failures to the API error handler', async () => {
    const baseUrl = await startServer(async () => {
      throw new Error('Feed cache unavailable.');
    });

    const response = await fetch(`${baseUrl}/api/news`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Feed cache unavailable.' });
  });
});
