import type { AppSettings, SavedReport, ReportSummary } from '@sidekick/core';
export function reportStatus(report: ReportSummary): string {
  if (report.status === 'sent') return 'Sent';
  if (report.deliveryState === 'sending') return 'Sending';
  if (report.deliveryState === 'uncertain') return 'Delivery unknown';
  if (report.deliveryState === 'failed') return 'Delivery failed';
  return 'Draft ready';
}
export function reportDestination(report: SavedReport, settings: AppSettings) {
  if (report.deliveryEnvelope)
    return {
      channel: report.deliveryEnvelope.channel,
      destination: report.deliveryEnvelope.destination,
    };
  const action = settings.actions.find((item) => item.kind === report.kind && item.enabled);
  const channel = report.kind === 'chat-reply' ? report.replyChannel : action?.channel;
  const destination =
    report.kind === 'chat-reply'
      ? report.replyDestination
      : channel === 'email'
        ? settings.emailRecipient
        : channel === 'sms'
          ? settings.smsRecipient
          : channel === 'imessage'
            ? settings.imessageChatGuid
            : undefined;
  return { channel: channel ?? 'dashboard', destination: destination ?? '' };
}
export function canEditReport(report: SavedReport): boolean {
  return report.status === 'draft' && !report.deliveryState && !report.deliveryAttempts?.length;
}
