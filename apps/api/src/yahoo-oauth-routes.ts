import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { YahooOAuthClient } from '@sidekick/integrations';
import { getYahooAccessToken, parseYahooClientCredentials } from './yahoo-token.js';

type YahooCredential = 'yahoo' | 'yahoo-oauth-client';

interface YahooOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

interface YahooOAuthClientLike {
  authorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<YahooOAuthTokens>;
}

export interface YahooOAuthRouteDependencies {
  readCredential(provider: YahooCredential): Promise<string | null>;
  saveCredential(provider: YahooCredential, value: string): Promise<void>;
  removeCredential(provider: YahooCredential): Promise<void>;
  createOAuthClient?: (
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ) => YahooOAuthClientLike;
}

const redirectUri = 'oob';

/** Owns Yahoo's short-lived OAuth state so connection routes stay separate from API startup. */
export function createYahooOAuthRouter(dependencies: YahooOAuthRouteDependencies): Router {
  const router = Router();
  const createClient =
    dependencies.createOAuthClient ??
    ((clientId, clientSecret, uri) => new YahooOAuthClient(clientId, clientSecret, uri));
  let pendingAuthorization:
    { state: string; redirectUri: typeof redirectUri; expiresAt: number } | undefined;

  router.get('/api/yahoo/oauth/status', async (_req, res) => {
    let appCredentials: string | null;
    try {
      appCredentials = await dependencies.readCredential('yahoo-oauth-client');
    } catch {
      return res
        .status(503)
        .json({ error: 'The operating system credential store is unavailable.' });
    }
    let authorized = false;
    let requiresReconnect = false;
    try {
      authorized = Boolean(await getYahooAccessToken(dependencies, redirectUri));
    } catch {
      requiresReconnect = true;
    }
    res.json({
      clientConfigured: Boolean(parseYahooClientCredentials(appCredentials)),
      authorized,
      requiresReconnect,
      redirectUri,
    });
  });

  router.put('/api/yahoo/oauth/client', async (req, res) => {
    const { clientId, clientSecret } = req.body as {
      clientId?: unknown;
      clientSecret?: unknown;
    };
    if (
      typeof clientId !== 'string' ||
      !clientId.trim() ||
      clientId.length > 1_000 ||
      /[\r\n]/.test(clientId) ||
      typeof clientSecret !== 'string' ||
      !clientSecret.trim() ||
      clientSecret.length > 7_000 ||
      /[\r\n]/.test(clientSecret)
    ) {
      return res.status(400).json({ error: 'Enter a valid Yahoo client ID and client secret.' });
    }
    try {
      await dependencies.saveCredential(
        'yahoo-oauth-client',
        JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      );
      return res.status(204).end();
    } catch {
      return res
        .status(503)
        .json({ error: 'The operating system credential store is unavailable.' });
    }
  });

  router.delete('/api/yahoo/oauth/client', async (_req, res) => {
    pendingAuthorization = undefined;
    try {
      await dependencies.removeCredential('yahoo-oauth-client');
      return res.status(204).end();
    } catch {
      return res
        .status(503)
        .json({ error: 'The operating system credential store is unavailable.' });
    }
  });

  router.delete('/api/yahoo/oauth/token', async (_req, res) => {
    pendingAuthorization = undefined;
    try {
      await dependencies.removeCredential('yahoo');
      return res.status(204).end();
    } catch {
      return res
        .status(503)
        .json({ error: 'The operating system credential store is unavailable.' });
    }
  });

  router.get('/api/yahoo/oauth/start', async (_req, res) => {
    let credentials;
    try {
      credentials = parseYahooClientCredentials(
        await dependencies.readCredential('yahoo-oauth-client'),
      );
    } catch {
      return res
        .status(503)
        .json({ error: 'The operating system credential store is unavailable.' });
    }
    if (!credentials)
      return res.status(409).json({ error: 'Save your Yahoo developer client credentials first.' });
    const state = randomBytes(32).toString('base64url');
    pendingAuthorization = { state, redirectUri, expiresAt: Date.now() + 600_000 };
    const oauth = createClient(credentials.clientId, credentials.clientSecret, redirectUri);
    return res.json({ authorizationUrl: oauth.authorizationUrl(state), state });
  });

  router.post('/api/yahoo/oauth/complete', async (req, res) => {
    const { state, code } = req.body as { state?: unknown; code?: unknown };
    const pending = pendingAuthorization;
    pendingAuthorization = undefined;
    if (!pending || pending.expiresAt < Date.now() || pending.state !== state)
      return res
        .status(400)
        .json({ error: 'Yahoo authorization expired. Start again from Settings.' });
    if (typeof code !== 'string' || !code.trim() || code.length > 2_000)
      return res.status(400).json({ error: 'Paste the authorization code shown by Yahoo.' });
    try {
      const credentials = parseYahooClientCredentials(
        await dependencies.readCredential('yahoo-oauth-client'),
      );
      if (!credentials) throw new Error('Yahoo client credentials are missing.');
      const token = await createClient(
        credentials.clientId,
        credentials.clientSecret,
        pending.redirectUri,
      ).exchangeCode(code.trim());
      await dependencies.saveCredential(
        'yahoo',
        JSON.stringify({
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: Date.now() + token.expiresInSeconds * 1000,
        }),
      );
      return res.json({ authorized: true });
    } catch {
      return res.status(502).json({
        error:
          'Yahoo authorization failed. Check the app credentials and Fantasy Sports access, then try again.',
      });
    }
  });

  return router;
}
