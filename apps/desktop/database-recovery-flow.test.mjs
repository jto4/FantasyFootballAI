import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recoverFromSafetyBackup } from './database-recovery-flow.mjs';

const report = {
  backups: [
    { name: 'old.sqlite', valid: true },
    { name: 'invalid.sqlite', valid: false },
    { name: 'new.sqlite', valid: true },
  ],
};

test('startup recovery prompts with valid recent backups and restores the selected copy', async () => {
  let promptOptions;
  let restoredName;
  const result = await recoverFromSafetyBackup('/local-data', {
    inspect: async (path) => {
      assert.equal(path, '/local-data');
      return report;
    },
    prompt: async (options) => {
      promptOptions = options;
      return { response: 1 };
    },
    restore: async (_path, name) => {
      restoredName = name;
      return { recoveryPath: '/local-data/recovery-copy' };
    },
  });
  assert.equal(promptOptions.buttons[0], 'Restore backup 1');
  assert.match(promptOptions.detail, /new.sqlite/);
  assert.equal(restoredName, 'old.sqlite');
  assert.deepEqual(result, {
    status: 'restored',
    backupName: 'old.sqlite',
    recoveryPath: '/local-data/recovery-copy',
  });
});

test('startup recovery offers a fresh empty library when no backup is valid', async () => {
  let promptOptions;
  const unavailable = await recoverFromSafetyBackup('/local-data', {
    inspect: async () => ({ backups: [{ name: 'broken.sqlite', valid: false }] }),
    prompt: async (options) => {
      promptOptions = options;
      return { response: 1 };
    },
    restore: async () => assert.fail('must not restore without a valid backup'),
    startFresh: async () => assert.fail('must not start fresh after cancel'),
  });
  assert.equal(unavailable.status, 'cancelled');
  assert.equal(promptOptions.buttons[0], 'Start fresh');
  assert.match(promptOptions.detail, /empty library/);

  const canceled = await recoverFromSafetyBackup('/local-data', {
    inspect: async () => report,
    prompt: async () => ({ response: 2 }),
    restore: async () => assert.fail('must not restore after cancel'),
  });
  assert.equal(canceled.status, 'cancelled');
});

test('startup recovery preserves damaged database before starting a fresh library', async () => {
  let preservedPath;
  const result = await recoverFromSafetyBackup('/local-data', {
    inspect: async () => ({ backups: [] }),
    prompt: async () => ({ response: 0 }),
    restore: async () => assert.fail('no safety copy should be restored'),
    startFresh: async (path) => {
      assert.equal(path, '/local-data');
      return { recoveryPath: '/local-data/recovery-copy' };
    },
  });
  if (result.status === 'started-fresh') preservedPath = result.recoveryPath;
  assert.equal(preservedPath, '/local-data/recovery-copy');
});

test('startup recovery offers a validated partial-row salvage before older safety copies', async () => {
  const salvageBackup = {
    name: 'before-restore-2026-09-27T12-00-00-000Z-salvage-deadbeef.sqlite',
    valid: true,
  };
  let inspections = 0;
  let promptOptions;
  const restored = await recoverFromSafetyBackup('/local-data', {
    inspect: async () => {
      inspections += 1;
      return inspections === 1
        ? { current: { exists: true, valid: false }, backups: [] }
        : { current: { exists: true, valid: false }, backups: [salvageBackup] };
    },
    salvage: async () => ({ backupName: salvageBackup.name, counts: { skipped: 2 } }),
    prompt: async (options) => {
      promptOptions = options;
      return { response: 0 };
    },
    restore: async (_path, name) => {
      assert.equal(name, salvageBackup.name);
      return { recoveryPath: '/local-data/recovery-copy' };
    },
  });
  assert.equal(inspections, 2);
  assert.match(promptOptions.detail, /partial-data salvage/);
  assert.equal(restored.status, 'restored');
});

test('startup recovery labels raw-page salvage as potentially incomplete', async () => {
  const rawPageBackup = {
    name: 'before-restore-2026-09-27T12-00-00-000Z-page-salvage-deadbeef.sqlite',
  };
  let promptOptions;
  let inspections = 0;
  await recoverFromSafetyBackup('/data', {
    inspect: async () => {
      inspections += 1;
      return {
        current: { exists: true, valid: false },
        backups: inspections === 1 ? [] : [{ ...rawPageBackup, valid: true }],
      };
    },
    restore: async (_path, name) => assert.equal(name, rawPageBackup.name),
    salvage: async () => ({ backupName: rawPageBackup.name, counts: {} }),
    startFresh: async () => ({ recoveryPath: '/data/recovery' }),
    prompt: async (options) => {
      promptOptions = options;
      return { response: 0 };
    },
  });
  assert.equal(inspections, 2);
  assert.match(promptOptions.detail, /raw-page recovery and validated salvage/);
  assert.match(promptOptions.detail, /some data may be missing/);
});

test('startup recovery reports restore failure without claiming data was replaced', async () => {
  const result = await recoverFromSafetyBackup('/local-data', {
    inspect: async () => report,
    prompt: async () => ({ response: 0 }),
    restore: async () => {
      throw new Error('Service is still running.');
    },
  });
  assert.deepEqual(result, { status: 'failed', detail: 'Service is still running.' });
});
