/** Accept only the API origin and, during local development, Vite's origin. */
export function isAllowedOrigin(origin: string, apiPort: number, development = false): boolean {
  try {
    const parsed = new URL(origin);
    // Origin headers are serialized origins and must not contain credentials, paths, or queries.
    if (origin !== parsed.origin || parsed.protocol !== 'http:') return false;

    const allowed = new Set([`http://127.0.0.1:${apiPort}`, `http://localhost:${apiPort}`]);
    if (development) {
      allowed.add('http://127.0.0.1:5173');
      allowed.add('http://localhost:5173');
    }
    return allowed.has(parsed.origin);
  } catch {
    return false;
  }
}
