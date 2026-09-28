import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesktopSmokePlan } from './desktop-smoke-plan.mjs';

test('Windows CI skips only the GUI smoke and still permits packaged MCP smoke', () => {
  assert.deepEqual(createDesktopSmokePlan('win32', true), {
    skipGuiSmoke: true,
    useXvfb: false,
    sandboxArgs: [],
  });
});

test('Linux CI uses Xvfb and disables the sandbox only for its smoke runtime', () => {
  assert.deepEqual(createDesktopSmokePlan('linux', true), {
    skipGuiSmoke: false,
    useXvfb: true,
    sandboxArgs: ['--no-sandbox'],
  });
});

test('local builds retain their native GUI smoke without special sandbox arguments', () => {
  assert.deepEqual(createDesktopSmokePlan('darwin', false), {
    skipGuiSmoke: false,
    useXvfb: false,
    sandboxArgs: [],
  });
});
