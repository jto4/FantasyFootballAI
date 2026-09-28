import { afterEach, describe, expect, it, vi } from 'vitest';
import { YahooOAuthClient } from './yahoo-oauth.js';

describe('Yahoo Fantasy OAuth', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates an out-of-band authorization URL with one-time state', () => {
    const client = new YahooOAuthClient('client-id', 'client-secret', 'oob');
    const url = new URL(client.authorizationUrl('one-time-state'));
    expect(url.origin + url.pathname).toBe('https://api.login.yahoo.com/oauth2/request_auth');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('oob');
    expect(url.searchParams.get('state')).toBe('one-time-state');
  });

  it('exchanges authorization codes for bounded access and refresh tokens', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const client = new YahooOAuthClient('client-id', 'client-secret', 'oob');

    await expect(client.exchangeCode('auth-code')).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresInSeconds: 3600,
    });
    const [url, request] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.login.yahoo.com/oauth2/get_token');
    expect(new Headers(request.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
    );
    expect(new URLSearchParams(String(request.body)).get('grant_type')).toBe('authorization_code');
    expect(new URLSearchParams(String(request.body)).get('code')).toBe('auth-code');
    expect(new URLSearchParams(String(request.body)).get('redirect_uri')).toBe('oob');
  });

  it('uses a rotated refresh token and rejects incomplete token responses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'only-access' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetch);
    const client = new YahooOAuthClient('client-id', 'client-secret', 'oob');

    await expect(client.refresh('old-refresh')).resolves.toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    await expect(client.exchangeCode('code')).rejects.toThrow(
      'Yahoo returned invalid authorization tokens.',
    );
  });
});
