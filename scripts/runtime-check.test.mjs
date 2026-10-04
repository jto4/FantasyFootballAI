import assert from 'node:assert/strict';
import { it } from 'node:test';
import { assertSQLiteRuntime, isSupportedNodeVersion } from './runtime-check.mjs';
it('accepts verified Node 22 and rejects untested majors', () => {
  assert.equal(isSupportedNodeVersion('22.13.0'), true);
  assert.equal(isSupportedNodeVersion('22.23.3'), true);
  assert.equal(isSupportedNodeVersion('22.12.0'), false);
  assert.equal(isSupportedNodeVersion('26.10.0'), false);
});
it('explains binding mismatches without suggesting database recovery or exposing paths', () => {
  assert.throws(
    () =>
      assertSQLiteRuntime(() => {
        throw new Error('/private/path NODE_MODULE_VERSION');
      }),
    (error) =>
      error.message.includes('npm ci') &&
      !error.message.includes('/private/path') &&
      error.message.includes('database recovery is not needed'),
  );
});
it('closes the temporary native runtime probe', () => {
  let closed = false;
  assertSQLiteRuntime(
    () =>
      class {
        close() {
          closed = true;
        }
      },
  );
  assert.equal(closed, true);
});
