import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OutboundMessage, SavedReport } from '@sidekick/core';
import { LocalStore } from './store.js';
import { DeliveryGuard } from './delivery-guard.js';
import { createDeliveryService } from './delivery-service.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-delivery-text-'));
  const store = new LocalStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
  await store.load();
  cleanup.push(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const messages: OutboundMessage[] = [];
  const channel = () => ({
    id: 'dummy',
    send: async (message: OutboundMessage) => {
      messages.push(message);
      return { providerMessageId: 'dummy-id' };
    },
  });
  const service = createDeliveryService({
    store,
    deliveryGuard: new DeliveryGuard(),
    readCredential: async (provider) =>
      JSON.stringify(
        provider === 'twilio'
          ? { accountSid: 'dummy-account', authToken: 'dummy-token', from: '+15555550111' }
          : { serverUrl: 'http://127.0.0.1:9999', serverPassword: 'dummy-password' },
      ),
    channels: { sms: channel, imessage: channel },
  });
  return { store, messages, service };
}

describe('Unicode delivery text', () => {
  it.each([
    ['sms', '+15555550123', 1500],
    ['sms', 'CH' + '1'.repeat(32), 1600],
    ['imessage', 'fictional-chat', 10000],
  ] as const)('records and sends the same intact %s text', async (channel, destination, limit) => {
    const f = await fixture();
    const prefix = 'F'.repeat(limit - 1);
    const report: SavedReport = {
      id: 'unicode',
      leagueId: 'fictional',
      kind: 'chat-reply',
      createdAt: new Date().toISOString(),
      title: 'Fictional message',
      body: prefix + '🏈 More text.',
      citations: [],
      status: 'draft',
      revision: 0,
    };
    await f.store.update((state) => {
      state.reports.push(report);
    });
    const attempt = await f.service.beginDelivery(report.id, channel, undefined, destination);
    expect(attempt!.envelope.body).toBe(prefix);
    await f.service.deliver(
      report,
      channel,
      undefined,
      destination,
      undefined,
      undefined,
      attempt!.idempotencyKey,
      attempt!.envelope,
    );
    expect(f.messages[0]!.body).toBe(prefix);
    // A retry uses the stored envelope even when a later caller supplies different text.
    await f.service.deliver(
      { title: 'Changed', body: 'Changed text' },
      channel,
      undefined,
      destination,
      undefined,
      undefined,
      attempt!.idempotencyKey,
      attempt!.envelope,
    );
    expect(f.messages[1]!.body).toBe(prefix);
    const raw = { title: 'Fictional message', body: prefix + '👍🏽 More text.' };
    await f.service.deliver(raw, channel, undefined, destination);
    expect(f.messages[2]!.body).toBe(prefix);
  });
});
