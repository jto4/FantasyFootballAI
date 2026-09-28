import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export function linuxAutostartFile(home = homedir()) {
  return join(home, '.config', 'autostart', 'sunday-sidekick.desktop');
}

export async function getLaunchAtLogin(
  app,
  {
    platform = process.platform,
    home = homedir(),
    executable = process.execPath,
    startHidden = false,
  } = {},
) {
  if (platform === 'linux') {
    try {
      const file = await lstat(linuxAutostartFile(home));
      return { supported: true, enabled: file.isFile() };
    } catch {
      return { supported: true, enabled: false };
    }
  }
  if (platform === 'darwin' || platform === 'win32') {
    return {
      supported: true,
      enabled: app.getLoginItemSettings(loginItemOptions(platform, executable, startHidden))
        .openAtLogin,
    };
  }
  return { supported: false, enabled: false };
}

export async function setLaunchAtLogin(
  app,
  enabled,
  {
    platform = process.platform,
    home = homedir(),
    executable = process.execPath,
    startHidden = false,
  } = {},
) {
  if (typeof enabled !== 'boolean') throw new TypeError('Launch-at-login setting must be boolean.');
  if (platform === 'linux') {
    const path = linuxAutostartFile(home);
    if (!enabled) {
      await rm(path, { force: true });
      return { supported: true, enabled: false };
    }
    const directory = join(home, '.config', 'autostart');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${path}.${process.pid}.tmp`;
    const contents = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Sunday Sidekick',
      `Exec=${quoteDesktopArgument(executable)}${startHidden ? ' --sidekick-start-hidden' : ''}`,
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      'NoDisplay=true',
      '',
    ].join('\n');
    try {
      await writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await rename(temporaryPath, path);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
    return { supported: true, enabled: true };
  }
  if (platform === 'darwin' || platform === 'win32') {
    const options = loginItemOptions(platform, executable, startHidden);
    app.setLoginItemSettings({ ...options, openAtLogin: enabled });
    return getLaunchAtLogin(app, { platform, executable, startHidden });
  }
  return { supported: false, enabled: false };
}

function loginItemOptions(platform, executable, startHidden) {
  if (platform !== 'win32') return {};
  // Squirrel installs versioned app folders; its stable launcher lives one directory up.
  return {
    path: resolve(dirname(executable), '..', basename(executable)),
    args: startHidden ? ['--sidekick-start-hidden'] : [],
  };
}

function quoteDesktopArgument(value) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`')}"`;
}
