export type LogLevel = 'info' | 'warn' | 'error';

const allowedFields = new Set([
  'action',
  'component',
  'count',
  'durationMs',
  'errorName',
  'host',
  'port',
  'reason',
  'status',
]);

/** Emit compact JSON logs while allowing only reviewed, non-sensitive metadata fields. */
export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const safeEvent = /^[a-z][a-z0-9_.-]{0,79}$/.test(event) ? event : 'logging.invalid_event';
  const safeFields: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!allowedFields.has(key)) continue;
    if (typeof value === 'string' && /^[A-Za-z0-9_.:/ -]{1,120}$/.test(value))
      safeFields[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value))
      safeFields[key] = Math.max(-1_000_000_000, Math.min(1_000_000_000, value));
  }
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level, event: safeEvent, ...safeFields })}\n`,
  );
}

export function errorName(error: unknown): string {
  const candidate = error instanceof Error ? error.name : 'Error';
  return /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(candidate) ? candidate : 'Error';
}
