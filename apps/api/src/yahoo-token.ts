import { YahooOAuthClient } from '@sidekick/integrations';

type YahooTokenCredential = { accessToken: string; refreshToken: string; expiresAt: number };
type YahooClientCredentials = { clientId: string; clientSecret: string };
interface YahooCredentialVault {
  readCredential(provider: 'yahoo' | 'yahoo-oauth-client'): Promise<string | null>;
  saveCredential(provider: 'yahoo', value: string): Promise<void>;
}

/** Keep legacy pasted access tokens usable while refreshing OAuth tokens before expiry. */
export async function getYahooAccessToken(
  vault: YahooCredentialVault,
  redirectUri: string,
  now = Date.now(),
): Promise<string | null> {
  const stored = await vault.readCredential('yahoo');
  if (!stored) return null;
  const token = parseYahooToken(stored);
  if (!token) return stored;
  if (token.expiresAt > now + 60_000) return token.accessToken;

  const credentials = parseYahooClientCredentials(await vault.readCredential('yahoo-oauth-client'));
  if (!credentials) return token.accessToken;
  try {
    const refreshed = await new YahooOAuthClient(
      credentials.clientId,
      credentials.clientSecret,
      redirectUri,
    ).refresh(token.refreshToken);
    await vault.saveCredential(
      'yahoo',
      JSON.stringify({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: now + refreshed.expiresInSeconds * 1000,
      } satisfies YahooTokenCredential),
    );
    return refreshed.accessToken;
  } catch {
    throw new Error('Yahoo token refresh failed. Reconnect Yahoo from Settings.');
  }
}

export function parseYahooClientCredentials(value: string | null): YahooClientCredentials | null {
  try {
    const parsed = value ? (JSON.parse(value) as Record<string, unknown>) : undefined;
    if (
      typeof parsed?.clientId === 'string' &&
      typeof parsed.clientSecret === 'string' &&
      parsed.clientId.length > 0 &&
      parsed.clientSecret.length > 0
    ) {
      return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
    }
  } catch {
    // Malformed keychain entries must not be interpreted as client credentials.
  }
  return null;
}

function parseYahooToken(value: string): YahooTokenCredential | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof parsed.accessToken === 'string' &&
      parsed.accessToken.length > 0 &&
      typeof parsed.refreshToken === 'string' &&
      parsed.refreshToken.length > 0 &&
      typeof parsed.expiresAt === 'number' &&
      Number.isFinite(parsed.expiresAt)
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresAt: parsed.expiresAt,
      };
    }
  } catch {
    // A non-JSON string is a legacy OAuth access token.
  }
  return null;
}
