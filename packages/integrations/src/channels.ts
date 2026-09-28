import type { MessageChannel, OutboundMessage } from '@sidekick/core';
import { readBoundedJson } from './http.js';

export class DeliveryFailure extends Error {
  constructor(
    message: string,
    readonly outcomeUncertain: boolean,
  ) {
    super(message);
    this.name = 'DeliveryFailure';
  }
}

export class ResendChannel implements MessageChannel {
  id = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    if (!message.subject) throw new Error('Email subject is required.');
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          ...(message.idempotencyKey ? { 'idempotency-key': message.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.body,
          ...(message.replyToId ? { headers: { 'In-Reply-To': message.replyToId } } : {}),
        }),
      });
    } catch {
      throw new DeliveryFailure('Resend connection failed; delivery outcome is unknown.', true);
    }
    if (!response.ok)
      throw new DeliveryFailure(
        `Resend delivery failed (${response.status}).`,
        response.status >= 500 || response.status === 409,
      );
    let result: { id?: string };
    try {
      result = await readBoundedJson<{ id?: string }>(response, 256_000);
    } catch {
      throw new DeliveryFailure(
        'Resend accepted the request but returned no usable receipt.',
        true,
      );
    }
    return { providerMessageId: result.id ?? 'accepted' };
  }
}

/** Send only a fixed setup message, never a league report or member context. */
export async function sendResendTestEmail(
  apiKey: string,
  from: string,
  to: string,
  idempotencyKey: string,
): Promise<void> {
  await new ResendChannel(apiKey, from).send({
    to,
    subject: 'Sunday Sidekick email test',
    body: 'Your Resend email connection is working. This test included no league or member data.',
    idempotencyKey,
  });
}

export class TwilioChannel implements MessageChannel {
  id = 'twilio';
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}
  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`;
    const body = new URLSearchParams({ To: message.to, From: this.from, Body: message.body });
    const authorization = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
        headers: {
          authorization: `Basic ${authorization}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    } catch {
      throw new DeliveryFailure('Twilio connection failed; delivery outcome is unknown.', true);
    }
    if (!response.ok)
      throw new DeliveryFailure(
        `Twilio delivery failed (${response.status}).`,
        response.status >= 500,
      );
    let result: { sid?: string };
    try {
      result = await readBoundedJson<{ sid?: string }>(response, 256_000);
    } catch {
      throw new DeliveryFailure(
        'Twilio accepted the request but returned no usable receipt.',
        true,
      );
    }
    return { providerMessageId: result.sid ?? 'accepted' };
  }
}

/** Send into an existing, owner-managed Twilio Conversations group. */
export class TwilioConversationsChannel implements MessageChannel {
  id = 'twilio-conversations';
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
  ) {}
  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    if (!/^CH[0-9a-fA-F]{32}$/.test(message.to))
      throw new DeliveryFailure('Enter a valid Twilio Conversation SID for group delivery.', false);
    if (message.body.length === 0 || message.body.length > 1_600)
      throw new DeliveryFailure(
        'Twilio Conversations messages must contain 1–1,600 characters.',
        false,
      );
    const endpoint = `https://conversations.twilio.com/v1/Conversations/${encodeURIComponent(message.to)}/Messages`;
    const body = new URLSearchParams({ body: message.body });
    const authorization = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
        headers: {
          authorization: `Basic ${authorization}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    } catch {
      throw new DeliveryFailure(
        'Twilio Conversations connection failed; delivery outcome is unknown.',
        true,
      );
    }
    if (!response.ok)
      throw new DeliveryFailure(
        `Twilio Conversations delivery failed (${response.status}).`,
        response.status >= 500,
      );
    let result: { sid?: string };
    try {
      result = await readBoundedJson<{ sid?: string }>(response, 256_000);
    } catch {
      throw new DeliveryFailure(
        'Twilio Conversations accepted the request but returned no usable receipt.',
        true,
      );
    }
    return { providerMessageId: result.sid ?? 'accepted' };
  }
}

export interface TwilioConversationMessage {
  sid: string;
  index: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface TwilioConversationMessagePage {
  messages: TwilioConversationMessage[];
  /** Includes media-only messages, which are intentionally not imported. */
  pageCount: number;
  lastIndex?: number;
}

/** Read one bounded page from an owner-selected Twilio Conversation. */
export async function fetchTwilioConversationMessages(
  accountSid: string,
  authToken: string,
  conversationSid: string,
  page: number,
): Promise<TwilioConversationMessagePage> {
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid)) throw new Error('Invalid Twilio account SID.');
  if (!authToken || authToken.length > 200) throw new Error('Invalid Twilio auth token.');
  if (!/^CH[0-9a-fA-F]{32}$/.test(conversationSid))
    throw new Error('Invalid Twilio Conversation SID.');
  if (!Number.isInteger(page) || page < 0 || page > 1_000_000)
    throw new Error('Invalid Twilio Conversations page cursor.');
  const endpoint = new URL(
    `https://conversations.twilio.com/v1/Conversations/${encodeURIComponent(conversationSid)}/Messages`,
  );
  endpoint.searchParams.set('Order', 'asc');
  endpoint.searchParams.set('PageSize', '100');
  endpoint.searchParams.set('Page', String(page));
  const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  let response: Response;
  try {
    response = await fetch(endpoint, {
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
      headers: { authorization: `Basic ${authorization}`, accept: 'application/json' },
    });
  } catch {
    throw new Error('Twilio Conversations could not be reached. Try again later.');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error('Twilio denied access. Check the account credentials and Conversation SID.');
    throw new Error(`Twilio Conversations history could not be read (${response.status}).`);
  }
  const result = await readBoundedJson<{
    messages?: unknown;
  }>(response, 2_000_000);
  if (!Array.isArray(result.messages) || result.messages.length > 100)
    throw new Error('Twilio Conversations returned an invalid message page.');
  const messages = result.messages.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Twilio Conversations returned an invalid message.');
    const row = value as Record<string, unknown>;
    const sid = typeof row.sid === 'string' ? row.sid : '';
    const index = row.index;
    if (
      !/^IM[0-9a-fA-F]{32}$/.test(sid) ||
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 2_147_483_647
    )
      throw new Error('Twilio Conversations returned an invalid message.');
    // Media-only messages remain on Twilio and do not fetch attachments into local storage.
    if (row.body === null || row.body === undefined || row.body === '') return [];
    const author = typeof row.author === 'string' ? row.author : '';
    const body = typeof row.body === 'string' ? row.body : '';
    const createdAt = typeof row.date_created === 'string' ? row.date_created : '';
    if (
      !author.trim() ||
      author.length > 200 ||
      /[\u0000-\u001f\u007f]/.test(author) ||
      typeof row.body !== 'string' ||
      body.length > 1_600 ||
      !createdAt ||
      !Number.isFinite(Date.parse(createdAt))
    )
      throw new Error('Twilio Conversations returned an invalid message.');
    return [{ sid, index, author, body, createdAt: new Date(createdAt).toISOString() }];
  });
  return {
    messages,
    pageCount: result.messages.length,
    ...(result.messages.length > 0
      ? {
          lastIndex: Math.max(
            ...result.messages.map((entry) => (entry as { index: number }).index),
          ),
        }
      : {}),
  };
}

/** Check Twilio credentials without creating a message or spending SMS credit. */
export async function verifyTwilioCredentials(
  accountSid: string,
  authToken: string,
): Promise<{ valid: boolean; reason?: 'credentials' | 'unavailable' }> {
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid) || !authToken.trim() || authToken.length > 256)
    return { valid: false, reason: 'credentials' };

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`;
  const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(8_000),
      redirect: 'error',
      headers: { authorization: `Basic ${authorization}` },
    });
  } catch {
    return { valid: false, reason: 'unavailable' };
  }

  // Do not retain account metadata returned by Twilio; status alone is sufficient.
  await response.body?.cancel().catch(() => undefined);
  if (response.ok) return { valid: true };
  if (response.status === 401 || response.status === 403 || response.status === 404)
    return { valid: false, reason: 'credentials' };
  return { valid: false, reason: 'unavailable' };
}

/** Send through an owner-managed BlueBubbles server; its password is never logged. */
export class BlueBubblesChannel implements MessageChannel {
  id = 'bluebubbles';
  private readonly baseUrl: URL;

  constructor(
    serverUrl: string,
    private readonly serverPassword: string,
  ) {
    this.baseUrl = parseBlueBubblesUrl(serverUrl);
    if (!serverPassword.trim() || serverPassword.length > 4_000)
      throw new Error('BlueBubbles server password is invalid.');
  }

  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const chatGuid = message.to.trim();
    if (!chatGuid || chatGuid.length > 500 || /[\r\n]/.test(chatGuid))
      throw new Error('A valid iMessage chat identifier is required.');
    const endpoint = new URL('/api/v1/message/text', this.baseUrl);
    endpoint.searchParams.set('password', this.serverPassword);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatGuid, text: message.body, method: 'private-api' }),
      });
    } catch {
      throw new DeliveryFailure(
        'BlueBubbles connection failed; delivery outcome is unknown.',
        true,
      );
    }
    if (!response.ok)
      throw new DeliveryFailure(
        `BlueBubbles delivery failed (${response.status}).`,
        response.status >= 500,
      );
    try {
      const result = await readBoundedJson<{
        data?: { guid?: string; message?: { guid?: string } };
      }>(response, 256_000);
      return {
        providerMessageId: result.data?.message?.guid ?? result.data?.guid ?? 'accepted',
      };
    } catch {
      throw new DeliveryFailure(
        'BlueBubbles accepted the request but returned no usable receipt.',
        true,
      );
    }
  }
}

function parseBlueBubblesUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('BlueBubbles server URL must be a valid HTTP or HTTPS URL.');
  }
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (url.protocol === 'http:' && !loopbackHosts.has(url.hostname)) ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Use HTTPS for BlueBubbles, or HTTP only for a loopback server.');
  return url;
}

export interface BlueBubblesMessage {
  guid: string;
  text: string;
  dateCreated: number;
  isFromMe: boolean;
  author?: string;
  isAutoReply: boolean;
  isSystemMessage: boolean;
  isServiceMessage: boolean;
}

/** Fetch only a bounded page from the one chat selected by the owner. */
export async function fetchBlueBubblesMessages(
  serverUrl: string,
  serverPassword: string,
  chatGuid: string,
  limit = 200,
): Promise<BlueBubblesMessage[]> {
  const baseUrl = parseBlueBubblesUrl(serverUrl);
  if (!serverPassword.trim() || serverPassword.length > 4_000)
    throw new Error('BlueBubbles server password is invalid.');
  if (!chatGuid.trim() || chatGuid.length > 500 || /[\r\n]/.test(chatGuid))
    throw new Error('A valid iMessage chat identifier is required.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new Error('BlueBubbles history limit must be between 1 and 200.');

  const endpoint = new URL(`/api/v1/chat/${encodeURIComponent(chatGuid)}/message`, baseUrl);
  endpoint.searchParams.set('password', serverPassword);
  endpoint.searchParams.set('limit', String(limit));
  endpoint.searchParams.set('sort', 'DESC');
  endpoint.searchParams.set('with', 'handle');
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'application/json' },
    });
  } catch {
    throw new Error('BlueBubbles history request failed. Check the server and try again.');
  }
  if (!response.ok) throw new Error(`BlueBubbles history request failed (${response.status}).`);

  let payload: unknown;
  try {
    payload = await readBoundedJson(response, 2_000_000);
  } catch {
    throw new Error('BlueBubbles returned an invalid or oversized message history.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('BlueBubbles returned an invalid message history.');
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) throw new Error('BlueBubbles returned an invalid message history.');

  return data.slice(0, limit).flatMap((item): BlueBubblesMessage[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const message = item as Record<string, unknown>;
    const guid = typeof message.guid === 'string' ? message.guid.slice(0, 300) : '';
    const text = typeof message.text === 'string' ? message.text.slice(0, 20_000) : '';
    const dateCreated = message.dateCreated;
    const isFromMe = message.isFromMe;
    if (
      !guid ||
      !text.trim() ||
      typeof dateCreated !== 'number' ||
      !Number.isFinite(dateCreated) ||
      dateCreated <= 0 ||
      typeof isFromMe !== 'boolean'
    )
      return [];
    const handle = message.handle;
    const author =
      handle && typeof handle === 'object' && !Array.isArray(handle)
        ? (handle as Record<string, unknown>).address
        : undefined;
    return [
      {
        guid,
        text,
        dateCreated,
        isFromMe,
        isAutoReply: message.isAutoReply === true,
        isSystemMessage: message.isSystemMessage === true,
        isServiceMessage: message.isServiceMessage === true,
        ...(typeof author === 'string' && author.trim()
          ? { author: author.trim().slice(0, 200) }
          : {}),
      },
    ];
  });
}

export function isBlueBubblesConfigured(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  if (typeof config.serverUrl !== 'string' || typeof config.serverPassword !== 'string')
    return false;
  try {
    new BlueBubblesChannel(config.serverUrl, config.serverPassword);
    return true;
  } catch {
    return false;
  }
}

export function imessageAvailability(configured: boolean): { available: boolean; reason?: string } {
  if (!configured)
    return {
      available: false,
      reason: 'Configure a BlueBubbles server hosted on a Mac to enable iMessage delivery.',
    };
  return { available: true };
}
