import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getStartHiddenPreference,
  setStartHiddenPreference,
  shouldStartHidden,
} from './startup-preference.mjs';

test('hidden startup is limited to explicit sign-in arguments or a configured macOS login item', () => {
  assert.equal(
    shouldStartHidden({ platform: 'win32', argumentsList: ['--sidekick-start-hidden'] }),
    true,
  );
  assert.equal(
    shouldStartHidden({ platform: 'linux', argumentsList: ['--sidekick-start-hidden'] }),
    true,
  );
  assert.equal(
    shouldStartHidden({
      platform: 'darwin',
      argumentsList: [],
      startHidden: true,
      wasOpenedAtLogin: true,
    }),
    true,
  );
  assert.equal(
    shouldStartHidden({
      platform: 'darwin',
      argumentsList: [],
      startHidden: true,
      wasOpenedAtLogin: false,
    }),
    false,
  );
  assert.equal(
    shouldStartHidden({
      platform: 'darwin',
      argumentsList: [],
      startHidden: false,
      wasOpenedAtLogin: true,
    }),
    false,
  );
});

test('start-hidden preference defaults off and survives atomic private writes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sidekick-start-hidden-'));
  const preferencePath = path.join(root, 'settings', 'startup.json');
  try {
    assert.equal(await getStartHiddenPreference(preferencePath), false);
    await setStartHiddenPreference(preferencePath, true);
    assert.equal(await getStartHiddenPreference(preferencePath), true);
    assert.deepEqual(JSON.parse(await readFile(preferencePath, 'utf8')), { startHidden: true });
    // Windows protects Electron's userData directory with the user's profile ACL;
    // POSIX mode bits are not an access-control guarantee on NTFS.
    if (process.platform !== 'win32')
      assert.equal((await stat(preferencePath)).mode & 0o777, 0o600);
    await setStartHiddenPreference(preferencePath, false);
    assert.equal(await getStartHiddenPreference(preferencePath), false);
    await assert.rejects(setStartHiddenPreference(preferencePath, 'yes'), /must be boolean/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('invalid stored start-hidden preferences fail closed to visible startup', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sidekick-start-hidden-invalid-'));
  const preferencePath = path.join(root, 'startup.json');
  try {
    await writeFile(preferencePath, '{"startHidden":"true"}');
    assert.equal(await getStartHiddenPreference(preferencePath), false);
    await writeFile(preferencePath, '{');
    assert.equal(await getStartHiddenPreference(preferencePath), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
