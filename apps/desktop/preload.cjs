// Sandboxed Electron preloads use CommonJS to access their restricted Electron API.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sidekickDesktop', {
  isVerificationMode: () => ipcRenderer.sendSync('sidekick:is-verification-mode'),
  getTheme: () => ipcRenderer.sendSync('sidekick:get-theme'),
  getTeamSelections: () => ipcRenderer.sendSync('sidekick:get-team-selections'),
  setTeamSelections: (teams) => ipcRenderer.invoke('sidekick:set-team-selections', teams),
  getNotificationHistory: () => ipcRenderer.invoke('sidekick:get-notification-history'),
  setTheme: (theme) => ipcRenderer.invoke('sidekick:set-theme', theme),
  getLaunchAtLogin: () => ipcRenderer.invoke('sidekick:get-launch-at-login'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('sidekick:set-launch-at-login', enabled),
  getStartHidden: () => ipcRenderer.invoke('sidekick:get-start-hidden'),
  setStartHidden: (enabled) => ipcRenderer.invoke('sidekick:set-start-hidden', enabled),
  getDataDirectory: () => ipcRenderer.invoke('sidekick:get-data-directory'),
  chooseDataDirectory: () => ipcRenderer.invoke('sidekick:choose-data-directory'),
  checkForUpdates: () => ipcRenderer.invoke('sidekick:check-for-updates'),
  getUpdateStatus: () => ipcRenderer.invoke('sidekick:get-update-status'),
  installUpdate: () => ipcRenderer.invoke('sidekick:install-update'),
  onUpdateStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on('sidekick:update-status', handler);
    return () => ipcRenderer.removeListener('sidekick:update-status', handler);
  },
  openReleasePage: () => ipcRenderer.invoke('sidekick:open-release-page'),
});
