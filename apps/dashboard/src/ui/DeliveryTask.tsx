import { useState } from 'react';
import { isAppSettings, settingsSectionPatch, type AppSettings } from '@sidekick/core';
import type { SearchTask } from './search-tasks';
import { Dialog } from './Dialog';
import { requestJson } from './api-client';
import { reportName } from './beginner-flow';
import { FriendlyError } from './FriendlyError';
import { isAppState } from './app-state';
export function DeliveryTask({
  task,
  settings,
  onSaved,
  onClose,
  onDeliverySetup,
}: {
  task: Extract<SearchTask, { type: 'delivery' }>;
  settings: AppSettings;
  onSaved: (settings: AppSettings) => void;
  onClose: () => void;
  onDeliverySetup: () => void;
}) {
  const [base] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const affected = base.actions.filter(
    (action) =>
      action.channel !== 'dashboard' &&
      (!task.channel || action.channel === task.channel) &&
      (!task.kind || action.kind === task.kind) &&
      (task.automatic
        ? action.enabled && action.schedule.enabled && action.mode !== 'automatic'
        : action.mode === 'automatic'),
  );
  const chat = !task.automatic && !task.channel && !task.kind && base.chatRepliesAutoSend;
  const recipient = (channel: string) =>
    channel === 'email'
      ? base.emailRecipient
      : channel === 'sms'
        ? base.smsRecipient
        : base.imessageChatGuid;
  const missing = task.automatic && affected.some((action) => !recipient(action.channel));
  async function confirm() {
    if (busy || missing || (!affected.length && !chat)) return;
    setBusy(true);
    setError('');
    let partial = false;
    try {
      if (task.automatic) {
        const current = await requestJson('/api/state?view=summary', isAppState);
        if (
          (current.settings.sectionRevisions?.delivery ?? 0) !==
          (base.sectionRevisions?.delivery ?? 0)
        )
          throw new Error(
            'Delivery settings changed after this preview opened. Close and reopen it to review the current recipients.',
          );
      }
      let saved = base;
      if (affected.length) {
        saved = await requestJson('/api/settings/schedules', isAppSettings, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'If-Match': String(base.sectionRevisions?.schedules ?? 0),
          },
          body: JSON.stringify(
            settingsSectionPatch(
              {
                ...base,
                actions: base.actions.map((action) =>
                  affected.includes(action)
                    ? { ...action, mode: task.automatic ? 'automatic' : 'draft' }
                    : action,
                ),
              },
              'schedules',
            ),
          ),
        });
        partial = true;
        onSaved(saved);
      }
      if (chat) {
        saved = await requestJson('/api/settings/delivery', isAppSettings, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'If-Match': String(base.sectionRevisions?.delivery ?? 0),
          },
          body: JSON.stringify(
            settingsSectionPatch({ ...saved, chatRepliesAutoSend: false }, 'delivery'),
          ),
        });
        onSaved(saved);
      }
      onClose();
    } catch (failure) {
      setError(
        `${partial ? 'Report schedule changes saved, but chat reply changes did not. Close and reopen this preview before retrying. ' : ''}${failure instanceof Error ? failure.message : 'Could not save delivery choices.'}`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      titleId="delivery-task-title"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <button
        type="button"
        className="modal-close"
        aria-label="Close delivery preview"
        disabled={busy}
        onClick={onClose}
      >
        ×
      </button>
      <h2 id="delivery-task-title">
        {task.automatic ? 'Allow automatic report delivery?' : 'Stop automatic messages?'}
      </h2>
      <p>
        {task.automatic
          ? 'These enabled schedules can send without your review after you confirm. Existing provider connections are still required.'
          : 'These reports will keep their schedules and save drafts for your review. No new messages are sent by this change. An already-running send may still finish.'}
      </p>
      <ul>
        {affected.map((action) => (
          <li key={action.kind}>
            {reportName(action.kind)} · {action.channel} ·{' '}
            {recipient(action.channel) || 'No recipient configured'} ·{' '}
            {action.mode === 'automatic'
              ? 'Automatic sending → review before send'
              : 'Review before send → automatic sending'}
          </li>
        ))}
        {chat && <li>Automatic chat replies → review before send</li>}
      </ul>
      {task.channel && (
        <p>
          Only {task.channel} report schedules are affected. Chat replies and other channels keep
          their existing policy.
        </p>
      )}
      {!affected.length && !chat && <p role="status">No matching settings need changing.</p>}
      {missing && (
        <p role="alert">Choose the missing recipients before enabling automatic delivery.</p>
      )}
      {error && (
        <FriendlyError
          message="Delivery choices need attention. Review which changes saved before trying again."
          detail={error}
        />
      )}
      <button
        type="button"
        className="primary-button"
        disabled={busy || missing || (!affected.length && !chat) || Boolean(error)}
        onClick={() => void confirm()}
      >
        {busy
          ? 'Saving…'
          : task.automatic
            ? 'Confirm automatic delivery'
            : 'Confirm review before send'}
      </button>
      <button type="button" className="small-button" disabled={busy} onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="text-button" disabled={busy} onClick={onDeliverySetup}>
        Open delivery settings
      </button>
    </Dialog>
  );
}
