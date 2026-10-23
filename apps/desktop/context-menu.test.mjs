import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextMenuTemplate } from './context-menu.mjs';

const deps = (calls = []) => ({
  webContents: {
    replaceMisspelling: (w) => calls.push(['replace', w]),
    reload: () => calls.push(['reload']),
    inspectElement: () => calls.push(['inspect']),
  },
  shell: { openExternal: async (u) => calls.push(['open', u]) },
  clipboard: { writeText: (t) => calls.push(['copy', t]) },
  isPackaged: true,
});
const labels = (items) => items.filter((i) => i.type !== 'separator').map((i) => i.label);

test('text fields get editing actions with their enabled state', () => {
  const items = contextMenuTemplate(
    { isEditable: true, editFlags: { canCopy: true, canPaste: true, canSelectAll: true } },
    deps(),
  );
  assert.deepEqual(labels(items), ['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select All']);
  assert.equal(items.find((i) => i.label === 'Cut').enabled, false);
  assert.equal(items.find((i) => i.label === 'Paste').enabled, true);
});

test('selections, https links and spelling get their actions; other links do not', () => {
  const calls = [];
  const items = contextMenuTemplate(
    {
      selectionText: 'Puka Nacua',
      linkURL: 'https://www.espn.com/nfl/',
      misspelledWord: 'Nacau',
      dictionarySuggestions: ['Nacua'],
    },
    deps(calls),
  );
  assert.deepEqual(labels(items), ['Nacua', 'Copy', 'Open Link in Browser', 'Copy Link', 'Reload']);
  items.find((i) => i.label === 'Copy Link').click();
  items.find((i) => i.label === 'Nacua').click();
  assert.deepEqual(calls, [
    ['copy', 'https://www.espn.com/nfl/'],
    ['replace', 'Nacua'],
  ]);
  const unsafe = contextMenuTemplate({ linkURL: 'file:///etc/passwd' }, deps());
  assert.deepEqual(labels(unsafe), ['Reload']);
});

test('Inspect appears only in development builds', () => {
  assert.ok(!labels(contextMenuTemplate({}, deps())).includes('Inspect Element'));
  assert.ok(
    labels(contextMenuTemplate({}, { ...deps(), isPackaged: false })).includes('Inspect Element'),
  );
});
