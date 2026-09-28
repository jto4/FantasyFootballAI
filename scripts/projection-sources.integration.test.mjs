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

const home = await mkdtemp(join(tmpdir(), 'sidekick-projection-sources-'));
const databasePath = join(home, 'state.sqlite');
const port = await reservePort();
const seed = new LocalStore(databasePath);
await seed.load();
await seed.update((state) => {
  state.settings.newsSources = [];
  state.leagues.push({
    id: 'projection-league',
    platform: 'sleeper',
    name: 'Projection test',
    displayName: 'Projection test',
    teamCount: 2,
    scoring: {},
    settings: {},
    teams: [],
    connectedAt: new Date().toISOString(),
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
    if (child.exitCode !== null)
      throw new Error(`Projection import API exited with ${child.exitCode}.`);
    try {
      if ((await request('/api/health')).ok) {
        healthy = true;
        break;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.equal(healthy, true, 'Projection import API did not become healthy');

  async function importSource(
    sourceName,
    scoringMatched = true,
    sourceUrl = `https://example.com/${sourceName.toLowerCase().replaceAll(' ', '-')}`,
  ) {
    const response = await request('/api/projections/import', 'POST', {
      leagueId: 'projection-league',
      sourceName,
      sourceUrl,
      scoringMatched,
      csv: 'player,playerId,position,points,adp\nPlayer One,p1,WR,220,12.5\nPlayer Two,p2,RB,180,24',
    });
    return response;
  }

  const missingConfirmation = await request('/api/projections/import', 'POST', {
    leagueId: 'projection-league',
    sourceName: 'Missing confirmation',
    csv: 'player,points\nPlayer One,100',
  });
  assert.equal(missingConfirmation.status, 400);
  assert.match((await missingConfirmation.json()).error, /Confirm whether.*scoring/);

  assert.equal((await importSource('Source A')).status, 201);
  assert.equal((await importSource('Source B')).status, 201);
  assert.equal((await importSource('Source C')).status, 201);
  assert.equal((await importSource('Unconfirmed source', false)).status, 201);
  const initial = await request('/api/projections').then((response) => response.json());
  assert.equal(initial.length, 4);
  const sourceA = initial.find((source) => source.sourceName === 'Source A');
  assert.ok(sourceA);
  assert.equal(sourceA.count, 2);
  const unconfirmed = initial.find((source) => source.sourceName === 'Unconfirmed source');
  assert.equal(unconfirmed.scoringMatched, false);
  assert.equal(
    (
      await request(
        `/api/projections/projection-league/source/${encodeURIComponent(unconfirmed.sourceId)}`,
        'DELETE',
      )
    ).status,
    204,
  );

  assert.equal((await importSource('Source A')).status, 201);
  const replaced = await request('/api/projections').then((response) => response.json());
  assert.equal(replaced.length, 3, 're-import replaces the matching source set only');
  assert.equal(
    replaced.find((source) => source.sourceName === 'Source A')?.sourceId,
    sourceA.sourceId,
  );

  const deleted = await request(
    `/api/projections/projection-league/source/${encodeURIComponent(sourceA.sourceId)}`,
    'DELETE',
  );
  assert.equal(deleted.status, 204);
  const remaining = await request('/api/projections').then((response) => response.json());
  assert.deepEqual(remaining.map((source) => source.sourceName).sort(), ['Source B', 'Source C']);

  for (const name of ['Source D', 'Source E', 'Source F', 'Source G', 'Source H'])
    assert.equal((await importSource(name)).status, 201);
  const concurrentAdds = await Promise.all([importSource('Source I'), importSource('Source J')]);
  assert.deepEqual(
    concurrentAdds.map((response) => response.status).sort(),
    [201, 409],
    'serialized imports do not exceed the per-league source limit',
  );
  const atCapacity = await request('/api/projections').then((response) => response.json());
  assert.equal(atCapacity.length, 8);
  const overflow = await importSource('Source K');
  assert.equal(overflow.status, 409);
  assert.match((await overflow.json()).error, /at most 8 projection sources/);
  process.stdout.write(
    'Projection source import, replacement, deletion, and limit integration passed.\n',
  );
} finally {
  if (child.exitCode === null) {
    await request('/api/shutdown', 'POST').catch(() => undefined);
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 2_000);
    });
  }
  await rm(home, { recursive: true, force: true });
}
