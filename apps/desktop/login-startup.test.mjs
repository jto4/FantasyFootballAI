import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getLaunchAtLogin, linuxAutostartFile, setLaunchAtLogin } from './login-startup.mjs';

test('Linux launch-at-login settings create and remove a private desktop entry', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'sidekick-startup-'));
  try {
    const app = { getPath: () => home };
    assert.deepEqual(await getLaunchAtLogin(app, { platform: 'linux', home }), {
      supported: true,
      enabled: false,
    });
    assert.deepEqual(
      await setLaunchAtLogin(app, true, {
        platform: 'linux',
        home,
        executable: '/opt/Sunday Sidekick/sidekick',
      }),
      { supported: true, enabled: true },
    );
    assert.match(
      await readFile(linuxAutostartFile(home), 'utf8'),
      /Exec="\/opt\/Sunday Sidekick\/sidekick"/,
    );
    await setLaunchAtLogin(app, true, {
      platform: 'linux',
      home,
      executable: '/opt/Sunday Sidekick/sidekick',
      startHidden: true,
    });
    assert.match(await readFile(linuxAutostartFile(home), 'utf8'), /--sidekick-start-hidden/);
    assert.deepEqual(await getLaunchAtLogin(app, { platform: 'linux', home }), {
      supported: true,
      enabled: true,
    });
    assert.deepEqual(await setLaunchAtLogin(app, false, { platform: 'linux', home }), {
      supported: true,
      enabled: false,
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('macOS delegates launch-at-login to Electron settings', async () => {
  let enabled = false;
  const app = {
    setLoginItemSettings: ({ openAtLogin }) => {
      enabled = openAtLogin;
    },
    getLoginItemSettings: () => ({ openAtLogin: enabled }),
  };
  assert.deepEqual(await setLaunchAtLogin(app, true, { platform: 'darwin' }), {
    supported: true,
    enabled: true,
  });
  assert.deepEqual(await getLaunchAtLogin(app, { platform: 'darwin' }), {
    supported: true,
    enabled: true,
  });
  await setLaunchAtLogin(app, false, { platform: 'darwin' });
});

test('Windows launch-at-login uses the stable Squirrel launcher path', async () => {
  let enabled = false;
  let windowsOptions;
  const app = {
    setLoginItemSettings: ({ openAtLogin, ...options }) => {
      enabled = openAtLogin;
      windowsOptions = options;
    },
    getLoginItemSettings: (options) => {
      windowsOptions = options;
      return { openAtLogin: enabled };
    },
  };
  const options = { platform: 'win32', executable: '/app/app-1.0/sidekick.exe' };
  assert.deepEqual(await setLaunchAtLogin(app, true, options), {
    supported: true,
    enabled: true,
  });
  assert.deepEqual(windowsOptions, { path: '/app/sidekick.exe', args: [] });
});

test('Windows hidden startup passes the tray argument to the stable Squirrel launcher', async () => {
  let enabled = false;
  let windowsOptions;
  const app = {
    setLoginItemSettings: ({ openAtLogin, ...options }) => {
      enabled = openAtLogin;
      windowsOptions = options;
    },
    getLoginItemSettings: (options) => {
      windowsOptions = options;
      return { openAtLogin: enabled };
    },
  };
  assert.deepEqual(
    await setLaunchAtLogin(app, true, {
      platform: 'win32',
      executable: '/app/app-1.0/sidekick.exe',
      startHidden: true,
    }),
    { supported: true, enabled: true },
  );
  assert.deepEqual(windowsOptions, {
    path: '/app/sidekick.exe',
    args: ['--sidekick-start-hidden'],
  });
});

test('unsupported platforms do not create a startup setting', async () => {
  const app = { getPath: () => os.tmpdir() };
  assert.deepEqual(await setLaunchAtLogin(app, true, { platform: 'freebsd' }), {
    supported: false,
    enabled: false,
  });
});
