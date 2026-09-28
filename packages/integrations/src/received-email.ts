import { fetchRetryingJson } from './http.js';

export interface ReceivedEmailSummary {
  id: string;
  from: string;
  to: string[];
  subject: string;
  createdAt: string;
  messageId?: string;
}

export interface ReceivedEmail extends ReceivedEmailSummary {
  text: string;
}

const RESEND_API = 'https://api.resend.com';
const EMAIL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LIST_BYTES = 1_000_000;
const MAX_DETAIL_BYTES = 1_000_000;
const MAX_BODY_CHARS = 250_000;

/** Reads only the fixed Resend API origin; redirects are rejected to protect the bearer key. */
export async function listReceivedEmails(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<ReceivedEmailSummary[]> {
  const payload = await fetchRetryingJson<{ data?: unknown }>(
    `${RESEND_API}/emails/receiving?limit=50`,
    { headers: { authorization: `Bearer ${apiKey}` }, redirect: 'error' },
    { fetcher, maxAttempts: 2, timeoutMs: 8_000, maxResponseBytes: MAX_LIST_BYTES },
  );
  if (!payload || !Array.isArray(payload.data))
    throw new Error('Resend returned an invalid inbox.');
  return payload.data.slice(0, 50).map(toSummary);
}

export async function getReceivedEmail(
  apiKey: string,
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<ReceivedEmail> {
  if (!EMAIL_ID.test(id)) throw new Error('Invalid received email ID.');
  const payload = await fetchRetryingJson<unknown>(
    `${RESEND_API}/emails/receiving/${encodeURIComponent(id)}`,
    { headers: { authorization: `Bearer ${apiKey}` }, redirect: 'error' },
    { fetcher, maxAttempts: 2, timeoutMs: 8_000, maxResponseBytes: MAX_DETAIL_BYTES },
  );
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Resend returned an invalid email.');
  const row = payload as Record<string, unknown>;
  const summary = toSummary(row);
  const body = typeof row.text === 'string' && row.text.trim() ? row.text : htmlToText(row.html);
  if (!body.trim()) throw new Error('This received email has no readable text body.');
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_CHARS)
    throw new Error('Received email body exceeds the 250 KB import limit.');
  return { ...summary, text: body.slice(0, MAX_BODY_CHARS) };
}

function toSummary(value: unknown): ReceivedEmailSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Resend returned an invalid email record.');
  const row = value as Record<string, unknown>;
  const id = boundedString(row.id, 100);
  const from = boundedString(row.from, 320);
  const subject = boundedString(row.subject, 500);
  const createdAt = boundedString(row.created_at, 80);
  if (!EMAIL_ID.test(id) || !from || !subject || !Number.isFinite(Date.parse(createdAt)))
    throw new Error('Resend returned an invalid email record.');
  const to = Array.isArray(row.to)
    ? row.to
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 20)
        .map((item) => item.slice(0, 320))
    : [];
  const messageId = typeof row.message_id === 'string' ? row.message_id.slice(0, 500) : undefined;
  return { id, from, to, subject, createdAt, ...(messageId ? { messageId } : {}) };
}

function boundedString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Convert HTML to inert plain text; imported content is never served as markup. */
function htmlToText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<(script|style|head|title|svg|iframe|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>|<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}
