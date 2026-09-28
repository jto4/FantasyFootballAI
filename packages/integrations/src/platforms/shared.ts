import { fetchRetryingJson } from '../http.js';

export async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  return fetchRetryingJson(url, init);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
export function firstRecord(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const record = asRecord(item);
      if (record) return record;
    }
    return undefined;
  }
  return asRecord(value);
}
export function recordsDeep(value: unknown): Record<string, unknown>[] {
  const pending: unknown[] = [value];
  const records: Record<string, unknown>[] = [];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) pending.push(current[index]);
      continue;
    }
    const record = asRecord(current);
    if (!record) continue;
    records.push(record);
    const values = Object.values(record);
    for (let index = values.length - 1; index >= 0; index -= 1) pending.push(values[index]);
  }
  return records;
}
export function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
export function booleanOrUndefined(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return undefined;
}
export function boundedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}
export function boundedDisplayName(value: unknown, fallback: string): string {
  const name = boundedString(value, 120);
  if (name && !/[\u0000-\u001f\u007f]/.test(name)) return name;
  const safeFallback = fallback
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 120);
  return safeFallback || 'Fantasy Football League';
}
export function boundedLabel(value: unknown, maxLength = 120): string | undefined {
  const label = boundedString(value, maxLength);
  return label && !/[\u0000-\u001f\u007f]/.test(label) ? label : undefined;
}
export function boundedRosterPositions(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100) return [];
  return value.flatMap((entry) => {
    const position = boundedLabel(entry, 24);
    return position ? [position] : [];
  });
}
export function boundedId(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)))
    return undefined;
  const id = String(value).trim();
  return id && !/[\u0000-\u001f\u007f]/.test(id) ? id.slice(0, maxLength) : undefined;
}
export function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  const number = numberOrUndefined(value);
  return number !== undefined && Number.isInteger(number) && number >= minimum && number <= maximum
    ? number
    : undefined;
}
export function validIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 100)
    .flatMap((entry) =>
      typeof entry === 'string' || typeof entry === 'number' ? [String(entry).slice(0, 40)] : [],
    );
}
