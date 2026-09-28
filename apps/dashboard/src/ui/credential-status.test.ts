import { describe, expect, it } from 'vitest';
import { credentialStatusLabel, parseCredentialStatuses } from './credential-status.js';

describe('credential store status', () => {
  it('accepts only a complete array of provider readiness records', () => {
    expect(parseCredentialStatuses([{ provider: 'openai', configured: true }])).toEqual([
      { provider: 'openai', configured: true },
    ]);
    expect(parseCredentialStatuses([])).toEqual([]);
    expect(parseCredentialStatuses({ error: 'unavailable' })).toBeNull();
    expect(parseCredentialStatuses([{ provider: 'openai', configured: 'yes' }])).toBeNull();
  });

  it('does not describe a failed read as an empty credential store', () => {
    expect(credentialStatusLabel(null, undefined)).toBe('CHECKING');
    expect(credentialStatusLabel(false, undefined)).toBe('STORE UNAVAILABLE');
    expect(credentialStatusLabel(true, false)).toBe('NOT SET');
    expect(credentialStatusLabel(true, true)).toBe('CONFIGURED');
  });
});
