import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackgroundTray } from './background-tray.mjs';

test('closing the dashboard hides it while the tray keeps an explicit quit action', () => {
  const listeners = new Map();
  const calls = [];
  const window = {
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
    hide: () => calls.push('hide'),
    on: (event, callback) => listeners.set(`window:${event}`, callback),
  };
  const tray = {
    on: (event, callback) => listeners.set(`tray:${event}`, callback),
    setContextMenu: (menu) => calls.push(['menu', menu]),
    setToolTip: (value) => calls.push(['tooltip', value]),
  };
  const menu = { buildFromTemplate: (items) => items };
  const app = {
    on: (event, callback) => listeners.set(`app:${event}`, callback),
    quit: () => calls.push('quit'),
  };
  const result = createBackgroundTray({
    app,
    Menu: menu,
    Tray: class {
      constructor(iconPath) {
        calls.push(['icon', iconPath]);
        return tray;
      }
    },
    iconPath: '/app/tray-icon.png',
    window,
    isQuitting: () => false,
  });

  assert.equal(result, tray);
  const closeEvent = {
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  listeners.get('window:close')(closeEvent);
  assert.equal(closeEvent.prevented, true);
  assert.ok(calls.includes('hide'));
  assert.equal(
    calls.find((call) => Array.isArray(call) && call[0] === 'icon')[1],
    '/app/tray-icon.png',
  );

  listeners.get('tray:double-click')();
  assert.deepEqual(calls.slice(-3), ['restore', 'show', 'focus']);
  const contextMenu = calls.find((call) => Array.isArray(call) && call[0] === 'menu')[1];
  contextMenu.find((item) => item.label === 'Quit Sunday Sidekick').click();
  assert.ok(calls.includes('quit'));
});

test('window close proceeds during an explicit application quit', () => {
  let closeHandler;
  const window = {
    isMinimized: () => false,
    restore() {},
    show() {},
    focus() {},
    hide() {},
    on: (_event, callback) => {
      closeHandler = callback;
    },
  };
  createBackgroundTray({
    app: { on() {}, quit() {} },
    Menu: { buildFromTemplate: (items) => items },
    Tray: class {
      on() {}
      setToolTip() {}
      setContextMenu() {}
    },
    iconPath: '/app/tray-icon.png',
    window,
    isQuitting: () => true,
  });
  const closeEvent = {
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  closeHandler(closeEvent);
  assert.equal(closeEvent.prevented, false);
});
