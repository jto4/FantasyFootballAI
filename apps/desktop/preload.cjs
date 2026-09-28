// Sandboxed Electron preloads use CommonJS to access their restricted Electron API.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sidekickDesktop', {
  getLaunchAtLogin: () => ipcRenderer.invoke('sidekick:get-launch-at-login'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('sidekick:set-launch-at-login', enabled),
  getStartHidden: () => ipcRenderer.invoke('sidekick:get-start-hidden'),
  setStartHidden: (enabled) => ipcRenderer.invoke('sidekick:set-start-hidden', enabled),
  getDataDirectory: () => ipcRenderer.invoke('sidekick:get-data-directory'),
  chooseDataDirectory: () => ipcRenderer.invoke('sidekick:choose-data-directory'),
  checkForUpdates: () => ipcRenderer.invoke('sidekick:check-for-updates'),
  openReleasePage: () => ipcRenderer.invoke('sidekick:open-release-page'),
});
