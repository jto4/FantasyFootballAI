import { spawnSync } from 'node:child_process';
import { chmod, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderLaunchAgent,
  renderSystemdUnit,
  serviceLabel,
  serviceName,
  servicePaths,
  windowsTaskCommand,
} from './service-config.mjs';

const defaultRepositoryRoot = fileURLToPath(new URL('../', import.meta.url));

/** Keep platform dispatch separate from the CLI so every service-manager path is testable. */
export function createServiceManager({
  platform = process.platform,
  home = homedir(),
  repositoryRoot = defaultRepositoryRoot,
  nodePath = process.execPath,
  userId = process.getuid?.(),
  runCommand = spawnCommand,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  const paths = servicePaths(home, repositoryRoot);

  async function execute(command) {
    if (command === 'install' || command === 'update') await installService();
    else if (command === 'uninstall') await uninstallService();
    else if (command === 'start' || command === 'stop') await controlService(command);
    else if (command === 'status') await showStatus();
    else return false;
    return true;
  }

  async function installService() {
    logger.info('Building Sunday Sidekick before installing its background service…');
    const npm = platform === 'win32' ? 'npm.cmd' : 'npm';
    const build = runCommand(npm, ['run', 'build'], {
      cwd: repositoryRoot,
      stdio: 'inherit',
      shell: platform === 'win32',
    });
    if (build.error) throw build.error;
    if (build.status !== 0)
      throw new Error('Build failed; the background service was not installed.');

    if (platform === 'darwin') await installLaunchAgent();
    else if (platform === 'linux') await installSystemdUnit();
    else if (platform === 'win32') installWindowsTask();
    else throw new Error(`Background service installation is unsupported on ${platform}.`);
  }

  async function installLaunchAgent() {
    if (userId === undefined) throw new Error('Could not determine the current macOS user.');
    await secureWrite(
      paths.launchAgent,
      renderLaunchAgent({
        nodePath,
        repositoryRoot,
        serviceScript: paths.serviceScript,
        stdoutLog: paths.stdoutLog,
        stderrLog: paths.stderrLog,
      }),
    );
    invoke('launchctl', ['bootout', `gui/${userId}`, paths.launchAgent], { allowFailure: true });
    invoke('launchctl', ['bootstrap', `gui/${userId}`, paths.launchAgent]);
    logger.info(`Installed and started ${serviceName}. It will start when you sign in to macOS.`);
  }

  async function installSystemdUnit() {
    await secureWrite(
      paths.systemdUnit,
      renderSystemdUnit({ nodePath, repositoryRoot, serviceScript: paths.serviceScript }),
    );
    invoke('systemctl', ['--user', 'daemon-reload']);
    invoke('systemctl', ['--user', 'enable', '--now', 'sunday-sidekick.service']);
    invoke('systemctl', ['--user', 'restart', 'sunday-sidekick.service']);
    logger.info(`Installed and started ${serviceName}. It will start in your Linux user session.`);
  }

  function installWindowsTask() {
    const taskCommand = windowsTaskCommand(nodePath, paths.serviceScript);
    invoke('schtasks.exe', ['/End', '/TN', serviceName], { allowFailure: true });
    invoke('schtasks.exe', [
      '/Create',
      '/TN',
      serviceName,
      '/SC',
      'ONLOGON',
      '/TR',
      taskCommand,
      '/F',
    ]);
    invoke('schtasks.exe', ['/Run', '/TN', serviceName]);
    logger.info(`Installed and started ${serviceName}. It will start when you sign in to Windows.`);
  }

  async function uninstallService() {
    if (platform === 'darwin') {
      if (userId === undefined) throw new Error('Could not determine the current macOS user.');
      invoke('launchctl', ['bootout', `gui/${userId}`, paths.launchAgent], { allowFailure: true });
      await unlink(paths.launchAgent).catch(ignoreMissing);
    } else if (platform === 'linux') {
      invoke('systemctl', ['--user', 'disable', '--now', 'sunday-sidekick.service'], {
        allowFailure: true,
      });
      await unlink(paths.systemdUnit).catch(ignoreMissing);
      invoke('systemctl', ['--user', 'daemon-reload'], { allowFailure: true });
    } else if (platform === 'win32') {
      await stopWindowsTaskGracefully();
      invoke('schtasks.exe', ['/Delete', '/TN', serviceName, '/F'], { allowFailure: true });
    } else {
      throw new Error(`Background service uninstallation is unsupported on ${platform}.`);
    }
    logger.info(`${serviceName} background service removed.`);
  }

  async function controlService(action) {
    if (!['start', 'stop'].includes(action)) throw new Error('Unsupported service action.');
    if (platform === 'darwin') {
      if (userId === undefined) throw new Error('Could not determine the current macOS user.');
      if (action === 'stop') {
        invoke('launchctl', ['bootout', `gui/${userId}`, paths.launchAgent]);
      } else {
        try {
          invoke('launchctl', ['bootstrap', `gui/${userId}`, paths.launchAgent]);
        } catch {
          invoke('launchctl', ['kickstart', '-k', `gui/${userId}/${serviceLabel}`]);
        }
      }
    } else if (platform === 'linux') {
      invoke('systemctl', ['--user', action, 'sunday-sidekick.service']);
    } else if (platform === 'win32') {
      if (action === 'stop') await stopWindowsTaskGracefully();
      else invoke('schtasks.exe', ['/Run', '/TN', serviceName]);
    } else {
      throw new Error(`Background service control is unsupported on ${platform}.`);
    }
    logger.info(`${serviceName} service ${action} requested.`);
  }

  async function stopWindowsTaskGracefully() {
    let isSidekickService = false;
    try {
      const response = await fetchImpl('http://127.0.0.1:4173/api/health', {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        const health = await response.json();
        isSidekickService = health.backgroundService === true;
      }
    } catch {
      // The task may already have stopped; Task Scheduler below remains authoritative.
    }
    if (isSidekickService) {
      await fetchImpl('http://127.0.0.1:4173/api/shutdown', {
        method: 'POST',
        signal: AbortSignal.timeout(2_000),
      }).catch(() => undefined);
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        try {
          await fetchImpl('http://127.0.0.1:4173/api/health', {
            signal: AbortSignal.timeout(500),
          });
        } catch {
          return;
        }
      }
    }
    invoke('schtasks.exe', ['/End', '/TN', serviceName], { allowFailure: true });
  }

  async function showStatus() {
    if (platform === 'darwin') {
      if (userId === undefined) throw new Error('Could not determine the current macOS user.');
      invoke('launchctl', ['print', `gui/${userId}/${serviceLabel}`], { allowFailure: true });
    } else if (platform === 'linux') {
      invoke('systemctl', ['--user', 'status', 'sunday-sidekick.service', '--no-pager'], {
        allowFailure: true,
      });
    } else if (platform === 'win32') {
      invoke('schtasks.exe', ['/Query', '/TN', serviceName, '/FO', 'LIST', '/V'], {
        allowFailure: true,
      });
    } else {
      throw new Error(`Background service status is unsupported on ${platform}.`);
    }
  }

  function invoke(program, args, { allowFailure = false } = {}) {
    const result = runCommand(program, args, {
      cwd: repositoryRoot,
      stdio: 'inherit',
      shell: platform === 'win32' && program.toLowerCase().endsWith('.cmd'),
    });
    if (result.error) throw result.error;
    if (!allowFailure && result.status !== 0)
      throw new Error(`${program} exited with status ${result.status ?? 'unknown'}.`);
    return result.status === 0;
  }

  return { run: execute };
}

async function secureWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700).catch(() => undefined);
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, contents, { mode: 0o600 });
  await chmod(temporary, 0o600).catch(() => undefined);
  await unlink(path).catch(ignoreMissing);
  await rename(temporary, path);
}

function spawnCommand(program, args, options) {
  return spawnSync(program, args, options);
}

function ignoreMissing(error) {
  if (error?.code !== 'ENOENT') throw error;
}
