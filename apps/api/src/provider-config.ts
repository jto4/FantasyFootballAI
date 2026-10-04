/** Parse only owner-configured credential JSON; never expose its contents in errors. */
export function parseSecret(value: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = value ? JSON.parse(value) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
