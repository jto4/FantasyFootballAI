import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const apiEntry = join(repositoryRoot, 'apps', 'api', 'dist', 'index.js');
const home = await mkdtemp(join(tmpdir(), 'sidekick-backup-integration-'));
const temporaryDirectoryPrefix = 'sunday-sidekick-backup-';
const temporaryDirectoriesBefore = new Set(
  (await readdir(tmpdir())).filter((name) => name.startsWith(temporaryDirectoryPrefix)),
);
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, '127.0.0.1', resolve);
});
const port = reservation.address().port;
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);
const child = spawn(process.execPath, [apiEntry], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SIDEKICK_PORT: String(port),
    SIDEKICK_DATABASE_FILE: join(home, 'state.sqlite'),
    SIDEKICK_USER_DATA_DIR: home,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let childOutput = '';
child.stdout.setEncoding('utf8').on('data', (text) => (childOutput += text));
child.stderr.setEncoding('utf8').on('data', (text) => (childOutput += text));
const baseUrl = `http://127.0.0.1:${port}`;
let exited = false;

async function waitForExit(timeoutMs) {
  if (child.exitCode !== null) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Backup API did not stop in time.')),
      timeoutMs,
    );
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

try {
  let healthy = false;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Backup API exited with ${child.exitCode}. ${childOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        healthy = true;
        break;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.equal(healthy, true, 'backup API did not become healthy');

  const shortPassphrase = await fetch(`${baseUrl}/api/backup/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'too short' }),
  });
  assert.equal(shortPassphrase.status, 400);

  const encryptedResponse = await fetch(`${baseUrl}/api/backup/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'correct horse battery staple' }),
  });
  assert.equal(encryptedResponse.status, 200);
  assert.match(encryptedResponse.headers.get('content-type') ?? '', /encrypted-backup/);
  const encrypted = Buffer.from(await encryptedResponse.arrayBuffer());
  assert.equal(encrypted.subarray(0, 8).toString('ascii'), 'SSBKENC1');
  assert.equal(encrypted.includes(Buffer.from('SQLite format 3\0')), false);

  const wrongPassphrase = await fetch(`${baseUrl}/api/backup`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/vnd.sunday-sidekick.encrypted-backup',
      'x-sidekick-backup-passphrase': encodeURIComponent('wrong horse battery staple'),
    },
    body: encrypted,
  });
  assert.equal(wrongPassphrase.status, 400);
  assert.match((await wrongPassphrase.json()).error, /passphrase is incorrect/i);

  const restored = await fetch(`${baseUrl}/api/backup`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/vnd.sunday-sidekick.encrypted-backup',
      'x-sidekick-backup-passphrase': encodeURIComponent('correct horse battery staple'),
    },
    body: encrypted,
  });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).restored, true);

  const legacyZip = await fetch(`${baseUrl}/api/backup`);
  assert.equal(legacyZip.status, 200);
  assert.match(legacyZip.headers.get('content-type') ?? '', /application\/zip/);
  const legacyRestore = await fetch(`${baseUrl}/api/backup`, {
    method: 'PUT',
    headers: { 'content-type': 'application/vnd.sunday-sidekick.backup' },
    body: await legacyZip.arrayBuffer(),
  });
  assert.equal(legacyRestore.status, 200);
  assert.equal((await legacyRestore.json()).restored, true);

  const temporaryDirectoriesAfter = (await readdir(tmpdir())).filter((name) =>
    name.startsWith(temporaryDirectoryPrefix),
  );
  assert.deepEqual(
    temporaryDirectoriesAfter.filter((name) => !temporaryDirectoriesBefore.has(name)),
    [],
    'temporary backup directories should be removed after export',
  );

  const shutdown = await fetch(`${baseUrl}/api/shutdown`, { method: 'POST' });
  assert.equal(shutdown.status, 202);
  await waitForExit(10_000);
  exited = true;
} finally {
  if (!exited) {
    await fetch(`${baseUrl}/api/shutdown`, { method: 'POST' }).catch(() => undefined);
    child.kill('SIGTERM');
    await waitForExit(2_000).catch(() => undefined);
  }
  await rm(home, { recursive: true, force: true });
}

console.log('Encrypted portable backup API integration passed.');
