import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createNativeUpdater } from './native-updater.mjs';

function createUpdater(platform = 'darwin', architecture = 'arm64', packaged = true) {
  const autoUpdater = new EventEmitter();
  autoUpdater.setFeedURL = (feed) => (autoUpdater.feed = feed);
  autoUpdater.checkForUpdates = () => autoUpdater.emit('checking-for-update');
  autoUpdater.quitAndInstall = () => (autoUpdater.installed = true);
  const controller = createNativeUpdater({
    autoUpdater,
    platform,
    architecture,
    version: '0.1.0',
    packaged,
  });
  return { autoUpdater, controller };
}

test('uses the architecture-specific macOS feed and reports bounded download progress', () => {
  const { autoUpdater, controller } = createUpdater();
  const states = [];
  controller.subscribe((state) => states.push(state));

  assert.deepEqual(controller.check(), { state: 'checking' });
  assert.deepEqual(autoUpdater.feed, {
    url: 'https://update.electronjs.org/jto4/FantasyFootballAI/darwin-arm64/0.1.0',
  });
  autoUpdater.emit('update-available');
  autoUpdater.emit('download-progress', { percent: 43.5 });
  assert.deepEqual(controller.getStatus(), { state: 'downloading', percent: 43.5 });
  autoUpdater.emit('download-progress', { percent: 130 });
  assert.deepEqual(controller.getStatus(), { state: 'downloading', percent: 100 });
  assert.ok(states.some((state) => state.state === 'checking'));
});

test('installs only after download and reports completion without auto-restarting', () => {
  const { autoUpdater, controller } = createUpdater('win32', 'x64');
  assert.deepEqual(controller.check(), { state: 'checking' });
  assert.equal(
    autoUpdater.feed.url,
    'https://update.electronjs.org/jto4/FantasyFootballAI/win32/0.1.0',
  );
  assert.equal(controller.install(), false);

  autoUpdater.emit('update-downloaded');
  assert.deepEqual(controller.getStatus(), { state: 'downloaded' });
  assert.equal(controller.install(), true);
  assert.equal(autoUpdater.installed, true);
});

test('reports unsupported builds without contacting the updater', () => {
  const { autoUpdater, controller } = createUpdater('linux', 'x64');
  assert.equal(controller.supported, false);
  assert.deepEqual(controller.check(), { state: 'unsupported' });
  assert.equal(autoUpdater.feed, undefined);

  const unpackaged = createUpdater('darwin', 'arm64', false);
  assert.deepEqual(unpackaged.controller.getStatus(), { state: 'unsupported' });
});

test('sanitizes update errors and permits retry', () => {
  const { autoUpdater, controller } = createUpdater();
  controller.check();
  autoUpdater.emit('error', new Error('private local path'));
  assert.deepEqual(controller.getStatus(), {
    state: 'error',
    message:
      'The update could not be downloaded. You can install it from the official release page.',
  });
  assert.equal(JSON.stringify(controller.getStatus()).includes('private local path'), false);
  assert.deepEqual(controller.check(), { state: 'checking' });
});
