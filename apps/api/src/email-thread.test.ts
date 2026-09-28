import { describe, expect, it } from 'vitest';
import { isValidEmailSubject, isValidMessageId } from './email-thread.js';

describe('email Message-ID validation', () => {
  it('accepts a single Message-ID for an existing reply thread', () => {
    expect(isValidMessageId('<original-message@example.com>')).toBe(true);
    expect(isValidMessageId('original-message@example.com')).toBe(true);
  });

  it('rejects header injection, whitespace, and malformed IDs', () => {
    expect(isValidMessageId('original@example.com\r\nBcc: attacker@example.com')).toBe(false);
    expect(isValidMessageId('<missing-at-sign>')).toBe(false);
    expect(isValidMessageId('two ids@example.com other@example.com')).toBe(false);
  });

  it('rejects subjects that can inject email headers', () => {
    expect(isValidEmailSubject('Re: Weekly rankings')).toBe(true);
    expect(isValidEmailSubject('Weekly\r\nBcc: other@example.com')).toBe(false);
  });
});
