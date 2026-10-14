import { sanitizeLogFields } from './logger.js';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileHandle } from 'node:fs/promises';

const MAX_LOG_BYTES = 128 * 1024;
const MAX_LOG_ENTRIES = 200;

export type DiagnosticLogEntry = {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  fields: Record<string, string | number>;
};

/** Read only a bounded tail and return reviewed structured fields, never raw log lines. */
export async function readApiLogTail(
  dataDirectory: string | undefined,
  logFilename = 'api.log',
): Promise<{ available: boolean; entries: DiagnosticLogEntry[] }> {
  if (!dataDirectory) return { available: false, entries: [] };
  if (logFilename !== 'api.log' && logFilename !== 'service.log')
    throw new Error('Unsupported local diagnostic log.');
  const path = join(dataDirectory, 'logs', logFilename);
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, 'r');
    const details = await handle.stat();
    const byteCount = Math.min(details.size, MAX_LOG_BYTES);
    const buffer = Buffer.alloc(byteCount);
    if (byteCount) await handle.read(buffer, 0, byteCount, details.size - byteCount);
    const lines = buffer
      .toString('utf8')
      .split(/\r?\n/)
      .slice(-MAX_LOG_ENTRIES * 2);
    const entries: DiagnosticLogEntry[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (
          typeof parsed.timestamp !== 'string' ||
          !Number.isFinite(Date.parse(parsed.timestamp)) ||
          !['info', 'warn', 'error'].includes(String(parsed.level)) ||
          typeof parsed.event !== 'string' ||
          !/^[a-z][a-z0-9_.-]{0,79}$/.test(parsed.event)
        )
          continue;
        const fields = sanitizeLogFields(parsed);
        entries.push({
          timestamp: new Date(parsed.timestamp).toISOString(),
          level: parsed.level as DiagnosticLogEntry['level'],
          event: parsed.event,
          fields,
        });
      } catch {
        // The tail may start mid-record or contain non-JSON stdout; omit it from diagnostics.
      }
    }
    return { available: true, entries: entries.slice(-MAX_LOG_ENTRIES) };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return { available: true, entries: [] };
    throw error;
  } finally {
    await handle?.close();
  }
}
