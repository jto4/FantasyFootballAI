import { describe, expect, it, vi, afterEach } from 'vitest';
import { getYahooAccessToken, parseYahooClientCredentials } from './yahoo-token.js';

describe('Yahoo token lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps existing manually stored access tokens working', async () => {
    const readCredential = vi.fn(async () => 'legacy-access-token');
    const saveCredential = vi.fn();
    await expect(
      getYahooAccessToken({ readCredential, saveCredential }, 'http://localhost/callback'),
    ).resolves.toBe('legacy-access-token');
    expect(saveCredential).not.toHaveBeenCalled();
  });

  it('returns an unexpired OAuth token without a network request', async () => {
    const now = 1_800_000_000_000;
    const readCredential = vi.fn(async (provider: 'yahoo' | 'yahoo-oauth-client') =>
      provider === 'yahoo'
        ? JSON.stringify({
            accessToken: 'current',
            refreshToken: 'refresh',
            expiresAt: now + 300_000,
          })
        : null,
    );
    const saveCredential = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(
      getYahooAccessToken({ readCredential, saveCredential }, 'http://localhost/callback', now),
    ).resolves.toBe('current');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refreshes expired credentials and saves a rotated refresh token', async () => {
    const now = 1_800_000_000_000;
    const vaultValues = new Map([
      [
        'yahoo',
        JSON.stringify({ accessToken: 'expired', refreshToken: 'old-refresh', expiresAt: now - 1 }),
      ],
      ['yahoo-oauth-client', JSON.stringify({ clientId: 'client', clientSecret: 'secret' })],
    ]);
    const readCredential = vi.fn(
      async (provider: 'yahoo' | 'yahoo-oauth-client') => vaultValues.get(provider) ?? null,
    );
    const saveCredential = vi.fn(async (_provider: 'yahoo', value: string) => {
      vaultValues.set('yahoo', value);
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      getYahooAccessToken({ readCredential, saveCredential }, 'http://localhost/callback', now),
    ).resolves.toBe('new-access');
    expect(JSON.parse(vaultValues.get('yahoo')!)).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: now + 3_600_000,
    });
  });

  it('validates stored OAuth client credentials without echoing malformed values', () => {
    expect(parseYahooClientCredentials('bad json')).toBeNull();
    expect(
      parseYahooClientCredentials(JSON.stringify({ clientId: 'id', clientSecret: 'secret' })),
    ).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
    });
  });
});
