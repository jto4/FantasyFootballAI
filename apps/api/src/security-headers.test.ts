import { describe, expect, it, vi } from 'vitest';
import { applySecurityHeaders } from './security-headers.js';

describe('response security headers', () => {
  it('prevents framing and MIME sniffing and suppresses referrer data', () => {
    const setHeader = vi.fn();
    applySecurityHeaders({ setHeader });
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'",
    );
    expect(setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
  });
});
