import { Router } from 'express';
import type { LeagueConnection } from '@sidekick/core';
import { leagueSyncErrorMessage } from './sync-errors.js';

export interface CredentialHealthRouteDependencies {
  readEspnCredential: () => Promise<string | null>;
  connectedEspnLeague: () => LeagueConnection | undefined;
  verifyEspnLeagueAccess: (league: LeagueConnection, sessionCookie: string) => Promise<void>;
}

/** Credential health checks should validate owner-authorized access without sending a message or changing league data. */
export function createCredentialHealthRouter(
  dependencies: CredentialHealthRouteDependencies,
): Router {
  const router = Router();

  router.post('/api/credentials/espn/test', async (_req, res) => {
    let sessionCookie: string | null;
    try {
      sessionCookie = await dependencies.readEspnCredential();
    } catch {
      return res
        .status(503)
        .json({ error: 'The operating system credential store is unavailable.' });
    }
    if (!sessionCookie)
      return res.status(409).json({ error: 'Save an ESPN session cookie before testing access.' });

    const league = dependencies.connectedEspnLeague();
    if (!league)
      return res.status(409).json({ error: 'Connect an ESPN league before testing access.' });

    try {
      await dependencies.verifyEspnLeagueAccess(league, sessionCookie);
      return res.json({ connected: true, league: league.displayName, season: league.season });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const status = /\b401\b|unauthori[sz]ed|session.*(?:expired|rejected)/i.test(message)
        ? 401
        : /\b403\b|forbidden|access denied/i.test(message)
          ? 403
          : 502;
      return res.status(status).json({ error: leagueSyncErrorMessage(error) });
    }
  });

  return router;
}
