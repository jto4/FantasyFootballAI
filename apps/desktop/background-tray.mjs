export function createBackgroundTray({ app, Menu, Tray, iconPath, window, isQuitting }) {
  const tray = new Tray(iconPath);
  const showWindow = () => {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };

  tray.setToolTip('Sunday Sidekick is running');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Sunday Sidekick', click: showWindow },
      { type: 'separator' },
      { label: 'Quit Sunday Sidekick', click: () => app.quit() },
    ]),
  );
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  window.on('close', (event) => {
    if (isQuitting()) return;
    event.preventDefault();
    window.hide();
  });
  app.on('activate', showWindow);

  return tray;
}
