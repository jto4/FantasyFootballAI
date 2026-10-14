import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { LocalStore } from './store.js';
import { createChatSyncRouter } from './chat-sync-routes.js';
import { createDeliveryService } from './delivery-service.js';
import { DeliveryGuard } from './delivery-guard.js';
import { createImsgRouter } from './imsg-routes.js';
import { normalizeSettingsUpdate } from './settings-routes.js';
import { isValidSettingsUpdate } from './settings-validation.js';
import { purgeExpiredConversationSources } from './store-retention.js';
import type { SavedReport, OutboundMessage } from '@sidekick/core';
const guid = 'iMessage;+;fixture';
const message = {
  guid: 'message-1',
  text: 'Fictional chat text',
  author: '+15555550123',
  dateCreated: Date.now(),
  isFromMe: false,
  isAutoReply: false,
  isSystemMessage: false,
  isServiceMessage: false,
};
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-imsg-api-'));
  const store = new LocalStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
  await store.load();
  cleanup.push(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  await store.update((state) => {
    Object.assign(state.settings, {
      imessageProvider: 'imsg',
      imessageChatGuid: guid,
      imsgChatId: 42,
      memoryEnabled: true,
      analyzeImportsWithAI: false,
    });
  });
  return store;
}
async function serve(router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  cleanup.unshift(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error();
  return `http://127.0.0.1:${address.port}`;
}
function syncRouter(
  store: LocalStore,
  history: NonNullable<Parameters<typeof createChatSyncRouter>[0]['imsgHistory']>,
) {
  return createChatSyncRouter({
    store,
    readCredential: async () => {
      throw new Error('Native imsg must not read credentials');
    },
    configuredAI: async () => {
      throw new Error('AI must remain off');
    },
    autoSendChatReplyDrafts: async () => 0,
    imsgHistory: history,
    blueBubblesAutoSyncToken: 'fixture-token',
    twilioConversationAutoSyncToken: 'twilio-token',
    blueBubblesAutoSyncStatus: {},
    twilioConversationAutoSyncStatus: {},
    claims: { imessage: false, twilio: false },
  });
}
describe('native iMessage application integration', () => {
  it('syncs, deduplicates and retains selected-chat messages locally without credentials or AI', async () => {
    const store = await fixture();
    const fetchHistory = vi.fn(async () => [message]);
    const url = await serve(syncRouter(store, fetchHistory));
    const first = await fetch(`${url}/api/memory/imessage-sync`, { method: 'POST' });
    expect(first.status).toBe(200);
    expect((await first.json()).addedMessages).toBe(1);
    const again = await fetch(`${url}/api/memory/imessage-sync`, { method: 'POST' });
    expect((await again.json()).addedMessages).toBe(0);
    const state = store.snapshot();
    expect(state.memories).toHaveLength(1);
    expect(state.memories[0]?.sourceName).toBe('imsg group chat');
    expect(state.memories[0]?.sourceAuthorId).toBe(`imsg:${guid}\0${message.author}`);
    expect(state.settings.imessageSyncCursor?.chatGuid).toBe(`imsg:${guid}`);
    state.settings.conversationRetentionDays = 30;
    expect(purgeExpiredConversationSources(state, Date.now() + 31 * 86400000)).toBe(1);
    expect(state.memories[0]?.sourceText).toBe('');
  });
  it.each(['provider', 'chat', 'memory', 'path', 'rowid'] as const)(
    'aborts history after %s changes during the provider wait',
    async (change) => {
      const store = await fixture();
      const url = await serve(
        syncRouter(store, async () => {
          await store.update((state) => {
            if (change === 'provider') state.settings.imessageProvider = 'bluebubbles';
            if (change === 'chat') state.settings.imessageChatGuid = 'iMessage;+;other';
            if (change === 'memory') state.settings.memoryEnabled = false;
            if (change === 'path') state.settings.imsgExecutablePath = '/changed/imsg';
            if (change === 'rowid') state.settings.imsgChatId = 43;
          });
          return [message];
        }),
      );
      const response = await fetch(`${url}/api/memory/imessage-sync`, { method: 'POST' });
      expect(response.status).toBe(409);
      expect(store.snapshot().memories).toHaveLength(0);
    },
  );
  it('rechecks the provider after AI setup before sharing any participant messages', async () => {
    const store = await fixture();
    await store.update((state) => {
      state.settings.analyzeImportsWithAI = true;
    });
    const generate = vi.fn(async () => 'Must not receive chat data');
    const url = await serve(
      createChatSyncRouter({
        store,
        readCredential: async () => null,
        configuredAI: async () => {
          await store.update((state) => {
            state.settings.imessageProvider = 'bluebubbles';
          });
          return { id: 'fixture', generate };
        },
        autoSendChatReplyDrafts: async () => 0,
        imsgHistory: async () => [message],
        blueBubblesAutoSyncToken: 'fixture',
        twilioConversationAutoSyncToken: 'twilio-fixture',
        blueBubblesAutoSyncStatus: {},
        twilioConversationAutoSyncStatus: {},
        claims: { imessage: false, twilio: false },
      }),
    );
    const response = await fetch(`${url}/api/memory/imessage-sync`, { method: 'POST' });
    expect(response.status).toBe(409);
    expect(generate).not.toHaveBeenCalled();
    expect(store.snapshot().memories).toHaveLength(0);
  });
  it('pins immutable delivery body, GUID and executable; provider changes cannot reroute a retry', async () => {
    const store = await fixture();
    const send = vi.fn(async (_message: OutboundMessage) => ({
      providerMessageId: 'imsg:receipt',
    }));
    const credential = vi.fn(async () => null);
    const service = createDeliveryService({
      store,
      deliveryGuard: new DeliveryGuard(),
      readCredential: credential,
      resolveImsg: async () => '/fixture/imsg',
      channels: { imessage: () => ({ id: 'fixture', send }) },
    });
    const report = {
      id: 'fixture-report',
      title: 'Title',
      body: 'Original body',
      createdAt: new Date().toISOString(),
      kind: 'power-rankings',
      status: 'draft',
      citations: [],
      leagueId: 'fixture',
    } satisfies SavedReport;
    await store.update((state) => state.reports.push(report));
    const claim = await service.beginDelivery(report.id, 'imessage', undefined, guid);
    expect(claim?.envelope.providerIdentity).toBe('imsg:/fixture/imsg');
    await service.deliver(
      { title: 'Changed', body: 'Changed body' },
      'imessage',
      undefined,
      'iMessage;+;other',
      undefined,
      undefined,
      undefined,
      claim!.envelope,
    );
    expect(send.mock.calls[0]?.[0]).toEqual({ to: guid, body: 'Original body' });
    expect(credential).not.toHaveBeenCalled();
    await store.update((state) => {
      state.settings.imessageProvider = 'bluebubbles';
    });
    await expect(
      service.deliver(
        report,
        'imessage',
        undefined,
        guid,
        undefined,
        undefined,
        undefined,
        claim!.envelope,
      ),
    ).rejects.toThrow('original iMessage provider');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('preserves legacy defaults, validates configuration and requires renewed polling consent after a provider switch', async () => {
    const store = await fixture();
    const state = store.snapshot();
    for (const patch of [
      { imessageProvider: 'unknown' },
      { imsgChatId: -1 },
      { imsgChatId: 1.5 },
      { imsgExecutablePath: 'relative-command' },
    ])
      expect(isValidSettingsUpdate({ ...state.settings, ...patch }, new Set())).toBe(false);
    const updated = normalizeSettingsUpdate(
      {
        ...state.settings,
        imessageProvider: 'bluebubbles',
        imessageAutoSyncEnabled: true,
        chatRepliesEnabled: true,
        chatRepliesAutoSend: true,
      },
      state,
    );
    expect(updated.imessageAutoSyncEnabled).toBe(false);
    expect(updated.chatRepliesAutoSend).toBe(false);
    expect(updated.imessageSyncCursor).toBeUndefined();
  });
  it('installation checks fetch no chats; explicit discovery returns safe metadata and sanitized failures', async () => {
    const store = await fixture();
    const chats = vi.fn(async () => [
      { id: 42, guid, name: 'Fictional league', service: 'iMessage' as const },
    ]);
    const url = await serve(
      createImsgRouter({
        settingsSnapshot: () => store.settingsSnapshot(),
        resolve: async () => '/fixture/imsg',
        client: () => ({ version: async () => '0.15.10', chats }),
      }),
    );
    const response = await fetch(`${url}/api/imsg/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(await response.json()).toEqual({ available: true, version: '0.15.10' });
    expect(chats).not.toHaveBeenCalled();
    const listed = await fetch(`${url}/api/imsg/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect((await listed.json()).chats).toHaveLength(1);
    chats.mockRejectedValue(new Error('private-account and filesystem path'));
    const failed = await fetch(`${url}/api/imsg/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('private-account');
  });
});

it('verifies read access only for the saved target and discards contents without persistence', async () => {
  const store = await fixture();
  const history = vi.fn(async () => [message]);
  const url = await serve(
    createImsgRouter({
      settingsSnapshot: () => store.settingsSnapshot(),
      resolve: async () => '/fixture/imsg',
      client: () => ({ version: async () => '0.15.10', chats: async () => [], history }),
    }),
  );
  const before = store.snapshot();
  const request = (chatId: number) =>
    fetch(url + '/api/imsg/read-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chatGuid: guid, chatId, executablePath: '' }),
    });
  expect((await request(99)).status).toBe(409);
  expect(history).not.toHaveBeenCalled();
  const response = await request(42);
  expect(await response.json()).toEqual({ ok: true });
  expect(history).toHaveBeenCalledWith(guid, 42);
  expect(store.snapshot()).toEqual(before);
});
