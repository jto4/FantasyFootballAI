import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './origin.js';

describe('local API Origin allowlist', () => {
  it('accepts only the API origin in production mode', () => {
    expect(isAllowedOrigin('http://127.0.0.1:4173', 4173)).toBe(true);
    expect(isAllowedOrigin('http://localhost:4173', 4173)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173', 4173)).toBe(false);
  });

  it('allows the known Vite origin only in development mode', () => {
    expect(isAllowedOrigin('http://127.0.0.1:5173', 4173, true)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173', 4173, true)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5174', 4173, true)).toBe(false);
  });

  it('rejects arbitrary local ports, remote origins, and non-origin URLs', () => {
    expect(isAllowedOrigin('http://localhost:9000', 4173, true)).toBe(false);
    expect(isAllowedOrigin('http://127.0.0.1:4174', 4173, true)).toBe(false);
    expect(isAllowedOrigin('https://localhost:4173', 4173, true)).toBe(false);
    expect(isAllowedOrigin('https://example.com', 4173, true)).toBe(false);
    expect(isAllowedOrigin('http://localhost:4173/path', 4173, true)).toBe(false);
  });
});
