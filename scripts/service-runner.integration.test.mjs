import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const serviceRunner = join(repositoryRoot, 'scripts', 'service-runner.mjs');

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Source service did not stop in time.')),
      timeoutMs,
    );
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

await (async () => {
  const home = await mkdtemp(join(tmpdir(), 'sidekick-service-integration-'));
  const port = await reservePort();
  const child = spawn(process.execPath, [serviceRunner], {
    cwd: repositoryRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home, SIDEKICK_PORT: String(port) },
    stdio: 'ignore',
  });
  let exited = false;
  try {
    let healthy = false;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Service runner exited with ${child.exitCode}.`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
          signal: AbortSignal.timeout(500),
        });
        if (response.ok) {
          assert.equal((await response.json()).backgroundService, true);
          healthy = true;
          break;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.equal(healthy, true, 'source background API did not become healthy');

    let logs;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      logs = await fetch(`http://127.0.0.1:${port}/api/diagnostics/logs`).then((response) =>
        response.json(),
      );
      if (logs.entries.some((entry) => entry.event === 'api.started')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(logs.available, true);
    assert.ok(logs.entries.some((entry) => entry.event === 'api.started'));
    await stat(join(home, '.sidekick', 'logs', 'service.log'));

    const shutdown = await fetch(`http://127.0.0.1:${port}/api/shutdown`, { method: 'POST' });
    assert.equal(shutdown.status, 202);
    await waitForExit(child, 10_000);
    exited = true;
  } finally {
    if (!exited) {
      await fetch(`http://127.0.0.1:${port}/api/shutdown`, { method: 'POST' }).catch(
        () => undefined,
      );
      child.kill('SIGTERM');
      await waitForExit(child, 2_000).catch(() => undefined);
    }
    await rm(home, { recursive: true, force: true });
  }
})().then(() => console.log('Source background service log integration passed.'));
