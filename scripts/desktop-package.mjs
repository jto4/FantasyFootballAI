import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDesktopSmokePlan } from './desktop-smoke-plan.mjs';
import { makeInternalSymlinksRelative } from './portable-symlinks.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const staging = await mkdtemp(join(tmpdir(), 'sunday-sidekick-desktop-'));
const output = join(root, 'apps', 'desktop', 'out');
const lockPath = join(root, 'apps', 'desktop', 'runtime-package-lock.json');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const apiPackage = JSON.parse(await readFile(join(root, 'apps/api/package.json'), 'utf8'));
const desktopPackage = JSON.parse(await readFile(join(root, 'apps/desktop/package.json'), 'utf8'));
const rootPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const updateLock = process.argv.includes('--update-lock');
const forgeArgs = process.argv.slice(2).filter((argument) => argument !== '--update-lock');

async function copyProjectFiles() {
  await mkdir(staging, { recursive: true });
  await cp(join(root, 'apps/desktop/main.mjs'), join(staging, 'main.mjs'));
  await cp(join(root, 'apps/desktop/update-check.mjs'), join(staging, 'update-check.mjs'));
  await cp(join(root, 'apps/desktop/background-tray.mjs'), join(staging, 'background-tray.mjs'));
  await cp(join(root, 'apps/desktop/tray-icon.png'), join(staging, 'tray-icon.png'));
  await cp(join(root, 'apps/desktop/mcp-endpoint.mjs'), join(staging, 'mcp-endpoint.mjs'));
  await cp(join(root, 'apps/desktop/data-directory.mjs'), join(staging, 'data-directory.mjs'));
  await cp(join(root, 'apps/desktop/preload.cjs'), join(staging, 'preload.cjs'));
  await cp(join(root, 'apps/desktop/login-startup.mjs'), join(staging, 'login-startup.mjs'));
  await cp(
    join(root, 'apps/desktop/startup-preference.mjs'),
    join(staging, 'startup-preference.mjs'),
  );
  await cp(join(root, 'apps/desktop/log-writer.mjs'), join(staging, 'log-writer.mjs'));
  await cp(
    join(root, 'apps/desktop/database-recovery-flow.mjs'),
    join(staging, 'database-recovery-flow.mjs'),
  );
  await cp(join(root, 'scripts/recover-database.mjs'), join(staging, 'database-recovery.mjs'));
  await cp(join(root, 'apps/desktop/forge.config.cjs'), join(staging, 'forge.config.cjs'));
  await cp(join(root, 'apps/api/package.json'), join(staging, 'apps/api/package.json'));

  for (const [source, destination] of [
    ['apps/api/dist', 'apps/api/dist'],
    ['apps/dashboard/dist', 'apps/dashboard/dist'],
    ['packages/core', 'packages/core'],
    ['packages/integrations', 'packages/integrations'],
  ]) {
    await cp(join(root, source), join(staging, destination), {
      recursive: true,
      filter: (path) => !path.includes('/node_modules') && !path.endsWith('.tsbuildinfo'),
    });
  }

  const runtimeDependencies = Object.fromEntries(
    Object.entries(apiPackage.dependencies).filter(
      ([name]) => name !== '@sidekick/core' && name !== '@sidekick/integrations',
    ),
  );
  const stagedPackage = {
    name: 'sunday-sidekick-desktop',
    productName: 'Sunday Sidekick',
    description: rootPackage.description,
    version: rootPackage.version,
    private: true,
    type: 'module',
    main: 'main.mjs',
    config: { forge: './forge.config.cjs' },
    dependencies: {
      ...runtimeDependencies,
      'electron-squirrel-startup': '^1.0.1',
      '@sidekick/core': 'file:./packages/core',
      '@sidekick/integrations': 'file:./packages/integrations',
    },
    // Installer tooling stays out of contributor `npm ci`; it is installed only in this staging app.
    devDependencies: desktopPackage.buildDependencies,
    ...(rootPackage.overrides ? { overrides: rootPackage.overrides } : {}),
  };
  await writeFile(join(staging, 'package.json'), `${JSON.stringify(stagedPackage, null, 2)}\n`);
  await writeFile(join(staging, '.npmrc'), 'audit=false\ninstall-links=true\n');
}

async function installStagedDependencies() {
  const hasLock = await lstat(lockPath).then(
    () => true,
    () => false,
  );
  if (hasLock && !updateLock) {
    await cp(lockPath, join(staging, 'package-lock.json'));
  }
  const installArgs = updateLock
    ? ['install', '--package-lock-only']
    : hasLock
      ? ['ci']
      : ['install'];
  const install = spawnSync(npm, installArgs, {
    cwd: staging,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (install.error) throw install.error;
  if (install.status !== 0)
    throw new Error(`Desktop runtime dependency install failed (${install.status}).`);

  if (updateLock || !hasLock) {
    await cp(join(staging, 'package-lock.json'), lockPath);
  }

  if (updateLock) return;

  for (const name of ['core', 'integrations']) {
    const path = join(staging, 'node_modules', '@sidekick', name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      await rm(path, { force: true });
      await cp(join(staging, 'packages', name), path, { recursive: true });
    }
    await lstat(join(path, 'dist', 'index.js'));
  }
}

async function makeInstaller() {
  const forgeCli = join(
    staging,
    'node_modules',
    '@electron-forge',
    'cli',
    'dist',
    'electron-forge.js',
  );
  const make = spawnSync(process.execPath, [forgeCli, 'make', ...forgeArgs], {
    cwd: staging,
    env: { ...process.env, SIDEKICK_DESKTOP_OUT: join(staging, 'out') },
    stdio: 'inherit',
  });
  if (make.error) throw make.error;
  if (make.status !== 0) throw new Error(`Electron Forge failed (${make.status}).`);

  await makeInternalSymlinksRelative(join(staging, 'out'));
  await rm(output, { recursive: true, force: true });
  await cp(join(staging, 'out'), output, { recursive: true, verbatimSymlinks: true });
  try {
    await smokeCheckPackage(output);
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

async function smokeCheckPackage(packageRoot) {
  const architecture = process.arch === 'arm' ? 'armv7l' : process.arch;
  const packageDirectory = join(packageRoot, `Sunday Sidekick-${process.platform}-${architecture}`);
  const executable =
    process.platform === 'darwin'
      ? join(packageDirectory, 'Sunday Sidekick.app', 'Contents', 'MacOS', 'Sunday Sidekick')
      : join(
          packageDirectory,
          process.platform === 'win32' ? 'Sunday Sidekick.exe' : 'Sunday Sidekick',
        );
  const { skipGuiSmoke, useXvfb, sandboxArgs } = createDesktopSmokePlan(
    process.platform,
    process.env.CI === 'true',
  );
  if (skipGuiSmoke) {
    const details = await lstat(executable);
    if (!details.isFile() || details.size === 0)
      throw new Error('The packaged Windows application executable is missing or empty.');
    console.info(
      'Windows package executable is present; GUI launch remains an interactive Windows check. Running the packaged MCP runtime smoke.',
    );
  }
  // Hosted Linux runners cannot set Electron's SUID sandbox ownership; this is smoke-only.
  if (!skipGuiSmoke) {
    const smokeData = join(staging, '.smoke-data');
    const command = useXvfb ? 'xvfb-run' : executable;
    const commandArgs = useXvfb
      ? ['-a', executable, ...sandboxArgs, '--sidekick-smoke-test']
      : ['--sidekick-smoke-test'];
    const result = spawnSync(command, commandArgs, {
      cwd: staging,
      env: {
        ...process.env,
        SIDEKICK_USER_DATA_DIR: smokeData,
        HOME: smokeData,
        USERPROFILE: smokeData,
      },
      timeout: 60_000,
      stdio: 'inherit',
    });
    if (result.error) {
      const smokeStatus = await readFile(join(smokeData, 'desktop-smoke-status'), 'utf8').catch(
        () => 'not started\n',
      );
      console.error(`Packaged desktop smoke stage: ${smokeStatus.trim()}`);
      throw result.error;
    }
    if (result.status !== 0)
      throw new Error(
        `The packaged application smoke check failed (${result.status ?? result.signal}).`,
      );
    const apiLog = await readFile(join(smokeData, 'logs', 'api.log'), 'utf8');
    const events = apiLog.split(/\r?\n/).flatMap((line) => {
      try {
        return [JSON.parse(line).event];
      } catch {
        return [];
      }
    });
    if (!events.includes('api.started') || !events.includes('api.stopping'))
      throw new Error('The packaged app did not flush its structured startup and shutdown logs.');
  }

  const mcpCommand = useXvfb ? 'xvfb-run' : process.execPath;
  const mcpArguments = [
    ...(useXvfb ? ['-a', process.execPath] : []),
    join(root, 'scripts', 'packaged-mcp-smoke.mjs'),
    executable,
    join(staging, '.mcp-smoke-data'),
    ...sandboxArgs,
  ];
  const mcpResult = spawnSync(mcpCommand, mcpArguments, {
    cwd: staging,
    env: process.env,
    timeout: 30_000,
    stdio: 'inherit',
  });
  if (mcpResult.error) throw mcpResult.error;
  if (mcpResult.status !== 0)
    throw new Error(
      `The packaged MCP smoke check failed (${mcpResult.status ?? mcpResult.signal}).`,
    );
}

try {
  await copyProjectFiles();
  await installStagedDependencies();
  if (!updateLock) await makeInstaller();
  await rm(staging, { recursive: true, force: true });
  console.info(
    updateLock
      ? `Desktop runtime lock updated at ${lockPath}`
      : `Desktop artifacts are available in ${output}`,
  );
} catch (error) {
  console.error(`Desktop packaging failed. Build files were kept at ${staging}`);
  throw error;
}
