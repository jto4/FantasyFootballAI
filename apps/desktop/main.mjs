import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
  utilityProcess,
} from 'electron';
import { lstat, mkdir, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import squirrelStartup from 'electron-squirrel-startup';
import { getLaunchAtLogin, setLaunchAtLogin } from './login-startup.mjs';
import {
  getStartHiddenPreference,
  setStartHiddenPreference,
  shouldStartHidden,
} from './startup-preference.mjs';
import { createBackgroundTray } from './background-tray.mjs';
import { createRotatingLogWriter } from './log-writer.mjs';
import { recoverFromSafetyBackup } from './database-recovery-flow.mjs';
import { readDesktopMcpEndpoint } from './mcp-endpoint.mjs';
import {
  copyLocalDirectory,
  isDataDirectoryActive,
  parseSavedDataDirectory,
  resolveDataDirectory,
} from './data-directory.mjs';

const startupTimeoutMs = 30_000;
const smokeTest = process.argv.includes('--sidekick-smoke-test');
const mcpMode = process.argv.includes('--sidekick-mcp');
let apiProcess;
let apiPort;
let apiExited = false;
let startupInProgress = true;
let storageOpenFailed = false;
let apiLogWriter;
let apiLogFlushPromise = Promise.resolve();
let resolveApiExit = () => undefined;
let apiExitPromise = Promise.resolve();
let quitting = false;
let quitPromise;
let mainWindow;
let tray;
let dashboardOrigin;
// Keep the selection outside the selected folder so startup can find it after a move.
const dataDirectoryPreference = join(app.getPath('appData'), app.getName(), 'data-directory.json');
const startupPreference = join(app.getPath('appData'), app.getName(), 'startup.json');

ipcMain.handle('sidekick:get-launch-at-login', async (event) => {
  assertTrustedDashboard(event);
  return getLaunchAtLogin(app, {
    home: app.getPath('home'),
    startHidden: await getStartHiddenPreference(startupPreference),
  });
});
ipcMain.handle('sidekick:set-launch-at-login', async (event, enabled) => {
  assertTrustedDashboard(event);
  return setLaunchAtLogin(app, enabled, {
    home: app.getPath('home'),
    startHidden: await getStartHiddenPreference(startupPreference),
  });
});
ipcMain.handle('sidekick:get-start-hidden', async (event) => {
  assertTrustedDashboard(event);
  return {
    supported: ['darwin', 'win32', 'linux'].includes(process.platform),
    enabled: await getStartHiddenPreference(startupPreference),
  };
});
ipcMain.handle('sidekick:set-start-hidden', async (event, enabled) => {
  assertTrustedDashboard(event);
  const previous = await getStartHiddenPreference(startupPreference);
  const launchEnabled = (
    await getLaunchAtLogin(app, { home: app.getPath('home'), startHidden: previous })
  ).enabled;
  const supported = ['darwin', 'win32', 'linux'].includes(process.platform);
  await setStartHiddenPreference(startupPreference, enabled);
  try {
    if (launchEnabled) {
      const startup = await setLaunchAtLogin(app, true, {
        home: app.getPath('home'),
        startHidden: enabled,
      });
      if (!startup.enabled) throw new Error('The operating system did not update its login item.');
    }
  } catch (error) {
    await setStartHiddenPreference(startupPreference, previous);
    if (launchEnabled) {
      await setLaunchAtLogin(app, true, {
        home: app.getPath('home'),
        startHidden: previous,
      }).catch(() => undefined);
    }
    throw error;
  }
  return { supported, enabled };
});
ipcMain.handle('sidekick:get-data-directory', async (event) => {
  assertTrustedDashboard(event);
  return await getDataDirectory();
});
ipcMain.handle('sidekick:choose-data-directory', async (event) => {
  assertTrustedDashboard(event);
  if (!mainWindow || apiPort === undefined) throw new Error('The local service is not running.');
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Sunday Sidekick data folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (selection.canceled || !selection.filePaths[0]) return { changed: false };
  const selectedDirectory = resolve(selection.filePaths[0]);
  const currentDirectory = await realpath(await getDataDirectory());
  await mkdir(selectedDirectory, { recursive: true, mode: 0o700 });
  const nextDirectory = await realpath(selectedDirectory);
  if (nextDirectory === currentDirectory) return { changed: false };
  if (await isDataDirectoryActive(nextDirectory)) {
    throw new Error(
      'Sunday Sidekick is already running from that folder. Stop it before switching.',
    );
  }

  const databasePath = join(nextDirectory, 'state.sqlite');
  const backupsPath = join(nextDirectory, 'backups');
  const imagesPath = join(nextDirectory, 'images');
  const existingDatabase = await lstat(databasePath).catch(() => undefined);
  if (existingDatabase) {
    if (!existingDatabase.isFile())
      throw new Error('The selected folder has an invalid database entry. Choose another folder.');
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Switch to existing Sunday Sidekick data?',
      message: 'This folder already contains a Sunday Sidekick database.',
      detail:
        'The app will use the existing data in that folder. Your current data folder will be retained as a separate copy.',
      buttons: ['Switch folders', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (confirmation.response !== 0) return { changed: false };
    await restartWithDataDirectory(nextDirectory, currentDirectory);
    return { changed: true };
  }
  if (
    await lstat(backupsPath).then(
      () => true,
      () => false,
    )
  ) {
    throw new Error('That folder already contains a backups folder. Choose another folder.');
  }
  if (
    await lstat(imagesPath).then(
      () => true,
      () => false,
    )
  )
    throw new Error('That folder already contains an images folder. Choose another folder.');

  let databaseCreated = false;
  let backupsCreated = false;
  let imagesCreated = false;
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/backup`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('Could not create a consistent local database copy.');
    const contents = Buffer.from(await response.arrayBuffer());
    if (
      contents.length < 16 ||
      contents.length > 50 * 1024 * 1024 ||
      contents.subarray(0, 16).toString() !== 'SQLite format 3\0'
    ) {
      throw new Error('The local database copy failed validation.');
    }
    await writeFile(databasePath, contents, { flag: 'wx', mode: 0o600 });
    databaseCreated = true;
    const oldBackupsPath = join(currentDirectory, 'backups');
    backupsCreated = await copyLocalDirectory(oldBackupsPath, backupsPath);
    const oldImagesPath = join(currentDirectory, 'images');
    imagesCreated = await copyLocalDirectory(oldImagesPath, imagesPath);
    await restartWithDataDirectory(nextDirectory, currentDirectory);
    return { changed: true };
  } catch (error) {
    if (databaseCreated) await unlink(databasePath).catch(() => undefined);
    if (backupsCreated) await rm(backupsPath, { recursive: true, force: true });
    if (imagesCreated) await rm(imagesPath, { recursive: true, force: true });
    throw error;
  }
});

if (mcpMode) {
  app.whenReady().then(startPackagedMcp).catch(showStartupError);
} else if (smokeTest) {
  // CI launches the unpacked executable outside Squirrel's installer lifecycle.
  app.whenReady().then(start).catch(showStartupError);
} else if (squirrelStartup) {
  app.quit();
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  app.whenReady().then(start).catch(showStartupError);
}

async function start() {
  await writeSmokeStatus('starting');
  apiPort = await reserveLoopbackPort();
  const dataDirectory = await getDataDirectory();
  await writeSmokeStatus('starting-api');
  await mkdir(dataDirectory, { recursive: true });
  try {
    await startLocalApi(dataDirectory);
  } catch (error) {
    if (!storageOpenFailed || smokeTest) throw error;
    await removeServicePortFile(dataDirectory);
    const recovery = await offerDatabaseRecovery(dataDirectory);
    if (!recovery.restored) throw new Error(recovery.detail);
    storageOpenFailed = false;
    apiPort = await reserveLoopbackPort();
    await startLocalApi(dataDirectory);
  }
  await writeSmokeStatus('api-ready');
  if (smokeTest) {
    const trayIcon = nativeImage.createFromPath(join(app.getAppPath(), 'tray-icon.png'));
    if (trayIcon.isEmpty()) throw new Error('The packaged system tray icon could not be loaded.');
    const response = await fetch(`http://127.0.0.1:${apiPort}/`, {
      signal: AbortSignal.timeout(2_000),
    });
    const html = await response.text();
    if (!response.ok || !html.includes('<title>Sunday Sidekick</title>')) {
      throw new Error('The packaged dashboard did not load from the local service.');
    }
    const { inspectDataDirectory } = await import('./database-recovery.mjs');
    const databaseStatus = await inspectDataDirectory(dataDirectory);
    if (!databaseStatus.current.valid)
      throw new Error(
        'The packaged SQLite recovery checker could not read the new local database.',
      );
    console.info('Packaged desktop smoke check passed: API and dashboard are responding locally.');
    // Smoke checks run in headless CI; shut down the child directly before bypassing UI quit hooks.
    await writeSmokeStatus('stopping-api');
    await stopApi(dataDirectory);
    await writeSmokeStatus('stopped');
    app.exit(0);
    return;
  }
  await writeFile(join(dataDirectory, 'service-port'), `${apiPort}\n`, { mode: 0o600 });
  const startHiddenPreferenceValue = await getStartHiddenPreference(startupPreference);
  // Electron 44 removed openAsHidden; macOS identifies login launches so regular starts stay visible.
  const wasOpenedAtLogin =
    process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin;
  const startHidden = shouldStartHidden({
    platform: process.platform,
    argumentsList: process.argv,
    startHidden: startHiddenPreferenceValue,
    wasOpenedAtLogin,
  });
  createWindow({ initiallyHidden: startHidden });
  startupInProgress = false;
}

async function writeSmokeStatus(status) {
  if (!smokeTest || !process.env.SIDEKICK_USER_DATA_DIR) return;
  const directory = process.env.SIDEKICK_USER_DATA_DIR;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'desktop-smoke-status'), `${status}\n`);
}

async function startLocalApi(dataDirectory) {
  const appRoot = app.getAppPath();
  const entry = join(appRoot, 'apps', 'api', 'dist', 'index.js');
  apiExited = false;
  storageOpenFailed = false;
  apiExitPromise = new Promise((resolve) => {
    resolveApiExit = resolve;
  });
  const logWriter = createRotatingLogWriter(join(dataDirectory, 'logs'));
  apiLogWriter = logWriter;
  apiProcess = utilityProcess.fork(entry, [], {
    cwd: dataDirectory,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      USERPROFILE: process.env.USERPROFILE ?? '',
      APPDATA: process.env.APPDATA ?? '',
      SYSTEMROOT: process.env.SYSTEMROOT ?? '',
      TEMP: process.env.TEMP ?? '',
      TMP: process.env.TMP ?? '',
      LANG: process.env.LANG ?? '',
      SIDEKICK_PORT: String(apiPort),
      SIDEKICK_DATABASE_FILE: join(dataDirectory, 'state.sqlite'),
      SIDEKICK_USER_DATA_DIR: dataDirectory,
    },
    stdio: 'pipe',
  });
  let pendingLogLine = '';
  apiProcess.stdout?.on('data', (chunk) => {
    void logWriter.write(chunk).catch(() => undefined);
    pendingLogLine += String(chunk);
    if (pendingLogLine.length > 32_768) pendingLogLine = pendingLogLine.slice(-16_384);
    const lines = pendingLogLine.split(/\r?\n/);
    pendingLogLine = lines.pop() ?? '';
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.event === 'storage.open.failed') storageOpenFailed = true;
      } catch {
        // Ignore non-JSON stdout from a package or a partial log line.
      }
    }
  });
  // The API emits reviewed JSON events on stdout; unstructured stderr is drained and discarded.
  apiProcess.stderr?.on('data', () => undefined);
  apiProcess.once('exit', (code) => {
    apiLogFlushPromise = logWriter.close();
    if (apiLogWriter === logWriter) apiLogWriter = undefined;
    apiExited = true;
    resolveApiExit(code);
    void removeServicePortFile(dataDirectory);
    if (!quitting && !startupInProgress) {
      const closeAfterExit = () => app.quit();
      if (code !== 0) {
        const window = BrowserWindow.getAllWindows()[0];
        if (window) {
          void dialog
            .showMessageBox(window, {
              type: 'error',
              title: 'Sunday Sidekick stopped',
              message: 'The local service exited unexpectedly.',
              detail: `Exit status: ${code ?? 'unknown'}. Restart Sunday Sidekick to try again.`,
            })
            .finally(closeAfterExit);
          return;
        }
      }
      closeAfterExit();
    }
  });
  await waitUntilHealthy();
}

async function offerDatabaseRecovery(dataDirectory) {
  const {
    inspectDataDirectory,
    moveDamagedDatabaseAside,
    restoreFromBackup,
    salvageDamagedDatabase,
  } = await import('./database-recovery.mjs');
  const result = await recoverFromSafetyBackup(dataDirectory, {
    inspect: inspectDataDirectory,
    restore: restoreFromBackup,
    salvage: salvageDamagedDatabase,
    startFresh: moveDamagedDatabaseAside,
    prompt: (options) => dialog.showMessageBox(options),
  });
  if (result.status === 'restored') {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Recovery copy restored',
      message: 'Sunday Sidekick will restart with the restored database.',
      detail: `${result.backupName.includes('-salvage-') ? 'Some malformed or unreadable rows may have been omitted. ' : ''}The previous database and SQLite journals were preserved in:\n${result.recoveryPath}\nReview your leagues, reports, member memory, and schedules after startup.`,
    });
    return { restored: true, detail: result.recoveryPath };
  }
  if (result.status === 'started-fresh') {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Starting with an empty library',
      message: 'The unreadable database was preserved in a recovery folder.',
      detail: `${result.recoveryPath}\nSunday Sidekick will create an empty local library. Leagues, reports, and member memory in the preserved files will not appear in this library.`,
    });
    return { restored: true, detail: result.recoveryPath };
  }
  return { restored: false, detail: result.detail };
}

async function startPackagedMcp() {
  if (process.platform === 'darwin') app.dock?.hide();
  const dataDirectory = await getDataDirectory();
  const endpoint = await readDesktopMcpEndpoint(dataDirectory);
  const mcpServerPath = join(app.getAppPath(), 'apps', 'api', 'dist', 'mcp-server.js');
  const [{ createMcpServer }, { serveStdio }] = await Promise.all([
    import(pathToFileURL(mcpServerPath).href),
    import('@modelcontextprotocol/server/stdio'),
  ]);
  const handle = serveStdio(() => createMcpServer(endpoint));
  let closingMcp = false;
  const close = () => {
    if (closingMcp) return;
    closingMcp = true;
    void handle.close().finally(() => app.quit());
  };
  process.stdin.once('end', close);
  process.stdin.once('close', close);
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

async function getDataDirectory() {
  let savedDirectory;
  try {
    savedDirectory = parseSavedDataDirectory(await readFile(dataDirectoryPreference, 'utf8'));
  } catch {
    savedDirectory = undefined;
  }
  return resolveDataDirectory({
    environmentOverride: process.env.SIDEKICK_USER_DATA_DIR,
    savedDirectory,
    defaultDirectory: app.getPath('userData'),
  });
}

async function restartWithDataDirectory(nextDirectory, currentDirectory) {
  const previousPreference = await readFile(dataDirectoryPreference).catch(() => undefined);
  const preferenceDirectory = join(app.getPath('appData'), app.getName());
  await mkdir(preferenceDirectory, { recursive: true, mode: 0o700 });
  const temporaryPreference = `${dataDirectoryPreference}.${Date.now()}.tmp`;
  await writeFile(temporaryPreference, `${JSON.stringify({ directory: nextDirectory })}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  try {
    await rename(temporaryPreference, dataDirectoryPreference);
    quitting = true;
    await stopApi(currentDirectory);
    delete process.env.SIDEKICK_USER_DATA_DIR;
    app.relaunch();
    app.exit(0);
  } catch (error) {
    quitting = false;
    await unlink(temporaryPreference).catch(() => undefined);
    if (previousPreference) {
      await writeFile(dataDirectoryPreference, previousPreference, { mode: 0o600 }).catch(
        () => undefined,
      );
    } else {
      await unlink(dataDirectoryPreference).catch(() => undefined);
    }
    throw error;
  }
}

function createWindow({ initiallyHidden = false } = {}) {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: 'Sunday Sidekick',
    webPreferences: {
      preload: join(app.getAppPath(), 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  const dashboardUrl = `http://127.0.0.1:${apiPort}`;
  dashboardOrigin = new URL(dashboardUrl).origin;
  mainWindow = window;
  tray ??= createBackgroundTray({
    app,
    Menu,
    Tray,
    iconPath: join(app.getAppPath(), 'tray-icon.png'),
    window,
    isQuitting: () => quitting,
  });
  window.once('closed', () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== dashboardUrl && !url.startsWith(`${dashboardUrl}/`)) event.preventDefault();
  });
  window.once('ready-to-show', () => {
    if (!initiallyHidden) window.show();
  });
  window.loadURL(dashboardUrl);
}

function assertTrustedDashboard(event) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    new URL(event.senderFrame?.url ?? 'about:blank').origin !== dashboardOrigin
  ) {
    throw new Error('Desktop settings can only be changed from the local dashboard.');
  }
}

async function waitUntilHealthy() {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline && !apiExited) {
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      await delay(200);
    }
  }
  throw new Error('The local service did not become ready within 30 seconds.');
}

async function reserveLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local port.');
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function stopApi(dataDirectory) {
  const activeDataDirectory = dataDirectory ?? (await getDataDirectory());
  if (!apiProcess || apiExited) {
    await apiLogFlushPromise;
    await removeServicePortFile(activeDataDirectory);
    return;
  }
  try {
    await fetch(`http://127.0.0.1:${apiPort}/api/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // The API may already be stopping or may have failed before becoming ready.
  }
  await Promise.race([apiExitPromise, delay(8_000).then(() => apiProcess?.kill())]);
  await apiLogFlushPromise;
  await removeServicePortFile(activeDataDirectory);
}

async function removeServicePortFile(dataDirectory) {
  if (apiPort === undefined) return;
  const activeDataDirectory = dataDirectory ?? (await getDataDirectory());
  const portPath = join(activeDataDirectory, 'service-port');
  try {
    if ((await readFile(portPath, 'utf8')).trim() === String(apiPort)) await unlink(portPath);
  } catch {
    // A missing or replaced service endpoint needs no cleanup.
  }
}

app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  if (quitPromise) return;
  quitting = true;
  tray?.destroy();
  quitPromise = stopApi().finally(() => app.quit());
});

async function showStartupError(error) {
  if (mcpMode) {
    console.error(error);
    app.exit(1);
    return;
  }
  if (smokeTest) {
    console.error(error);
    process.exitCode = 1;
    app.quit();
    return;
  }
  await dialog.showMessageBox({
    type: 'error',
    title: 'Could not start Sunday Sidekick',
    message: 'The local service could not start.',
    detail: error instanceof Error ? error.message : 'An unexpected error occurred.',
  });
  app.quit();
}
