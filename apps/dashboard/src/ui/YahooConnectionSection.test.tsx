import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { YahooConnectionSection } from './YahooConnectionSection.js';

const actions = {
  onClientIdChange: vi.fn(),
  onClientSecretChange: vi.fn(),
  onAuthorizationCodeChange: vi.fn(),
  onSaveClient: vi.fn(),
  onAuthorize: vi.fn(),
  onDisconnect: vi.fn(),
  onCompleteAuthorization: vi.fn(),
  onRetryStatus: vi.fn(),
};

describe('Yahoo connection section', () => {
  it('shows setup guidance and keeps authorization actions unavailable until configured', () => {
    const markup = renderToStaticMarkup(
      createElement(YahooConnectionSection, {
        headingRef: null,
        status: {
          clientConfigured: false,
          authorized: false,
          requiresReconnect: false,
          redirectUri: 'oob',
        },
        statusLoading: false,
        statusError: '',
        clientId: '',
        clientSecret: '',
        authorizationUrl: '',
        authorizationCode: '',
        ...actions,
      }),
    );

    expect(markup).toContain('Yahoo Fantasy connection');
    expect(markup).toContain('NOT CONNECTED');
    expect(markup).toContain('Request Yahoo Fantasy API access');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain('Complete Yahoo connection');
  });

  it('shows the authorization step and reconnect state when Yahoo credentials expire', () => {
    const markup = renderToStaticMarkup(
      createElement(YahooConnectionSection, {
        headingRef: null,
        status: {
          clientConfigured: true,
          authorized: true,
          requiresReconnect: true,
          redirectUri: 'oob',
        },
        statusLoading: false,
        statusError: '',
        clientId: 'client',
        clientSecret: '',
        authorizationUrl: 'https://api.login.yahoo.com/oauth2/request_auth',
        authorizationCode: 'code',
        ...actions,
      }),
    );

    expect(markup).toContain('RECONNECT REQUIRED');
    expect(markup).toContain('Reconnect Yahoo');
    expect(markup).toContain('AUTHORIZATION CODE FROM YAHOO');
    expect(markup).toContain('Complete Yahoo connection');
    expect(markup).toContain('href="https://api.login.yahoo.com/oauth2/request_auth"');
  });

  it('does not report Yahoo as disconnected when status cannot be loaded', () => {
    const markup = renderToStaticMarkup(
      createElement(YahooConnectionSection, {
        headingRef: null,
        status: {
          clientConfigured: false,
          authorized: false,
          requiresReconnect: false,
          redirectUri: 'oob',
        },
        statusLoading: false,
        statusError: 'Could not read Yahoo connection status.',
        clientId: '',
        clientSecret: '',
        authorizationUrl: '',
        authorizationCode: '',
        ...actions,
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Try again');
    expect(markup).not.toContain('NOT CONNECTED');
  });
});
