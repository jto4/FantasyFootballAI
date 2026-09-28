import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { LocalStore } from '../apps/api/dist/store.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const apiEntry = join(repositoryRoot, 'apps', 'api', 'dist', 'index.js');

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

const home = await mkdtemp(join(tmpdir(), 'sidekick-mcp-delivery-'));
const databasePath = join(home, 'state.sqlite');
const port = await reservePort();
const seed = new LocalStore(databasePath);
await seed.load();
await seed.update((state) => {
  state.settings.newsSources = [];
  state.reports.push({
    id: 'mcp-draft',
    leagueId: 'league-1',
    kind: 'power-rankings',
    createdAt: new Date().toISOString(),
    title: 'Weekly rankings',
    body: 'Review this report before sending.',
    citations: [],
    status: 'draft',
  });
});
seed.close();

const child = spawn(process.execPath, [apiEntry], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SIDEKICK_PORT: String(port),
    SIDEKICK_DATABASE_FILE: databasePath,
    SIDEKICK_USER_DATA_DIR: home,
  },
  stdio: 'ignore',
});
const baseUrl = `http://127.0.0.1:${port}`;
async function request(path, method = 'GET', body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5_000),
  });
}

try {
  let healthy = false;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`MCP delivery API exited with ${child.exitCode}.`);
    try {
      const response = await request('/api/health');
      if (response.ok) {
        healthy = true;
        break;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.equal(healthy, true, 'MCP delivery API did not become healthy');

  const disabled = await request('/api/mcp/reports/mcp-draft/send', 'POST', {});
  assert.equal(disabled.status, 403);
  assert.match((await disabled.json()).error, /MCP sending is disabled/);

  const stateResponse = await request('/api/state');
  assert.equal(stateResponse.ok, true);
  const state = await stateResponse.json();
  const settings = { ...state.settings, mcpDeliveryEnabled: true };
  const saved = await request('/api/settings', 'PUT', settings);
  assert.equal(saved.ok, true, JSON.stringify(await saved.json()));

  const enabled = await request('/api/mcp/reports/mcp-draft/send', 'POST', {});
  assert.equal(enabled.status, 409);
  assert.match((await enabled.json()).error, /Enable a delivery channel/);
  const report = await request('/api/reports/mcp-draft').then((response) => response.json());
  assert.equal(report.status, 'draft');
  process.stdout.write('MCP report delivery permission integration passed.\n');
} finally {
  if (child.exitCode === null) child.kill('SIGTERM');
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 5_000).unref();
  });
  await rm(home, { recursive: true, force: true });
}
