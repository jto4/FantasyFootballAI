/**
 * Readers for untrusted JSON from providers: anything unexpected becomes an empty value instead
 * of throwing, so parsers can skip a malformed field without guessing.
 */
export const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
export const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The NFL season a date falls in: January and February belong to the previous season. */
export function nflSeasonFor(date: Date | number): number {
  const d = new Date(date);
  return d.getUTCMonth() < 2 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
}
