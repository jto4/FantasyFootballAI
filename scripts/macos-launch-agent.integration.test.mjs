import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServiceManager } from './service-manager.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const userId = process.getuid?.();
const shouldExerciseLaunchAgent =
  process.platform === 'darwin' && process.env.SIDEKICK_MACOS_LAUNCH_AGENT_SMOKE === '1';

test(
  'runs and stops the built local API through a real macOS LaunchAgent',
  { skip: !shouldExerciseLaunchAgent, timeout: 60_000 },
  async () => {
    assert.notEqual(userId, undefined);
    const apiEntry = join(repositoryRoot, 'apps', 'api', 'dist', 'index.js');
    await access(apiEntry);

    const domain = `gui/${userId}`;
    const existing = spawnSync('launchctl', ['print', `${domain}/com.sundaysidekick.app`], {
      encoding: 'utf8',
    });
    assert.notEqual(
      existing.status,
      0,
      'Refusing to replace an already loaded Sunday Sidekick LaunchAgent.',
    );

    const temporaryRoot = await mkdtemp(join(tmpdir(), 'sidekick-launch-agent-'));
    const home = join(temporaryRoot, 'home');
    const dataDirectory = join(home, '.sidekick');
    const launchAgent = join(home, 'Library', 'LaunchAgents', 'com.sundaysidekick.app.plist');
    const databaseFile = join(dataDirectory, 'state.sqlite');
    const port = await getAvailableLoopbackPort();
    const service = createServiceManager({
      platform: 'darwin',
      home,
      repositoryRoot,
      userId,
      servicePort: port,
      logger: { info() {} },
      // The production build runs immediately before this CI/manual integration check.
      runCommand(program, args, options) {
        if (program === 'npm') return { status: 0 };
        const result = spawnSync(program, args, {
          cwd: options.cwd,
          encoding: 'utf8',
        });
        return { status: result.status, error: result.error };
      },
    });

    try {
      await service.run('install');
      const plist = await readFile(launchAgent, 'utf8');
      assert.ok(plist.includes(`<key>SIDEKICK_PORT</key><string>${port}</string>`));
      assert.ok(
        plist.includes(`<key>SIDEKICK_USER_DATA_DIR</key><string>${dataDirectory}</string>`),
      );

      const health = await waitForHealth(port, true);
      assert.equal(health.localOnly, true);
      await access(databaseFile);

      await service.run('status');
      const status = spawnSync('launchctl', ['print', `${domain}/com.sundaysidekick.app`], {
        encoding: 'utf8',
      });
      assert.equal(status.status, 0, status.stderr);

      await service.run('stop');
      await waitForHealth(port, false);
      await service.run('start');
      assert.equal((await waitForHealth(port, true)).backgroundService, true);
      await service.run('stop');
      await service.run('uninstall');

      const unloaded = spawnSync('launchctl', ['print', `${domain}/com.sundaysidekick.app`], {
        encoding: 'utf8',
      });
      assert.notEqual(unloaded.status, 0);
    } finally {
      await service.run('uninstall').catch(() => undefined);
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  },
);

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

async function waitForHealth(port, expectedBackgroundState, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        const health = await response.json();
        if (health.backgroundService === expectedBackgroundState) return health;
      }
    } catch {
      if (!expectedBackgroundState) return undefined;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`The API did not reach backgroundService=${expectedBackgroundState}.`);
}
