import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReleaseVersion } from './release-version.mjs';

test('accepts a tag matching the app version', () => {
  assert.doesNotThrow(() => validateReleaseVersion('v1.2.3', '1.2.3'));
});

test('rejects tags that could publish installers under the wrong version', () => {
  for (const [tag, version] of [
    ['v1.2.4', '1.2.3'],
    ['1.2.3', '1.2.3'],
    ['v1.2.3-rc.1', '1.2.3'],
    ['v1.2.3', '1.2'],
  ]) {
    assert.throws(() => validateReleaseVersion(tag, version));
  }
});
