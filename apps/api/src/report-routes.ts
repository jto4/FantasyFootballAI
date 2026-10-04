import { randomUUID } from 'node:crypto';
import { JobConflict, type createGenerationQueue } from './generation-jobs.js';
import { isDraftEdit, isReportSendRequest } from '@sidekick/core';
import { Router } from 'express';
import { DeliveryFailure } from '@sidekick/integrations';
import type { ReportKind, ActionSetting } from '@sidekick/core';
import type { LocalStore } from './store.js';
import type { createReportService } from './report-service.js';
import type { createDeliveryService } from './delivery-service.js';
import type { DeliveryGuard } from './delivery-guard.js';
import { isValidEmailSubject, isValidMessageId } from './email-thread.js';
export function createReportRouter({
  store,
  generateAndSaveReport,
  deliveryService,
  deliveryGuard,
  generationQueue,
}: {
  store: LocalStore;
  generateAndSaveReport: ReturnType<typeof createReportService>['generateAndSaveReport'];
  deliveryService: ReturnType<typeof createDeliveryService>;
  deliveryGuard: DeliveryGuard;
  generationQueue?: ReturnType<typeof createGenerationQueue>;
}) {
  const router = Router();
  const { deliver, updateDeliveryState, beginDelivery, completeDelivery } = deliveryService;
  router.post('/api/reports/:kind', async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
      return res.status(400).json({ error: 'Enter valid report details.' });
    const kind = req.params.kind as ReportKind;
    if (
      ![
        'draft-hype',
        'draft-review',
        'power-rankings',
        'matchup-preview',
        'offseason-update',
      ].includes(kind)
    ) {
      return res.status(400).json({ error: 'Unknown report type.' });
    }
    const { leagueId, draftOnly } = req.body as { leagueId?: string; draftOnly?: unknown };
    if (draftOnly !== undefined && typeof draftOnly !== 'boolean')
      return res.status(400).json({ error: 'Invalid report delivery option.' });
    const state = store.reportSnapshot();
    const league = state.leagues.find((item) => item.id === leagueId);
    if (!league) return res.status(404).json({ error: 'Connect a league first.' });
    try {
      if (generationQueue) {
        const requestId = req.body.requestId ?? randomUUID();
        if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(requestId))
          return res
            .status(400)
            .json({ error: 'Invalid generation request ID.', code: 'invalid_request' });
        await generationQueue.enqueue(
          { requestId, leagueId: league.id, kind },
          draftOnly === false,
        );
        const job = await generationQueue.wait(requestId);
        const report = job.reportId ? store.reportById(job.reportId) : undefined;
        if (!report)
          return res.status(502).json({
            error:
              job.error ??
              'Generation was interrupted. Review Reports before starting a new request.',
            code: 'provider_failure',
          });
        return res.status(201).json({
          ...report,
          ...(report.deliveryState && report.deliveryState !== 'sending'
            ? { deliveryError: 'Draft saved; check delivery history before retrying.' }
            : {}),
        });
      }
      const channel =
        state.settings.actions.find((action) => action.kind === kind)?.channel ?? 'dashboard';
      const result = await generateAndSaveReport(league, state, kind, draftOnly === false, channel);
      res.status(201).json({
        ...result.report,
        ...(result.deliveryError && { deliveryError: result.deliveryError }),
      });
    } catch (error) {
      if (error instanceof JobConflict)
        return res
          .status(error.code === 'queue_full' ? 429 : 409)
          .json({ error: error.message, code: error.code });
      return res
        .status(502)
        .json({ error: error instanceof Error ? error.message : 'AI generation failed.' });
    }
  });
  router.post(['/api/reports/:id/send', '/api/mcp/reports/:id/send'], async (req, res) => {
    if (!isReportSendRequest(req.body ?? {}))
      return res.status(400).json({ error: 'Invalid send options.', code: 'invalid_request' });
    const isMcpSend = req.path.startsWith('/api/mcp/');
    if (isMcpSend && store.settingsSnapshot().mcpDeliveryEnabled !== true)
      return res.status(403).json({
        error: 'MCP sending is disabled. Enable “Allow MCP clients to send reports” in Settings.',
      });
    const report = store.snapshot().reports.find((item) => item.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Draft not found.' });
    if (report.status !== 'draft')
      return res.status(409).json({ error: 'This report is already sent or being delivered.' });
    const state = store.snapshot();
    const sendOptions =
      req.body && typeof req.body === 'object'
        ? (req.body as {
            replyToId?: unknown;
            emailSubject?: unknown;
            retryUncertain?: unknown;
            revision?: unknown;
            expectedChannel?: unknown;
            expectedDestination?: unknown;
          })
        : {};
    const rawReplyToId = sendOptions.replyToId;
    const replyToId = typeof rawReplyToId === 'string' ? rawReplyToId.trim() : undefined;
    const emailSubject =
      typeof sendOptions.emailSubject === 'string' ? sendOptions.emailSubject.trim() : undefined;
    if (
      (rawReplyToId !== undefined && (!replyToId || !isValidMessageId(replyToId))) ||
      (replyToId &&
        state.settings.actions.find((item) => item.kind === report.kind)?.channel !== 'email') ||
      (sendOptions.emailSubject !== undefined &&
        (!replyToId || !emailSubject || !isValidEmailSubject(emailSubject)))
    ) {
      return res.status(400).json({ error: 'Enter a valid email Message-ID for an email action.' });
    }
    const action = state.settings.actions.find(
      (item) => item.kind === report.kind && item.enabled && item.channel !== 'dashboard',
    );
    const isChatReply = report.kind === 'chat-reply';
    const channel =
      report.deliveryEnvelope?.channel ?? (isChatReply ? report.replyChannel : action?.channel);
    if (
      !channel ||
      (isChatReply && channel !== 'sms' && channel !== 'imessage') ||
      (!isChatReply && !action)
    )
      return res
        .status(409)
        .json({ error: 'Enable a delivery channel for this action in Settings first.' });
    const target =
      report.deliveryEnvelope?.destination ??
      (isChatReply
        ? report.replyDestination
        : channel === 'imessage'
          ? state.settings.imessageChatGuid
          : state.settings.smsRecipient);
    if (
      channel === 'sms' &&
      (typeof target !== 'string' ||
        (!/^CH[0-9a-fA-F]{32}$/.test(target) && (isChatReply || !/^\+[1-9]\d{7,14}$/.test(target))))
    )
      return res.status(409).json({
        error: 'Configure a valid SMS recipient or existing Twilio group destination first.',
      });
    if (
      channel === 'imessage' &&
      (typeof target !== 'string' || !target.trim() || target.length > 500 || /[\r\n]/.test(target))
    )
      return res.status(409).json({ error: 'Configure the iMessage group destination first.' });
    if (
      (sendOptions.revision !== undefined && sendOptions.revision !== (report.revision ?? 0)) ||
      (sendOptions.expectedChannel !== undefined && sendOptions.expectedChannel !== channel) ||
      (sendOptions.expectedDestination !== undefined &&
        sendOptions.expectedDestination !==
          (report.deliveryEnvelope?.destination ??
            (channel === 'email' ? state.settings.emailRecipient : target)))
    )
      return res.status(409).json({
        error:
          'The saved report or delivery destination changed. Refresh and review the send preview again.',
      });
    if (report.deliveryState === 'sending')
      return res.status(409).json({ error: 'A delivery attempt is already in progress.' });
    if (report.deliveryState === 'uncertain' && sendOptions.retryUncertain !== true)
      return res.status(409).json({
        error:
          'The last delivery outcome is unknown. Check the provider before retrying; confirm the previous message was not delivered to retry.',
        requiresRetryConfirmation: true,
      });
    if (report.deliveryState === 'uncertain' && !report.deliveryEnvelope)
      return res.status(409).json({
        error:
          'This older uncertain delivery has no saved envelope. Check provider history before taking any further action.',
        code: 'delivery_conflict',
      });
    if (!deliveryGuard.acquire(report.id))
      return res.status(409).json({ error: 'This report is already being delivered.' });
    const persistentClaim = store.claimReportDelivery(
      report.id,
      sendOptions.retryUncertain === true,
      report.revision ?? 0,
    );
    if (!persistentClaim) {
      deliveryGuard.release(report.id);
      return res
        .status(409)
        .json({ error: 'This report is already being delivered or is no longer a draft.' });
    }
    try {
      const claim = await beginDelivery(
        report.id,
        channel as Exclude<ActionSetting['channel'], 'dashboard'>,
        state.settings.emailRecipient,
        target,
        replyToId,
        emailSubject,
      );
      if (!claim) {
        store.finishReportDeliveryClaim(report.id, persistentClaim, 'failed');
        return res
          .status(409)
          .json({ error: 'This report cannot be delivered in its current state.' });
      }
      const receipt = await deliver(
        report,
        channel,
        state.settings.emailRecipient,
        target,
        replyToId,
        emailSubject,
        claim.idempotencyKey,
        claim.envelope,
      );
      await completeDelivery(report.id, receipt.providerMessageId);
      store.finishReportDeliveryClaim(report.id, persistentClaim, 'sent');
      res.json({ status: 'sent' });
    } catch (error) {
      const deliveryState =
        error instanceof DeliveryFailure && error.outcomeUncertain ? 'uncertain' : 'failed';
      await updateDeliveryState(report.id, deliveryState);
      store.finishReportDeliveryClaim(report.id, persistentClaim, deliveryState);
      res
        .status(502)
        .json({ error: error instanceof Error ? error.message : 'Message delivery failed.' });
    } finally {
      deliveryGuard.release(report.id);
    }
  });

  router.patch('/api/reports/:id', async (req, res) => {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return res.status(400).json({ error: 'Enter valid draft changes.' });
    const {
      title,
      body: text,
      revision,
    } = body as { title: string; body: string; revision: number };
    if (!isDraftEdit(body))
      return res
        .status(400)
        .json({ error: 'Use a title up to 120 characters and a report up to 100,000 characters.' });
    const result = await store.editReportDraft(req.params.id, title.trim(), text, revision);
    if (result.status !== 200)
      return res.status(result.status).json({
        error:
          result.status === 404
            ? 'Draft not found.'
            : 'This draft changed or delivery was attempted. Refresh before continuing; attempted reports cannot be edited.',
      });
    return res.json(result.report);
  });
  return router;
}
