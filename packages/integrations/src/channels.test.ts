import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BlueBubblesChannel,
  fetchBlueBubblesMessages,
  imessageAvailability,
  isBlueBubblesConfigured,
  ResendChannel,
  sendResendTestEmail,
  TwilioChannel,
  TwilioConversationsChannel,
  fetchTwilioConversationMessages,
  verifyTwilioCredentials,
} from './channels.js';

describe('Twilio SMS delivery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends an authenticated form request and returns the provider receipt', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: 'SM123' })));
    vi.stubGlobal('fetch', fetch);

    const result = await new TwilioChannel('AC123', 'twilio-secret', '+15555550100').send({
      to: '+15555550101',
      body: 'League update',
    });

    expect(result.providerMessageId).toBe('SM123');
    const [endpoint, request] = fetch.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toContain('/Accounts/AC123/Messages.json');
    expect(request.redirect).toBe('error');
    expect(new Headers(request.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('AC123:twilio-secret').toString('base64')}`,
    );
    expect(new URLSearchParams(String(request.body))).toEqual(
      new URLSearchParams({ To: '+15555550101', From: '+15555550100', Body: 'League update' }),
    );
  });

  it('distinguishes a definite provider rejection from an ambiguous delivery', async () => {
    const channel = new TwilioChannel('AC123', 'twilio-secret', '+15555550100');
    const message = { to: '+15555550101', body: 'League update' };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));
    await expect(channel.send(message)).rejects.toMatchObject({ outcomeUncertain: false });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    await expect(channel.send(message)).rejects.toMatchObject({ outcomeUncertain: true });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket closed')));
    await expect(channel.send(message)).rejects.toMatchObject({ outcomeUncertain: true });
  });
});

describe('Twilio Conversations group delivery', () => {
  afterEach(() => vi.unstubAllGlobals());

  const conversationSid = `CH${'a'.repeat(32)}`;

  it('sends an authenticated message to an existing conversation and returns its receipt', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: 'IM123' })));
    vi.stubGlobal('fetch', fetch);

    await expect(
      new TwilioConversationsChannel('AC123', 'twilio-secret').send({
        to: conversationSid,
        body: 'League update',
      }),
    ).resolves.toEqual({ providerMessageId: 'IM123' });
    const [endpoint, request] = fetch.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe(
      `https://conversations.twilio.com/v1/Conversations/${conversationSid}/Messages`,
    );
    expect(request.redirect).toBe('error');
    expect(new Headers(request.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('AC123:twilio-secret').toString('base64')}`,
    );
    expect(new URLSearchParams(String(request.body))).toEqual(
      new URLSearchParams({ body: 'League update' }),
    );
  });

  it('rejects malformed destinations and oversized messages without a network request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const channel = new TwilioConversationsChannel('AC123', 'twilio-secret');

    await expect(channel.send({ to: '+15555550101', body: 'No group SID' })).rejects.toThrow(
      'valid Twilio Conversation SID',
    );
    await expect(channel.send({ to: conversationSid, body: 'x'.repeat(1_601) })).rejects.toThrow(
      '1–1,600 characters',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('marks transient failures as uncertain and provider validation errors as definite', async () => {
    const channel = new TwilioConversationsChannel('AC123', 'twilio-secret');
    const message = { to: conversationSid, body: 'League update' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));
    await expect(channel.send(message)).rejects.toMatchObject({ outcomeUncertain: false });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    await expect(channel.send(message)).rejects.toMatchObject({ outcomeUncertain: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket closed')));
    await expect(channel.send(message)).rejects.toMatchObject({ outcomeUncertain: true });
  });
});

describe('Twilio Conversations history', () => {
  afterEach(() => vi.unstubAllGlobals());

  const accountSid = `AC${'a'.repeat(32)}`;
  const conversationSid = `CH${'b'.repeat(32)}`;

  it('requests one bounded chronological page and skips media-only messages', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [
            {
              sid: `IM${'c'.repeat(32)}`,
              index: 12,
              author: '+15555550111',
              body: 'Hello league',
              date_created: '2026-09-27T16:00:00Z',
            },
            { sid: `IM${'d'.repeat(32)}`, index: 13, author: 'member', body: null },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      fetchTwilioConversationMessages(accountSid, 'auth-token', conversationSid, 4),
    ).resolves.toEqual({
      pageCount: 2,
      lastIndex: 13,
      messages: [
        {
          sid: `IM${'c'.repeat(32)}`,
          index: 12,
          author: '+15555550111',
          body: 'Hello league',
          createdAt: '2026-09-27T16:00:00.000Z',
        },
      ],
    });
    const [endpoint, request] = fetch.mock.calls[0] as [URL, RequestInit];
    expect(endpoint.origin).toBe('https://conversations.twilio.com');
    expect(endpoint.pathname).toBe(`/v1/Conversations/${conversationSid}/Messages`);
    expect(endpoint.searchParams.get('Order')).toBe('asc');
    expect(endpoint.searchParams.get('PageSize')).toBe('100');
    expect(endpoint.searchParams.get('Page')).toBe('4');
    expect(request.redirect).toBe('error');
    expect(new Headers(request.headers).get('authorization')).toBe(
      `Basic ${Buffer.from(`${accountSid}:auth-token`).toString('base64')}`,
    );
  });

  it('rejects untrusted message fields and maps credential errors to safe text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            messages: [
              {
                sid: `IM${'c'.repeat(32)}`,
                index: 0,
                author: 'bad\nname',
                body: 'Injected author',
                date_created: '2026-09-27T16:00:00Z',
              },
            ],
          }),
        ),
      ),
    );
    await expect(
      fetchTwilioConversationMessages(accountSid, 'auth-token', conversationSid, 0),
    ).rejects.toThrow('invalid message');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    await expect(
      fetchTwilioConversationMessages(accountSid, 'auth-token', conversationSid, 0),
    ).rejects.toThrow('Check the account credentials and Conversation SID');
  });
});

describe('Twilio credential verification', () => {
  afterEach(() => vi.unstubAllGlobals());

  const accountSid = `AC${'a'.repeat(32)}`;

  it('checks the account endpoint without creating a message', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"sid":"redacted"}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    await expect(verifyTwilioCredentials(accountSid, 'auth-token')).resolves.toEqual({
      valid: true,
    });
    const [endpoint, request] = fetch.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`);
    expect(request.method).toBe('GET');
    expect(request.redirect).toBe('error');
    expect(request.body).toBeUndefined();
    expect(new Headers(request.headers).get('authorization')).toBe(
      `Basic ${Buffer.from(`${accountSid}:auth-token`).toString('base64')}`,
    );
  });

  it('reports rejected credentials and unavailable service separately', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    await expect(verifyTwilioCredentials(accountSid, 'bad-token')).resolves.toEqual({
      valid: false,
      reason: 'credentials',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network detail')));
    await expect(verifyTwilioCredentials(accountSid, 'auth-token')).resolves.toEqual({
      valid: false,
      reason: 'unavailable',
    });
  });

  it('rejects malformed local settings without making a request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(verifyTwilioCredentials('AC123', 'token')).resolves.toEqual({
      valid: false,
      reason: 'credentials',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Resend email replies', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds the supplied Message-ID as an In-Reply-To header', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'email-123' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    const result = await new ResendChannel('resend-secret', 'bot@example.com').send({
      to: 'league@example.com',
      subject: 'Weekly rankings',
      body: 'Your rankings are in.',
      replyToId: '<original-message@example.com>',
      idempotencyKey: 'report/report-123',
    });

    expect(result.providerMessageId).toBe('email-123');
    const [, request] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      headers: { 'In-Reply-To': '<original-message@example.com>' },
    });
    expect(new Headers(request.headers).get('idempotency-key')).toBe('report/report-123');
  });

  it('marks a provider rejection as retryable but a lost response as uncertain', async () => {
    const channel = new ResendChannel('resend-secret', 'bot@example.com');
    const message = { to: 'league@example.com', subject: 'Weekly rankings', body: 'Draft.' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 422 })));
    await expect(channel.send(message)).rejects.toMatchObject({ outcomeUncertain: false });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 409 })));
    await expect(channel.send(message)).rejects.toMatchObject({ outcomeUncertain: true });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket closed')));
    await expect(channel.send(message)).rejects.toMatchObject({ outcomeUncertain: true });
  });
});

describe('Resend setup email', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a fixed data-free message to only the owner-confirmed recipient', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-test' })));
    vi.stubGlobal('fetch', fetch);

    await sendResendTestEmail(
      'resend-secret',
      'owner@example.com',
      'me@example.net',
      'setup-test-1',
    );

    const [endpoint, request] = fetch.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('https://api.resend.com/emails');
    expect(JSON.parse(String(request.body))).toEqual({
      from: 'owner@example.com',
      to: ['me@example.net'],
      subject: 'Sunday Sidekick email test',
      text: 'Your Resend email connection is working. This test included no league or member data.',
    });
    expect(new Headers(request.headers).get('idempotency-key')).toBe('setup-test-1');
  });
});

describe('BlueBubbles iMessage delivery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts a group-chat message with the server password and returns its receipt', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: { guid: 'message-guid' } })));
    vi.stubGlobal('fetch', fetch);

    const result = await new BlueBubblesChannel(
      'https://messages.example.test',
      'private-pass',
    ).send({
      to: 'iMessage;-;chat-guid',
      body: 'League update',
    });

    expect(result.providerMessageId).toBe('message-guid');
    const [input, request] = fetch.mock.calls[0] as [URL, RequestInit];
    expect(input.pathname).toBe('/api/v1/message/text');
    expect(input.searchParams.get('password')).toBe('private-pass');
    expect(request.redirect).toBe('error');
    expect(JSON.parse(String(request.body))).toEqual({
      chatGuid: 'iMessage;-;chat-guid',
      text: 'League update',
      method: 'private-api',
    });
  });

  it('rejects remote plain HTTP endpoints and URL-embedded secrets', () => {
    expect(() => new BlueBubblesChannel('http://messages.example.test', 'secret')).toThrow(
      'Use HTTPS',
    );
    expect(() => new BlueBubblesChannel('https://user:pass@example.test', 'secret')).toThrow(
      'Use HTTPS',
    );
    expect(() => new BlueBubblesChannel('http://127.0.0.1:1234', 'secret')).not.toThrow();
    expect(
      isBlueBubblesConfigured({ serverUrl: 'https://bb.example.test', serverPassword: 'secret' }),
    ).toBe(true);
    expect(
      isBlueBubblesConfigured({ serverUrl: 'http://bb.example.test', serverPassword: 'secret' }),
    ).toBe(false);
  });

  it('marks rejected sends definite and lost responses uncertain', async () => {
    const channel = new BlueBubblesChannel('http://localhost:1234', 'secret');
    const message = { to: 'chat-guid', body: 'Draft' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));
    await expect(channel.send(message)).rejects.toMatchObject({ outcomeUncertain: false });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection lost')));
    await expect(channel.send(message)).rejects.toMatchObject({ outcomeUncertain: true });
  });

  it('reports availability only after bridge settings are saved', () => {
    expect(imessageAvailability(false).available).toBe(false);
    expect(imessageAvailability(true)).toEqual({ available: true });
  });

  it('reads only a bounded page from the selected chat and normalizes sender metadata', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 200,
          data: [
            {
              guid: 'msg-1',
              text: 'Trade accepted.',
              dateCreated: 1_758_000_000_000,
              isFromMe: false,
              handle: { address: '+15555550123' },
            },
            { guid: '', text: 'bad', dateCreated: 0, isFromMe: false },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);

    const messages = await fetchBlueBubblesMessages(
      'https://bb.example.test',
      'server secret',
      'iMessage;-;chat 1',
      50,
    );

    expect(messages).toEqual([
      {
        guid: 'msg-1',
        text: 'Trade accepted.',
        dateCreated: 1_758_000_000_000,
        isFromMe: false,
        author: '+15555550123',
        isAutoReply: false,
        isSystemMessage: false,
        isServiceMessage: false,
      },
    ]);
    const [url, request] = fetch.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toContain('/api/v1/chat/iMessage%3B-%3Bchat%201/message');
    expect(url.searchParams.get('password')).toBe('server secret');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('sort')).toBe('DESC');
    expect(url.searchParams.get('with')).toBe('handle');
    expect(request.redirect).toBe('error');
  });
});
