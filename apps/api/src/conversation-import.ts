export interface ImportedMessage {
  author: string;
  text: string;
  timestamp?: string;
}

export interface ConversationMember {
  name: string;
  messages: ImportedMessage[];
}

export interface ConversationImportMerge {
  sourceText: string;
  added: boolean;
}

/** Append a labeled, idempotent source block to an owner-selected local member profile. */
export function mergeConversationImport(
  existingText: string,
  input: {
    digest: string;
    importedAt: string;
    sourceName: string;
    memberName: string;
    messages: string;
  },
): ConversationImportMerge {
  const marker = `[[conversation-import:${input.digest}]]`;
  if (existingText.includes(marker)) return { sourceText: existingText, added: false };
  const block = `${marker}\nImported: ${input.importedAt}\nSource: ${input.sourceName}\nParticipant: ${input.memberName}\n${input.messages}`;
  return {
    sourceText: `${existingText ? `${existingText}\n\n` : ''}${block}`,
    added: true,
  };
}

/** Expire each merged import on its own date while preserving legacy unmarked source text. */
export function pruneConversationImports(
  sourceText: string,
  profileImportedAt: string,
  cutoff: number,
): { sourceText: string; removed: number } {
  const marker = /(?=\[\[conversation-import:[a-f\d]{64}\]\]\n)/gi;
  const blocks = sourceText.split(marker);
  const retained: string[] = [];
  let removed = 0;
  for (const block of blocks) {
    if (!block) continue;
    const importedAt = block.match(
      /^\[\[conversation-import:[a-f\d]{64}\]\]\nImported: ([^\n]+)/i,
    )?.[1];
    const date = importedAt ?? profileImportedAt;
    const timestamp = Date.parse(date);
    if (!Number.isFinite(timestamp) || timestamp >= cutoff) retained.push(block);
    else removed += 1;
  }
  return { sourceText: retained.join('\n\n').trim(), removed };
}

const MAX_MESSAGES = 10_000;
const MAX_MEMBERS = 100;
const authorKeys = [
  'author',
  'sender',
  'from',
  'username',
  'user',
  'participant',
  'handle',
  'name',
];
const textKeys = ['text', 'message', 'body', 'content'];
const timestampKeys = ['timestamp', 'created_at', 'date', 'time', 'ts', 'dateCreated'];

/** Parse common export shapes without evaluating HTML, scripts, or embedded data. */
export function parseConversation(content: string, fallbackName: string): ConversationMember[] {
  const trimmed = content.trim();
  let messages: ImportedMessage[] = [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      messages = messagesFromJson(JSON.parse(trimmed) as unknown, fallbackName.trim());
      if (!messages.length) return [];
    } catch {
      return [];
    }
  }
  if (!messages.length && looksLikeCsv(trimmed))
    messages = messagesFromCsv(trimmed, fallbackName.trim());
  if (!messages.length) messages = messagesFromText(trimmed, fallbackName.trim());

  const groups = new Map<string, ImportedMessage[]>();
  for (const message of messages.slice(0, MAX_MESSAGES)) {
    const author = message.author.trim().slice(0, 100);
    const text = message.text.trim().slice(0, 20_000);
    if (!author || !text) continue;
    const current = groups.get(author) ?? [];
    current.push({ author, text, ...(message.timestamp ? { timestamp: message.timestamp } : {}) });
    groups.set(author, current);
    if (groups.size >= MAX_MEMBERS) break;
  }
  return [...groups].map(([name, memberMessages]) => ({ name, messages: memberMessages }));
}

function messagesFromJson(value: unknown, fallbackName: string): ImportedMessage[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? (Object.values(value as Record<string, unknown>).find(Array.isArray) ?? [])
      : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
    const record = row as Record<string, unknown>;
    const direction = firstString(record, ['direction'])?.toLowerCase();
    const isOutbound = direction?.startsWith('outbound') || direction?.startsWith('sent');
    const author =
      (record.isFromMe === true || isOutbound ? fallbackName : undefined) ??
      firstString(record, authorKeys) ??
      nestedAuthor(record);
    const text = firstString(record, textKeys);
    if (!author || !text) return [];
    const timestamp = firstString(record, timestampKeys);
    return [{ author, text, ...(timestamp ? { timestamp } : {}) }];
  });
}

function nestedAuthor(record: Record<string, unknown>): string | undefined {
  for (const key of authorKeys) {
    const value = record[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = firstString(value as Record<string, unknown>, [
        'username',
        'name',
        'displayName',
        'address',
      ]);
      if (nested) return nested;
    }
  }
  return undefined;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const actualKey =
      Object.keys(record).find(
        (candidate) => normalizedHeader(candidate) === normalizedHeader(key),
      ) ?? key;
    const value = record[actualKey];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function looksLikeCsv(text: string): boolean {
  const header = text.split(/\r?\n/, 1)[0]?.toLowerCase() ?? '';
  return (
    header.includes(',') &&
    authorKeys.some((key) => header.includes(key)) &&
    textKeys.some((key) => header.includes(key))
  );
}

function messagesFromCsv(text: string, fallbackName: string): ImportedMessage[] {
  const rows = parseCsv(text);
  const headers = rows.shift()?.map(normalizedHeader) ?? [];
  const authorIndex = headers.findIndex((header) =>
    authorKeys.some((key) => normalizedHeader(key) === header),
  );
  const textIndex = headers.findIndex((header) =>
    textKeys.some((key) => normalizedHeader(key) === header),
  );
  const timeIndex = headers.findIndex((header) =>
    [...timestampKeys, 'date sent', 'date received'].some(
      (key) => normalizedHeader(key) === header,
    ),
  );
  const directionIndex = headers.findIndex((header) => header === 'direction');
  if (authorIndex < 0 || textIndex < 0) return [];
  return rows.slice(0, MAX_MESSAGES).flatMap((row) => {
    const direction = directionIndex >= 0 ? (row[directionIndex]?.trim().toLowerCase() ?? '') : '';
    const isOutbound = direction.startsWith('outbound') || direction.startsWith('sent');
    const author = isOutbound ? fallbackName : row[authorIndex];
    const body = row[textIndex];
    if (!author || !body) return [];
    return [
      {
        author,
        text: body,
        ...(timeIndex >= 0 && row[timeIndex] ? { timestamp: row[timeIndex] } : {}),
      },
    ];
  });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"' && quoted && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((part) => part.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell);
  if (row.some((part) => part.trim())) rows.push(row);
  return rows;
}

function messagesFromText(text: string, fallbackName: string): ImportedMessage[] {
  const emailFrom = text.match(/^From:\s*(.+)$/im)?.[1]?.trim();
  const emailName =
    emailFrom
      ?.match(/^([^<]+)\s*</)?.[1]
      ?.trim()
      .replace(/^"|"$/g, '') || emailFrom;
  const body = emailBody(text);
  const emailDate = text.match(/^Date:\s*(.+)$/im)?.[1]?.trim();
  const parsedDate = emailDate ? Date.parse(emailDate) : Number.NaN;
  const timestamp = Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : undefined;
  const lines = body.split(/\r?\n/);
  const parsed: ImportedMessage[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*([^:\n]{1,100}):\s+(.+)$/);
    if (match)
      parsed.push({
        author: match[1]!.trim(),
        text: match[2]!.trim(),
        ...(timestamp ? { timestamp } : {}),
      });
  }
  if (parsed.length) return parsed;
  const author = emailName || fallbackName;
  return author && body ? [{ author, text: body, ...(timestamp ? { timestamp } : {}) }] : [];
}

function normalizedHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function emailBody(text: string): string {
  const separator = /\r?\n\r?\n/.exec(text);
  if (!separator || separator.index === undefined) return text;
  const headers = text.slice(0, separator.index);
  if (!/^From:|^Subject:|^Date:/im.test(headers)) return text;
  const body = text.slice(separator.index + separator[0].length).trim();
  const quotedReply = /^(?:On\s+.{1,300}\s+wrote:|[- ]*Original Message[- ]*|_{5,}|>{1,}|--\s*$)/im;
  const quoteAt = quotedReply.exec(body)?.index;
  return (quoteAt === undefined ? body : body.slice(0, quoteAt)).trim();
}
