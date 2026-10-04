import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

const home = await mkdtemp(join(tmpdir(), 'sidekick-report-memory-'));
const databasePath = join(home, 'state.sqlite');
const fakeAIPath = join(home, 'fake-ai.mjs');
const promptPath = join(home, 'report-prompt.txt');
const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const seed = new LocalStore(databasePath);
await seed.load();
await seed.update((state) => {
  state.settings.newsSources = [];
  state.settings.includeMemberContextInReports = true;
  state.settings.aiRuntime = {
    mode: 'cli',
    model: 'fixture',
    command: process.execPath,
    args: JSON.stringify(fakeAIPath),
    baseUrl: 'https://api.openai.com/v1',
  };
  state.leagues.push({
    id: 'consent-league',
    platform: 'sleeper',
    name: 'Consent League',
    displayName: 'Consent League',
    teamCount: 1,
    scoring: {},
    settings: {},
    teams: [{ id: 'one', name: 'Local Team', wins: 1, losses: 0, roster: [] }],
    connectedAt: new Date().toISOString(),
  });
  state.memories.push({
    id: 'private-profile',
    name: 'League member',
    sourceName: 'private test source',
    importedAt: new Date().toISOString(),
    sourceText: 'Private source text.',
    styleNotes: 'PRIVATE_REPORT_STYLE_SENTINEL',
    contextNotes: 'PRIVATE_REPORT_CONTEXT_SENTINEL',
    banterPreference: '',
    avoidTopics: '',
  });
});
seed.close();

await writeFile(
  fakeAIPath,
  `import { writeFileSync } from 'node:fs';\n` +
    `let prompt = '';\n` +
    `process.stdin.setEncoding('utf8');\n` +
    `process.stdin.on('data', (part) => (prompt += part));\n` +
    `process.stdin.on('end', async () => {\n` +
    `  writeFileSync(process.env.SIDEKICK_TEST_REPORT_PROMPT, prompt);\n` +
    `  const current = await fetch('http://127.0.0.1:${port}/api/state').then((response) => response.json());\n` +
    `  const changed = await fetch('http://127.0.0.1:${port}/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...current.settings, includeMemberContextInReports: false }) });\n` +
    `  if (!changed.ok) { process.exitCode = 1; return; }\n` +
    `  process.stdout.write('Generated report that must be discarded.');\n` +
    `});\n`,
  { mode: 0o600 },
);

const child = spawn(process.execPath, [apiEntry], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SIDEKICK_PORT: String(port),
    SIDEKICK_DATABASE_FILE: databasePath,
    SIDEKICK_USER_DATA_DIR: home,
    SIDEKICK_TEST_REPORT_PROMPT: promptPath,
  },
  stdio: 'ignore',
});

async function request(path, method = 'GET', body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
}

try {
  let healthy = false;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Report API exited with ${child.exitCode}.`);
    try {
      if ((await request('/api/health')).ok) {
        healthy = true;
        break;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.equal(healthy, true, 'Report API did not become healthy');

  const generated = await request('/api/reports/power-rankings', 'POST', {
    leagueId: 'consent-league',
    draftOnly: true,
  });
  assert.equal(generated.status, 502);
  assert.match((await generated.json()).error, /member-memory sharing changed/);
  const currentState = await request('/api/state').then((response) => response.json());
  assert.equal(currentState.settings.includeMemberContextInReports, false);
  assert.equal(currentState.reports.length, 0, 'the post-revocation report draft is discarded');
  const prompt = await readFile(promptPath, 'utf8');
  assert.match(prompt, /PRIVATE_REPORT_STYLE_SENTINEL/);
  assert.match(prompt, /PRIVATE_REPORT_CONTEXT_SENTINEL/);

  await request('/api/shutdown', 'POST');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Report API did not stop.')), 10_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  process.stdout.write('Report memory-consent revocation integration passed.\n');
} finally {
  if (child.exitCode === null) {
    await request('/api/shutdown', 'POST').catch(() => undefined);
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 5_000).unref();
    });
  }
  await rm(home, { recursive: true, force: true });
}
