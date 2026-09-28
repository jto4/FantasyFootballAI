const updateService = 'https://update.electronjs.org/jto4/FantasyFootballAI';

/** Bridge Electron's native updater to a small status model safe to show in the dashboard. */
export function createNativeUpdater({ autoUpdater, platform, architecture, version, packaged }) {
  const supported = packaged && ['darwin', 'win32'].includes(platform);
  let status = supported ? { state: 'idle' } : { state: 'unsupported' };
  let checking = false;
  const listeners = new Set();
  const publish = (next) => {
    status = next;
    for (const listener of listeners) listener(status);
  };

  autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }));
  autoUpdater.on('update-available', () => publish({ state: 'downloading' }));
  autoUpdater.on('update-not-available', () => publish({ state: 'current' }));
  autoUpdater.on('download-progress', (progress) => {
    const percent = Number(progress?.percent);
    if (Number.isFinite(percent))
      publish({ state: 'downloading', percent: Math.min(100, Math.max(0, percent)) });
  });
  autoUpdater.on('update-downloaded', () => publish({ state: 'downloaded' }));
  autoUpdater.on('error', () => {
    checking = false;
    publish({
      state: 'error',
      message:
        'The update could not be downloaded. You can install it from the official release page.',
    });
  });
  autoUpdater.on('update-not-available', () => {
    checking = false;
  });
  autoUpdater.on('update-downloaded', () => {
    checking = false;
  });

  return {
    supported,
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    check() {
      if (!supported) return status;
      if (checking || status.state === 'downloading' || status.state === 'downloaded')
        return status;
      checking = true;
      publish({ state: 'checking' });
      const endpoint = platform === 'darwin' ? `${platform}-${architecture}` : platform;
      try {
        autoUpdater.setFeedURL({ url: `${updateService}/${endpoint}/${version}` });
        autoUpdater.checkForUpdates();
      } catch {
        checking = false;
        publish({
          state: 'error',
          message: 'The update check failed. You can install it from the official release page.',
        });
      }
      return status;
    },
    install() {
      if (status.state !== 'downloaded') return false;
      autoUpdater.quitAndInstall();
      return true;
    },
  };
}
