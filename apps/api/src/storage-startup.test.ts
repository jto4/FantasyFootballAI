import { expect, it } from 'vitest';
import { storageStartupFailure } from './storage-startup.js';
it('distinguishes SQLite binding incompatibility from database damage', () => {
  const failure = storageStartupFailure(
    new Error('A module was compiled with NODE_MODULE_VERSION 141 instead of 147'),
  );
  expect(failure.event).toBe('runtime.sqlite.unavailable');
  expect(failure.message).toContain('npm ci');
  expect(failure.message).not.toContain('db:recover');
  expect(storageStartupFailure(new Error('database disk image is malformed')).event).toBe(
    'storage.open.failed',
  );
});
