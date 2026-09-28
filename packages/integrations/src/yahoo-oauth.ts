import { readBoundedJson } from './http.js';

const authorizationEndpoint = 'https://api.login.yahoo.com/oauth2/request_auth';
const tokenEndpoint = 'https://api.login.yahoo.com/oauth2/get_token';

export interface YahooOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

/** Yahoo authorization-code flow for the installed-app, out-of-band grant. */
export class YahooOAuthClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {}

  authorizationUrl(state: string): string {
    const url = new URL(authorizationEndpoint);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return url.toString();
  }

  exchangeCode(code: string): Promise<YahooOAuthTokens> {
    return this.requestTokens({ grant_type: 'authorization_code', code });
  }

  refresh(refreshToken: string): Promise<YahooOAuthTokens> {
    return this.requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async requestTokens(parameters: Record<string, string>): Promise<YahooOAuthTokens> {
    const body = new URLSearchParams({ redirect_uri: this.redirectUri, ...parameters });
    const authorization = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        authorization: `Basic ${authorization}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
    });
    if (!response.ok) throw new Error(`Yahoo authorization failed (${response.status}).`);
    const result = await readBoundedJson<{
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
    }>(response, 256_000);
    if (
      typeof result.access_token !== 'string' ||
      result.access_token.length === 0 ||
      result.access_token.length > 3_500 ||
      typeof result.refresh_token !== 'string' ||
      result.refresh_token.length === 0 ||
      result.refresh_token.length > 3_500
    ) {
      throw new Error('Yahoo returned invalid authorization tokens.');
    }
    const expiry = Number(result.expires_in);
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresInSeconds:
        Number.isFinite(expiry) && expiry > 0 && expiry <= 31_536_000 ? expiry : 3_600,
    };
  }
}
