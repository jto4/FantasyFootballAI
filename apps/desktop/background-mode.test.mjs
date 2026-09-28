import assert from 'node:assert/strict';
import test from 'node:test';
import { isHeadlessLaunch, shouldKeepDashboardClosed } from './background-mode.mjs';

test('recognizes the explicit packaged headless argument', () => {
  assert.equal(isHeadlessLaunch(['Sunday Sidekick', '--sidekick-headless']), true);
  assert.equal(isHeadlessLaunch(['Sunday Sidekick', '--sidekick-start-hidden']), false);
});

test('keeps the dashboard closed until a second visible launch requests it', () => {
  assert.equal(shouldKeepDashboardClosed({ headless: true, showWindowRequested: false }), true);
  assert.equal(shouldKeepDashboardClosed({ headless: true, showWindowRequested: true }), false);
  assert.equal(shouldKeepDashboardClosed({ headless: false, showWindowRequested: false }), false);
});
