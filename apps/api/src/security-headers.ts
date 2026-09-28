import type { ServerResponse } from 'node:http';

const headers = {
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

export function applySecurityHeaders(response: Pick<ServerResponse, 'setHeader'>): void {
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
}
