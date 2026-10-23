/**
 * Right-click menu for the dashboard window. Electron shows none by default. Items depend on what
 * was clicked: editable fields get editing actions, selections get Copy, and https links can be
 * copied or opened in the default browser. Inspect appears only in development builds.
 */
export function contextMenuTemplate(params, { webContents, shell, clipboard, isPackaged }) {
  const items = [];
  const flags = params.editFlags ?? {};
  const section = (entries) => {
    if (!entries.length) return;
    if (items.length) items.push({ type: 'separator' });
    items.push(...entries);
  };
  if (params.misspelledWord && params.dictionarySuggestions?.length)
    section(
      params.dictionarySuggestions.slice(0, 5).map((word) => ({
        label: word,
        click: () => webContents.replaceMisspelling(word),
      })),
    );
  if (params.isEditable)
    section([
      { label: 'Undo', role: 'undo', enabled: Boolean(flags.canUndo) },
      { label: 'Redo', role: 'redo', enabled: Boolean(flags.canRedo) },
      { type: 'separator' },
      { label: 'Cut', role: 'cut', enabled: Boolean(flags.canCut) },
      { label: 'Copy', role: 'copy', enabled: Boolean(flags.canCopy) },
      { label: 'Paste', role: 'paste', enabled: Boolean(flags.canPaste) },
      { type: 'separator' },
      { label: 'Select All', role: 'selectAll', enabled: Boolean(flags.canSelectAll) },
    ]);
  else if (params.selectionText?.trim()) section([{ label: 'Copy', role: 'copy' }]);
  // Only https links leave the app, matching the window-open handler.
  if (typeof params.linkURL === 'string' && params.linkURL.startsWith('https://'))
    section([
      { label: 'Open Link in Browser', click: () => void shell.openExternal(params.linkURL) },
      { label: 'Copy Link', click: () => clipboard.writeText(params.linkURL) },
    ]);
  if (!params.isEditable) section([{ label: 'Reload', click: () => webContents.reload() }]);
  if (!isPackaged)
    section([
      { label: 'Inspect Element', click: () => webContents.inspectElement(params.x, params.y) },
    ]);
  return items;
}
