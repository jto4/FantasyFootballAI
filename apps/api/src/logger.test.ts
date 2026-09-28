import { describe, expect, it, vi } from 'vitest';
import { errorName, logEvent } from './logger.js';

describe('structured application logging', () => {
  it('writes structured events while discarding unapproved message and secret fields', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      logEvent('warn', 'provider.request.failed', {
        component: 'news',
        reason: 'timeout',
        errorName: 'TypeError',
        message: 'provider response with private details',
        apiKey: 'secret',
      });
      const line = String(write.mock.calls[0]?.[0]);
      expect(JSON.parse(line)).toMatchObject({
        level: 'warn',
        event: 'provider.request.failed',
        component: 'news',
        reason: 'timeout',
        errorName: 'TypeError',
      });
      expect(line).not.toContain('private details');
      expect(line).not.toContain('secret');
    } finally {
      write.mockRestore();
    }
  });

  it('limits event names and error names to safe identifiers', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      logEvent('error', 'Bad event\nsecret', { reason: 'sensitive\nvalue' });
      expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
        event: 'logging.invalid_event',
      });
      expect(errorName(Object.assign(new Error(), { name: 'key:value' }))).toBe('Error');
    } finally {
      write.mockRestore();
    }
  });
});
