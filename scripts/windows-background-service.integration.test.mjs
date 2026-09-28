import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServiceManager } from './service-manager.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const shouldExerciseProductionService =
  process.platform === 'win32' && process.env.SIDEKICK_WINDOWS_SERVICE_SMOKE === '1';

test(
  'runs and gracefully stops the built local API through a real Windows logon task',
  { skip: !shouldExerciseProductionService, timeout: 60_000 },
  async () => {
    const apiEntry = join(repositoryRoot, 'apps', 'api', 'dist', 'index.js');
    await access(apiEntry);

    const temporaryRoot = await mkdtemp(join(tmpdir(), 'sidekick service lifecycle '));
    const taskRepository = join(temporaryRoot, 'checkout with spaces');
    const taskScript = join(taskRepository, 'scripts', 'service-runner.mjs');
    const home = join(temporaryRoot, 'user home');
    const dataDirectory = join(temporaryRoot, 'private data');
    const databaseFile = join(dataDirectory, 'state.sqlite');
    const legacyStateFile = join(dataDirectory, 'state.json');
    const port = await getAvailableLoopbackPort();
    const taskName = `Sunday Sidekick API CI ${process.pid}`;
    await mkdir(join(taskRepository, 'scripts'), { recursive: true });
    await mkdir(home, { recursive: true });
    await writeFile(
      taskScript,
      buildServiceWrapper({ apiEntry, databaseFile, dataDirectory, legacyStateFile, port }),
    );

    const statusOutput = [];
    const service = createServiceManager({
      platform: 'win32',
      home,
      repositoryRoot: taskRepository,
      nodePath: process.execPath,
      windowsTaskName: taskName,
      servicePort: port,
      // The production build runs immediately before this CI-only integration test.
      runCommand(program, args, options) {
        if (program.toLowerCase() === 'npm.cmd') return { status: 0 };
        const result = spawnSync(program, args, {
          cwd: options.cwd,
          encoding: 'utf8',
          windowsHide: true,
        });
        if (args[0] === '/Query') statusOutput.push(result.stdout ?? '');
        return { status: result.status, error: result.error };
      },
      logger: { info() {} },
    });
    const apiUrl = `http://127.0.0.1:${port}/api/health`;

    try {
      await service.run('install');
      const health = await waitForHealth(apiUrl, true);
      assert.equal(health.localOnly, true);
      await access(databaseFile);

      await service.run('status');
      assert.ok((statusOutput.at(-1) ?? '').includes(taskName));

      await service.run('stop');
      await waitForHealth(apiUrl, false);
      await service.run('start');
      assert.equal((await waitForHealth(apiUrl, true)).backgroundService, true);
      await service.run('stop');
      await service.run('uninstall');

      const query = spawnSync('schtasks.exe', ['/Query', '/TN', taskName], {
        encoding: 'utf8',
        windowsHide: true,
      });
      assert.notEqual(query.status, 0, 'The isolated service task should be removed.');
    } finally {
      await service.run('uninstall').catch(() => undefined);
      spawnSync('schtasks.exe', ['/End', '/TN', taskName], { windowsHide: true });
      spawnSync('schtasks.exe', ['/Delete', '/TN', taskName, '/F'], { windowsHide: true });
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  },
);

function buildServiceWrapper({ apiEntry, databaseFile, dataDirectory, legacyStateFile, port }) {
  return `import { spawn } from 'node:child_process';
const service = spawn(process.execPath, [${JSON.stringify(apiEntry)}], {
  cwd: ${JSON.stringify(repositoryRoot)},
  stdio: 'ignore',
  env: {
    ...process.env,
    SIDEKICK_SERVICE: '1',
    SIDEKICK_PORT: ${JSON.stringify(String(port))},
    SIDEKICK_USER_DATA_DIR: ${JSON.stringify(dataDirectory)},
    SIDEKICK_DATABASE_FILE: ${JSON.stringify(databaseFile)},
    SIDEKICK_DATA_FILE: ${JSON.stringify(legacyStateFile)},
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => service.kill(signal));
service.once('error', (error) => { console.error(error.message); process.exitCode = 1; });
service.once('exit', (code) => { process.exitCode = code ?? 1; });
`;
}

async function getAvailableLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function waitForHealth(url, expectedBackgroundState, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        const health = await response.json();
        if (health.backgroundService === expectedBackgroundState) return health;
      }
    } catch {
      if (!expectedBackgroundState) return undefined;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`The API did not reach backgroundService=${expectedBackgroundState} at ${url}.`);
}
