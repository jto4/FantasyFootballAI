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
const accountSid = `AC${'a'.repeat(32)}`;
const conversationSid = `CH${'b'.repeat(32)}`;
const messageSid = `IM${'c'.repeat(32)}`;
const otherMessageSid = `IM${'d'.repeat(32)}`;
const blueBubblesChatGuid = 'demo-chat-guid';

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

const home = await mkdtemp(join(tmpdir(), 'sidekick-twilio-sync-'));
const databasePath = join(home, 'state.sqlite');
const preloadPath = join(home, 'twilio-fixture.cjs');
const fixturePath = join(home, 'twilio-response.json');
const promptPath = join(home, 'ai-prompts.json');
const localRevokeConsentPath = join(home, 'revoke-analysis-consent');
const port = await reservePort();
const seed = new LocalStore(databasePath);
await seed.load();
await seed.update((state) => {
  state.settings.newsSources = [];
  state.settings.smsRecipient = conversationSid;
  state.settings.twilioConversationAutoSyncEnabled = true;
  state.settings.analyzeImportsWithAI = true;
});
seed.close();
await writeFile(
  fixturePath,
  JSON.stringify({ status: 503, extraTwilioMessages: [], extraBlueBubblesMessages: [] }),
);
await writeFile(promptPath, '[]');

// Keep the API process real while replacing credentials and the two group-history HTTP boundaries.
await writeFile(
  preloadPath,
  `const { existsSync, readFileSync, unlinkSync, writeFileSync } = require('node:fs');\n` +
    `const keytar = require(${JSON.stringify(join(repositoryRoot, 'node_modules', 'keytar'))});\n` +
    `keytar.getPassword = async (_service, account) => account === 'twilio' ? JSON.stringify({ accountSid: ${JSON.stringify(accountSid)}, authToken: 'fixture-token' }) : account === 'openai' ? 'fixture-openai-key' : account === 'bluebubbles' ? JSON.stringify({ serverUrl: 'https://bluebubbles.example', serverPassword: 'fixture-password' }) : null;\n` +
    `keytar.setPassword = async () => {};\n` +
    `keytar.deletePassword = async () => true;\n` +
    `const originalFetch = globalThis.fetch;\n` +
    `globalThis.fetch = async (input, init) => {\n` +
    `  const url = new URL(String(input));\n` +
    `  if (url.origin === 'https://api.openai.com' && url.pathname === '/v1/chat/completions') {\n` +
    `    if (init?.headers?.authorization !== 'Bearer fixture-openai-key') return new Response('unauthorized', { status: 401 });\n` +
    `    const request = JSON.parse(String(init.body));\n` +
    `    const recorded = JSON.parse(readFileSync(${JSON.stringify(promptPath)}, 'utf8'));\n` +
    `    recorded.push(request.messages[1].content);\n` +
    `    writeFileSync(${JSON.stringify(promptPath)}, JSON.stringify(recorded));\n` +
    `    if (existsSync(${JSON.stringify(localRevokeConsentPath)})) {\n` +
    `      unlinkSync(${JSON.stringify(localRevokeConsentPath)});\n` +
    `      const current = await originalFetch('http://127.0.0.1:${port}/api/state').then(response => response.json());\n` +
    `      const changed = await originalFetch('http://127.0.0.1:${port}/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...current.settings, analyzeImportsWithAI: false }) });\n` +
    `      if (!changed.ok) throw new Error('Could not revoke conversation analysis consent in the fixture.');\n` +
    `      return Response.json({ choices: [{ message: { content: 'Writing style\\nSHOULD_NOT_SAVE_AFTER_REVOCATION\\nLeague context\\nprivate context' } }] });\n` +
    `    }\n` +
    `    return Response.json({ choices: [{ message: { content: 'Writing style\\nplayful\\nLeague context\\nfantasy manager' } }] });\n` +
    `  }\n` +
    `  if (url.origin === 'https://conversations.twilio.com' && url.pathname.endsWith('/Messages')) {\n` +
    `    const expected = 'Basic ' + Buffer.from(${JSON.stringify(`${accountSid}:fixture-token`)}).toString('base64');\n` +
    `    if (init?.headers?.authorization !== expected) return new Response('unauthorized', { status: 401 });\n` +
    `    const fixture = JSON.parse(readFileSync(${JSON.stringify(fixturePath)}, 'utf8'));\n` +
    `    if (fixture.status !== 200) return Response.json({ message: 'fixture unavailable' }, { status: fixture.status });\n` +
    `    return Response.json({ messages: [...${JSON.stringify([
      {
        sid: messageSid,
        index: 7,
        author: 'Alex',
        body: 'Only Alex talks about waiver pickups.',
        date_created: '2026-09-20T12:00:00.000Z',
      },
      {
        sid: otherMessageSid,
        index: 8,
        author: 'Blair',
        body: 'Blair has a different trade strategy.',
        date_created: '2026-09-20T12:01:00.000Z',
      },
    ])}, ...(JSON.parse(readFileSync(${JSON.stringify(fixturePath)}, 'utf8')).extraTwilioMessages ?? [])] });\n` +
    `  }\n` +
    `  if (url.origin === 'https://bluebubbles.example' && url.pathname === ${JSON.stringify(`/api/v1/chat/${blueBubblesChatGuid}/message`)}) {\n` +
    `    const fixture = JSON.parse(readFileSync(${JSON.stringify(fixturePath)}, 'utf8'));\n` +
    `    return Response.json({ data: [...${JSON.stringify([
      {
        guid: 'blue-message-alex',
        text: 'Alex roots for the rookie.',
        dateCreated: Date.parse('2026-09-20T13:00:00.000Z'),
        isFromMe: false,
        handle: { address: 'alex@example.com' },
      },
      {
        guid: 'blue-message-blair',
        text: 'Blair bets on the veteran.',
        dateCreated: Date.parse('2026-09-20T13:01:00.000Z'),
        isFromMe: false,
        handle: { address: 'blair@example.com' },
      },
    ])}, ...(fixture.extraBlueBubblesMessages ?? [])] });\n` +
    `  }\n` +
    `  return originalFetch(input, init);\n` +
    `};\n`,
);

const child = spawn(process.execPath, ['--require', preloadPath, apiEntry], {
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
    if (child.exitCode !== null) throw new Error(`Twilio sync API exited with ${child.exitCode}.`);
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
  assert.equal(healthy, true, 'Twilio sync API did not become healthy');

  const unavailable = await request('/api/memory/twilio-conversation-sync', 'POST', {});
  assert.equal(unavailable.status, 502);
  assert.match((await unavailable.json()).error, /history could not be read \(503\)/);
  const beforeRetry = await request('/api/state').then((response) => response.json());
  assert.equal(
    beforeRetry.memories.some((memory) => memory.name === 'Alex'),
    false,
  );
  assert.equal(beforeRetry.settings.twilioConversationSyncCursor, undefined);

  await writeFile(
    fixturePath,
    JSON.stringify({ status: 200, extraTwilioMessages: [], extraBlueBubblesMessages: [] }),
  );
  const sync = await request('/api/memory/twilio-conversation-sync', 'POST', {});
  const syncBody = await sync.json();
  assert.equal(sync.status, 200, JSON.stringify(syncBody));
  assert.deepEqual(syncBody, {
    addedMessages: 2,
    profilesUpdated: 2,
    checkedMessages: 2,
    hasMore: false,
    chatReplyDrafts: 0,
    chatRepliesSent: 0,
  });

  const state = await request('/api/state').then((response) => response.json());
  const profile = state.memories.find((memory) => memory.name === 'Alex');
  assert.ok(profile, 'Twilio author was persisted as a local member profile');
  assert.equal(profile.sourceName, 'Twilio Conversations group chat');
  const sourceText = await request(`/api/memory/${profile.id}/source`).then((response) =>
    response.text(),
  );
  assert.match(sourceText, /Only Alex talks about waiver pickups\./);
  assert.equal(state.settings.twilioConversationSyncCursor.conversationSid, conversationSid);
  assert.equal(state.settings.twilioConversationSyncCursor.lastIndex, 8);
  const prompts = JSON.parse(await readFile(promptPath, 'utf8'));
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /Only Alex talks about waiver pickups\./);
  assert.doesNotMatch(prompts[0], /Blair has a different trade strategy\./);
  assert.match(prompts[1], /Blair has a different trade strategy\./);
  assert.doesNotMatch(prompts[1], /Only Alex talks about waiver pickups\./);

  await writeFile(
    fixturePath,
    JSON.stringify({
      status: 200,
      extraTwilioMessages: [
        {
          sid: `IM${'e'.repeat(32)}`,
          index: 9,
          author: 'Alex',
          body: 'Alex shared another waiver note.',
          date_created: '2026-09-20T12:02:00.000Z',
        },
      ],
      extraBlueBubblesMessages: [],
    }),
  );
  await writeFile(localRevokeConsentPath, 'revoke');
  const revokedTwilioSync = await request('/api/memory/twilio-conversation-sync', 'POST', {});
  assert.equal(revokedTwilioSync.status, 200);
  const afterTwilioRevocation = await request('/api/state').then((response) => response.json());
  assert.equal(afterTwilioRevocation.settings.analyzeImportsWithAI, false);
  assert.equal(
    afterTwilioRevocation.memories.find((memory) => memory.name === 'Alex').styleNotes,
    'playful',
    'the in-flight AI result is not saved after opt-out',
  );
  assert.equal(JSON.parse(await readFile(promptPath, 'utf8')).length, 3);

  const settings = await request('/api/settings', 'PUT', {
    ...state.settings,
    imessageChatGuid: blueBubblesChatGuid,
  });
  assert.equal(settings.ok, true);
  const blueSync = await request('/api/memory/imessage-sync', 'POST', {});
  const blueSyncBody = await blueSync.json();
  assert.equal(blueSync.status, 200, JSON.stringify(blueSyncBody));
  assert.equal(blueSyncBody.addedMessages, 2);
  assert.equal(blueSyncBody.profilesUpdated, 2);
  const allPrompts = JSON.parse(await readFile(promptPath, 'utf8'));
  assert.equal(allPrompts.length, 5);
  assert.match(allPrompts[3], /Alex roots for the rookie\./);
  assert.doesNotMatch(allPrompts[3], /Blair bets on the veteran\./);
  assert.match(allPrompts[4], /Blair bets on the veteran\./);
  assert.doesNotMatch(allPrompts[4], /Alex roots for the rookie\./);

  await writeFile(
    fixturePath,
    JSON.stringify({
      status: 200,
      extraTwilioMessages: [
        {
          sid: `IM${'e'.repeat(32)}`,
          index: 9,
          author: 'Alex',
          body: 'Alex shared another waiver note.',
          date_created: '2026-09-20T12:02:00.000Z',
        },
      ],
      extraBlueBubblesMessages: [
        {
          guid: 'blue-message-alex-revoked',
          text: 'Alex mentioned another rookie.',
          dateCreated: Date.parse('2026-09-20T13:02:00.000Z'),
          isFromMe: false,
          handle: { address: 'alex@example.com' },
        },
      ],
    }),
  );
  await writeFile(localRevokeConsentPath, 'revoke');
  const revokedBlueSync = await request('/api/memory/imessage-sync', 'POST', {});
  assert.equal(revokedBlueSync.status, 200);
  const afterBlueRevocation = await request('/api/state').then((response) => response.json());
  assert.equal(afterBlueRevocation.settings.analyzeImportsWithAI, false);
  assert.equal(
    afterBlueRevocation.memories.find((memory) => memory.name === 'Alex').styleNotes,
    'playful',
    'BlueBubbles does not save analysis after opt-out either',
  );
  assert.equal(JSON.parse(await readFile(promptPath, 'utf8')).length, 6);

  const repeated = await request('/api/memory/twilio-conversation-sync', 'POST', {});
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).addedMessages, 0, 'cursor prevents duplicate imports');

  const disabled = await request('/api/settings', 'PUT', {
    ...state.settings,
    memoryEnabled: false,
  });
  assert.equal(disabled.ok, true);
  const blocked = await request('/api/memory/twilio-conversation-sync', 'POST', {});
  assert.equal(blocked.status, 409);
  assert.match((await blocked.json()).error, /Enable member memory/);

  await request('/api/shutdown', 'POST');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Twilio sync API did not stop.')), 10_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  process.stdout.write('Twilio and BlueBubbles group-chat memory isolation integration passed.\n');
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
