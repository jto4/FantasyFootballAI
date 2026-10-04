import { createHash, randomUUID } from 'node:crypto';
import type { SavedReport, DeliveryEnvelope, MessageChannel } from '@sidekick/core';
import {
  BlueBubblesChannel,
  DeliveryFailure,
  ResendChannel,
  TwilioChannel,
  TwilioConversationsChannel,
} from '@sidekick/integrations';
import type { LocalStore } from './store.js';
import type { CredentialProvider } from './credentials.js';
import { DeliveryGuard } from './delivery-guard.js';
import { makeDeliveryAttempt } from './delivery-state.js';
import { parseSecret } from './provider-config.js';
import { logEvent, errorName } from './logger.js';
export interface DeliveryDependencies {
  store: LocalStore;
  readCredential: (provider: CredentialProvider) => Promise<string | null>;
  deliveryGuard: DeliveryGuard;
  channels?: Partial<
    Record<
      DeliveryEnvelope['channel'],
      (config: Record<string, unknown>, destination: string) => MessageChannel
    >
  >;
}
export function createDeliveryService({
  store,
  readCredential,
  deliveryGuard,
  channels,
}: DeliveryDependencies) {
  async function deliver(
    report: { title: string; body: string },
    channel: string,
    email?: string,
    recipient?: string,
    replyToId?: string,
    emailSubject?: string,
    idempotencyKey?: string,
    envelope?: DeliveryEnvelope,
  ) {
    if (envelope) {
      channel = envelope.channel;
      email = envelope.destination;
      recipient = envelope.destination;
      report = { title: envelope.subject, body: envelope.body };
      replyToId = envelope.replyToId;
      emailSubject = envelope.subject;
    }
    if (channel === 'email') {
      const config = parseSecret(await readCredential('resend'));
      if (!email || typeof config.apiKey !== 'string' || typeof config.from !== 'string')
        throw new Error('Set an email recipient and Resend API key/from address in Settings.');
      if (
        envelope?.credentialFingerprint &&
        createHash('sha256').update(config.apiKey).digest('hex') !== envelope.credentialFingerprint
      )
        throw new DeliveryFailure(
          'The original Resend credential changed. Restore its configuration before retrying.',
          true,
        );
      if (envelope && config.from !== envelope.sender)
        throw new DeliveryFailure(
          'The original email sender changed. Restore its sender configuration before retrying.',
          true,
        );
      return (
        channels?.email?.(config, email) ??
        new ResendChannel(config.apiKey, envelope?.sender ?? config.from)
      ).send({
        to: email,
        subject: emailSubject ?? (replyToId ? `Re: ${report.title}` : report.title),
        body: report.body,
        ...(replyToId ? { replyToId } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
    }
    if (channel === 'sms') {
      const config = parseSecret(await readCredential('twilio'));
      if (
        !recipient ||
        typeof config.accountSid !== 'string' ||
        typeof config.authToken !== 'string'
      )
        throw new Error(
          'Set a phone recipient or Conversation SID and Twilio account details in Settings.',
        );
      if (
        envelope &&
        (config.accountSid !== envelope.providerIdentity ||
          (!/^CH/.test(recipient) && config.from !== envelope.sender))
      )
        throw new Error(
          'The original Twilio account or sender changed. Restore its configuration before retrying.',
        );
      if (/^CH[0-9a-fA-F]{32}$/.test(recipient)) {
        return (
          channels?.sms?.(config, recipient) ??
          new TwilioConversationsChannel(config.accountSid, config.authToken)
        ).send({
          to: recipient,
          body: report.body.slice(0, 1_600),
        });
      }
      if (typeof config.from !== 'string')
        throw new Error('Set the Twilio sender number for direct SMS delivery in Settings.');
      return (
        channels?.sms?.(config, recipient) ??
        new TwilioChannel(config.accountSid, config.authToken, config.from)
      ).send({
        to: recipient,
        body: report.body.slice(0, 1500),
      });
    }
    if (channel === 'imessage') {
      const config = parseSecret(await readCredential('bluebubbles'));
      if (typeof config.serverUrl !== 'string' || typeof config.serverPassword !== 'string')
        throw new Error('Configure a BlueBubbles server URL and password in Settings.');
      if (!recipient) throw new Error('Set a BlueBubbles chat identifier in Settings.');
      if (envelope && config.serverUrl !== envelope.providerIdentity)
        throw new Error(
          'The original iMessage server changed. Restore its configuration before retrying.',
        );
      return (
        channels?.imessage?.(config, recipient) ??
        new BlueBubblesChannel(config.serverUrl, config.serverPassword)
      ).send({
        to: recipient,
        body: report.body.slice(0, 10_000),
      });
    }
    throw new Error('Unsupported delivery channel.');
  }

  async function prepareEnvelope(
    report: SavedReport,
    channel: 'email' | 'sms' | 'imessage',
    email?: string,
    recipient?: string,
    replyToId?: string,
    emailSubject?: string,
  ): Promise<DeliveryEnvelope> {
    if (report.deliveryEnvelope) return structuredClone(report.deliveryEnvelope);
    if (report.deliveryState === 'uncertain')
      throw new Error(
        'This older uncertain attempt has no saved delivery envelope. Check provider history; automatic retry is unavailable.',
      );
    const config = parseSecret(
      await readCredential(
        channel === 'email' ? 'resend' : channel === 'sms' ? 'twilio' : 'bluebubbles',
      ),
    );
    const destination = channel === 'email' ? email : recipient;
    if (!destination) throw new Error('Configure a delivery destination first.');
    if (
      channel === 'email' &&
      (typeof config.apiKey !== 'string' || typeof config.from !== 'string')
    )
      throw new Error('Configure the Resend API key and sender first.');
    if (
      channel === 'sms' &&
      (typeof config.accountSid !== 'string' ||
        typeof config.authToken !== 'string' ||
        (!/^CH/.test(destination) && typeof config.from !== 'string'))
    )
      throw new Error('Configure the Twilio account and sender first.');
    if (
      channel === 'imessage' &&
      (typeof config.serverUrl !== 'string' || typeof config.serverPassword !== 'string')
    )
      throw new Error('Configure the iMessage server first.');
    return {
      channel,
      destination,
      ...(channel === 'email' && typeof config.apiKey === 'string'
        ? { credentialFingerprint: createHash('sha256').update(config.apiKey).digest('hex') }
        : {}),
      sender: typeof config.from === 'string' ? config.from : '',
      ...(channel === 'sms' && typeof config.accountSid === 'string'
        ? { providerIdentity: config.accountSid }
        : {}),
      ...(channel === 'imessage' && typeof config.serverUrl === 'string'
        ? { providerIdentity: config.serverUrl }
        : {}),
      subject: emailSubject ?? (replyToId ? `Re: ${report.title}` : report.title),
      body:
        channel === 'sms'
          ? report.body.slice(0, /^CH/.test(destination) ? 1600 : 1500)
          : channel === 'imessage'
            ? report.body.slice(0, 10000)
            : report.body,
      ...(replyToId ? { replyToId } : {}),
    };
  }

  async function updateDeliveryState(
    reportId: string,
    deliveryState: 'failed' | 'uncertain',
  ): Promise<void> {
    await store.update((current) => {
      const target = current.reports.find((item) => item.id === reportId);
      if (!target || target.status !== 'draft') return;
      const attempt = target.deliveryAttempts?.at(-1);
      if (attempt?.status === 'sending') {
        attempt.status = deliveryState;
        attempt.finishedAt = new Date().toISOString();
      }
      target.deliveryState = deliveryState;
      target.deliveryUpdatedAt = new Date().toISOString();
    });
  }

  async function beginDelivery(
    reportId: string,
    channel: 'email' | 'sms' | 'imessage',
    email?: string,
    recipient?: string,
    replyToId?: string,
    emailSubject?: string,
  ): Promise<{ idempotencyKey?: string; envelope: DeliveryEnvelope } | undefined> {
    const report = store.snapshot().reports.find((item) => item.id === reportId);
    if (!report) return undefined;
    const envelope = await prepareEnvelope(
      report,
      channel,
      email,
      recipient,
      replyToId,
      emailSubject,
    );
    channel = envelope.channel;
    let claim: { idempotencyKey?: string; envelope: DeliveryEnvelope } | undefined;
    await store.update((current) => {
      const target = current.reports.find((item) => item.id === reportId);
      if (!target || target.status !== 'draft' || target.deliveryState === 'sending') return;
      target.deliveryEnvelope ??= envelope;
      const startedAt = new Date().toISOString();
      const attempt = makeDeliveryAttempt(
        channel,
        startedAt,
        target.deliveryAttempts?.at(-1),
        randomUUID(),
      );
      target.deliveryAttempts = [...(target.deliveryAttempts ?? []).slice(-49), attempt];
      target.deliveryState = 'sending';
      target.deliveryUpdatedAt = startedAt;
      claim = {
        ...(attempt.idempotencyKey ? { idempotencyKey: attempt.idempotencyKey } : {}),
        envelope: target.deliveryEnvelope,
      };
    });
    return claim;
  }

  async function completeDelivery(reportId: string, providerMessageId: string): Promise<void> {
    await store.update((current) => {
      const target = current.reports.find((item) => item.id === reportId);
      if (!target) return;
      const finishedAt = new Date().toISOString();
      const attempt = target.deliveryAttempts?.at(-1);
      if (attempt) {
        attempt.status = 'sent';
        attempt.finishedAt = finishedAt;
        attempt.providerMessageId = providerMessageId;
      }
      target.status = 'sent';
      delete target.deliveryState;
      target.deliveryUpdatedAt = finishedAt;
    });
  }

  async function autoSendChatReplyDrafts(drafts: SavedReport[]): Promise<number> {
    let sent = 0;
    for (const draft of drafts) {
      const settings = store.settingsSnapshot();
      if (!settings.chatRepliesEnabled || !settings.chatRepliesAutoSend) break;
      const channel = draft.replyChannel;
      if (channel !== 'sms' && channel !== 'imessage') continue;
      const recipient = draft.replyDestination;
      if (
        typeof recipient !== 'string' ||
        !recipient.trim() ||
        recipient.length > 500 ||
        /[\r\n]/.test(recipient) ||
        (channel === 'sms' && !/^CH[0-9a-fA-F]{32}$/.test(recipient))
      )
        continue;
      const configuredDestination =
        channel === 'sms' ? settings.smsRecipient : settings.imessageChatGuid;
      if (configuredDestination !== recipient) continue;
      if (!deliveryGuard.acquire(draft.id)) continue;
      const persistentClaim = store.claimReportDelivery(draft.id);
      if (!persistentClaim) {
        deliveryGuard.release(draft.id);
        continue;
      }
      try {
        const claim = await beginDelivery(draft.id, channel, settings.emailRecipient, recipient);
        if (!claim) {
          store.finishReportDeliveryClaim(draft.id, persistentClaim, 'failed');
          continue;
        }
        const receipt = await deliver(
          draft,
          channel,
          settings.emailRecipient,
          recipient,
          undefined,
          undefined,
          claim.idempotencyKey,
          claim.envelope,
        );
        await completeDelivery(draft.id, receipt.providerMessageId);
        store.finishReportDeliveryClaim(draft.id, persistentClaim, 'sent');
        sent += 1;
      } catch (error) {
        const deliveryState =
          error instanceof DeliveryFailure && error.outcomeUncertain ? 'uncertain' : 'failed';
        await updateDeliveryState(draft.id, deliveryState);
        store.finishReportDeliveryClaim(draft.id, persistentClaim, deliveryState);
        logEvent('warn', 'chat_reply.delivery.failed', {
          component: 'delivery',
          channel,
          outcome: deliveryState,
          errorName: errorName(error),
        });
      } finally {
        deliveryGuard.release(draft.id);
      }
    }
    return sent;
  }

  return { deliver, updateDeliveryState, beginDelivery, completeDelivery, autoSendChatReplyDrafts };
}
