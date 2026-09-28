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

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Memory import API did not stop in time.')),
      timeoutMs,
    );
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const home = await mkdtemp(join(tmpdir(), 'sidekick-memory-import-'));
const port = await reservePort();
const databasePath = join(home, 'state.sqlite');
const aiCapturePath = join(home, 'ai-prompts.txt');
const aiCliPath = join(home, 'fake-ai.mjs');
await writeFile(
  aiCliPath,
  `import { appendFileSync } from 'node:fs';\n` +
    `appendFileSync(process.env.SIDEKICK_TEST_AI_CAPTURE, await new Promise((resolve) => { let value = ''; process.stdin.setEncoding('utf8').on('data', (part) => value += part).on('end', () => resolve(value)); }));\n` +
    `appendFileSync(process.env.SIDEKICK_TEST_AI_CAPTURE, '\\n---PROMPT---\\n');\n` +
    `process.stdout.write('Writing style:\\nShort, dry jokes with confident claims.\\nLeague context:\\nStrongly favors the Lions.');\n`,
);
const seedStore = new LocalStore(databasePath);
await seedStore.load();
await seedStore.update((state) => {
  state.settings.analyzeImportsWithAI = true;
  state.settings.newsSources = [];
  state.settings.aiRuntime = {
    mode: 'cli',
    model: 'fixture',
    command: process.execPath,
    args: JSON.stringify(aiCliPath),
    baseUrl: 'https://api.openai.com/v1',
  };
  state.memories.push({
    id: 'existing-alex-profile',
    name: 'Alex manager',
    sourceName: 'prior-export.txt',
    importedAt: '2026-09-01T00:00:00.000Z',
    sourceText: 'Earlier authored message.',
    styleNotes: 'Earlier style notes.',
    contextNotes: 'Earlier team preference.',
    banterPreference: 'Keep it competitive.',
    avoidTopics: 'Work',
  });
});
seedStore.close();
const child = spawn(process.execPath, [apiEntry], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SIDEKICK_PORT: String(port),
    SIDEKICK_DATABASE_FILE: databasePath,
    SIDEKICK_USER_DATA_DIR: home,
    SIDEKICK_TEST_AI_CAPTURE: aiCapturePath,
  },
  stdio: 'ignore',
});
const baseUrl = `http://127.0.0.1:${port}`;
let exited = false;

async function request(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5_000),
  });
  return response;
}

try {
  let healthy = false;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Memory import API exited with ${child.exitCode}.`);
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
  assert.equal(healthy, true, 'memory import API did not become healthy');

  for (const invalidConnection of [
    null,
    [],
    { platform: 'sleeper', leagueId: 'a'.repeat(129) },
    { platform: 'sleeper', leagueId: 'league-1', name: 'L'.repeat(121) },
    { platform: 'sleeper', leagueId: 'league-1', name: 'League\r\nBcc: attacker@example.com' },
  ]) {
    const rejected = await request('/api/leagues', 'POST', invalidConnection);
    assert.equal(rejected.status, 400);
  }

  const firstExport = JSON.stringify([
    { author: 'Alex', text: 'The Lions are absolutely winning this week.' },
    { author: 'Blair', text: 'You said that last week.' },
  ]);
  const preview = await request('/api/memory/import/preview', 'POST', { content: firstExport });
  assert.equal(preview.status, 200);
  assert.deepEqual((await preview.json()).participants, [
    { name: 'Alex', messageCount: 1 },
    { name: 'Blair', messageCount: 1 },
  ]);

  const firstImport = await request('/api/memory/import', 'POST', {
    sourceName: 'week-one.json',
    content: firstExport,
    profileByAuthor: { Alex: 'existing-alex-profile' },
  });
  assert.equal(firstImport.status, 201);
  assert.deepEqual(await firstImport.json(), {
    imported: 1,
    updated: 1,
    duplicates: 0,
    analysisFailures: 0,
  });

  const state = await request('/api/state').then((response) => response.json());
  const alex = state.memories.find((profile) => profile.id === 'existing-alex-profile');
  assert.ok(alex);
  assert.equal(alex.canMergeImportedConversation, true);
  assert.equal(alex.name, 'Alex manager');
  assert.equal(alex.banterPreference, 'Keep it competitive.');
  assert.equal(alex.avoidTopics, 'Work');
  const alexSource = await request(`/api/memory/${alex.id}/source`).then((response) =>
    response.text(),
  );
  const originalLength = alexSource.length;

  const secondExport = JSON.stringify([
    { author: 'Alex', text: 'The Lions are winning the championship too.' },
  ]);
  const merged = await request('/api/memory/import', 'POST', {
    sourceName: 'week-two.json',
    content: secondExport,
    profileByAuthor: { Alex: alex.id },
  });
  assert.equal(merged.status, 200);
  assert.deepEqual(await merged.json(), {
    imported: 0,
    updated: 1,
    duplicates: 0,
    analysisFailures: 0,
  });
  const afterMerge = await request('/api/state').then((response) => response.json());
  const updatedAlex = afterMerge.memories.find((profile) => profile.id === alex.id);
  assert.equal(updatedAlex.updatedAt !== undefined, true);
  assert.equal(updatedAlex.importedAt, alex.importedAt);
  const mergedSource = await request(`/api/memory/${alex.id}/source`).then((response) =>
    response.text(),
  );
  assert.ok(mergedSource.length > originalLength);
  assert.match(mergedSource, /week-two\.json/);
  assert.match(mergedSource, /The Lions are winning the championship too\./);
  assert.equal(updatedAlex.styleNotes, 'Short, dry jokes with confident claims.');
  assert.equal(updatedAlex.contextNotes, 'Strongly favors the Lions.');

  const aiPrompts = await readFile(aiCapturePath, 'utf8');
  assert.match(aiPrompts, /Earlier style notes\./);
  assert.match(aiPrompts, /Earlier team preference\./);
  assert.match(aiPrompts, /Blair/);
  assert.match(aiPrompts, /You said that last week\./);
  assert.equal(aiPrompts.match(/---PROMPT---/g)?.length, 3);

  const duplicate = await request('/api/memory/import', 'POST', {
    sourceName: 'same-export-different-filename.json',
    content: secondExport,
  });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), {
    imported: 0,
    updated: 0,
    duplicates: 1,
    analysisFailures: 0,
  });

  const invalidChatContextSetting = await request('/api/settings', 'PUT', {
    ...afterMerge.settings,
    includeMemberContextInChatReplies: 'yes',
  });
  assert.equal(invalidChatContextSetting.status, 400);

  const optOutSettings = {
    ...afterMerge.settings,
    analyzeImportsWithAI: false,
    includeMemberContextInReports: true,
    includeMemberContextInChatReplies: true,
  };
  const savedSettings = await request('/api/settings', 'PUT', optOutSettings);
  assert.equal(savedSettings.ok, true);
  const savedPrivacySettings = await request('/api/state').then((response) => response.json());
  assert.equal(savedPrivacySettings.settings.includeMemberContextInReports, true);
  assert.equal(savedPrivacySettings.settings.includeMemberContextInChatReplies, true);
  const localOnlyImport = await request('/api/memory/import', 'POST', {
    content: JSON.stringify([{ author: 'Casey', text: 'Save this without AI analysis.' }]),
  });
  assert.equal(localOnlyImport.status, 201);
  assert.deepEqual(await localOnlyImport.json(), {
    imported: 1,
    updated: 0,
    duplicates: 0,
    analysisFailures: 0,
  });
  const localOnlyState = await request('/api/state').then((response) => response.json());
  const casey = localOnlyState.memories.find((profile) => profile.name === 'Casey');
  assert.match(casey.styleNotes, /AI analysis is off/);
  assert.equal((await readFile(aiCapturePath, 'utf8')).match(/---PROMPT---/g)?.length, 3);

  const invalidMapping = await request('/api/memory/import', 'POST', {
    content: JSON.stringify([{ author: 'Nobody', text: 'This is not that member.' }]),
    profileByAuthor: { Nobody: 'missing-profile-id' },
  });
  assert.equal(invalidMapping.status, 400);

  const stopped = await request('/api/shutdown', 'POST');
  assert.equal(stopped.status, 202);
  await waitForExit(child, 10_000);
  exited = true;
} finally {
  if (!exited) {
    await request('/api/shutdown', 'POST').catch(() => undefined);
    child.kill('SIGTERM');
    await waitForExit(child, 2_000).catch(() => undefined);
  }
  await rm(home, { recursive: true, force: true });
}

console.log('Conversation import preview and profile merge integration passed.');
