import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServiceManager } from './service-manager.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const home = homedir();
const dataDirectory = join(home, '.sidekick');
const databaseFile = join(dataDirectory, 'state.sqlite');
const systemdUnit = join(home, '.config', 'systemd', 'user', 'sunday-sidekick.service');
const shouldExerciseSystemd =
  process.platform === 'linux' && process.env.SIDEKICK_LINUX_SERVICE_SMOKE === '1';

test(
  'runs and gracefully stops the built local API through a real systemd user service',
  { skip: !shouldExerciseSystemd, timeout: 60_000 },
  async () => {
    const apiEntry = join(repositoryRoot, 'apps', 'api', 'dist', 'index.js');
    await access(apiEntry);
    await assert.rejects(access(systemdUnit), { code: 'ENOENT' });
    await assert.rejects(access(dataDirectory), { code: 'ENOENT' });
    const port = await getAvailableLoopbackPort();

    const service = createServiceManager({
      platform: 'linux',
      home,
      repositoryRoot,
      servicePort: port,
      logger: { info() {} },
      // The production build runs immediately before this CI-only integration test.
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
      const unit = await readFile(systemdUnit, 'utf8');
      assert.ok(unit.includes(`Environment=SIDEKICK_PORT=${port}`));
      assert.ok(unit.includes('UMask=0077'));
      const health = await waitForHealth(port, true);
      assert.equal(health.localOnly, true);
      await access(databaseFile);

      await service.run('status');
      const status = spawnSync('systemctl', ['--user', 'is-active', 'sunday-sidekick.service'], {
        encoding: 'utf8',
      });
      assert.equal(status.status, 0, status.stderr);
      assert.equal(status.stdout.trim(), 'active');

      await service.run('stop');
      await waitForHealth(port, false);
      await service.run('start');
      assert.equal((await waitForHealth(port, true)).backgroundService, true);
      await service.run('stop');
      await service.run('uninstall');

      await assert.rejects(access(systemdUnit), { code: 'ENOENT' });
      const inactive = spawnSync('systemctl', ['--user', 'is-active', 'sunday-sidekick.service'], {
        encoding: 'utf8',
      });
      assert.notEqual(inactive.status, 0);
    } finally {
      await service.run('uninstall').catch(() => undefined);
      await rm(dataDirectory, { recursive: true, force: true });
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
