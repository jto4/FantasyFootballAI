import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesktopSmokePlan } from './desktop-smoke-plan.mjs';

test('Windows CI checks the executable but skips Electron runtime smokes', () => {
  assert.deepEqual(createDesktopSmokePlan('win32', true), {
    skipHostedWindowsRuntimeSmoke: true,
    useXvfb: false,
    sandboxArgs: [],
  });
});

test('Linux CI uses Xvfb and disables the sandbox only for its smoke runtime', () => {
  assert.deepEqual(createDesktopSmokePlan('linux', true), {
    skipHostedWindowsRuntimeSmoke: false,
    useXvfb: true,
    sandboxArgs: ['--no-sandbox'],
  });
});

test('local builds retain their native GUI smoke without special sandbox arguments', () => {
  assert.deepEqual(createDesktopSmokePlan('darwin', false), {
    skipHostedWindowsRuntimeSmoke: false,
    useXvfb: false,
    sandboxArgs: [],
  });
});
