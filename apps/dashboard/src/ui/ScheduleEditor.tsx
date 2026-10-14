import { useLayoutEffect, useState } from 'react';
import {
  isAppSettings,
  settingsSectionPatch,
  type ActionSetting,
  type AppSettings,
  type LeagueConnection,
} from '@sidekick/core';
import { Dialog } from './Dialog';
import { AutomaticActionsSection } from './AutomaticActionsSection';
import { reportName, scheduleSummary } from './beginner-flow';
import { requestJson } from './api-client';
import { FriendlyError } from './FriendlyError';
import { isAppState } from './app-state';

export type SchedulePrefill = {
  kind: ActionSetting['kind'];
  weekday?: number | undefined;
  time?: string;
  channel?: ActionSetting['channel'];
  requestedSend?: boolean;
  source?: 'report-library';
  frequency?: ActionSetting['schedule']['frequency'] | undefined;
  dayOfMonth?: number | undefined;
  leagueIds?: string[];
};
export function ScheduleEditor({
  settings,
  leagues,
  kind,
  prefill,
  onSaved,
  onClose,
  onDirtyChange,
}: {
  settings: AppSettings;
  leagues: LeagueConnection[];
  kind: ActionSetting['kind'];
  prefill?: SchedulePrefill | undefined;
  onSaved: (settings: AppSettings) => void;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [base] = useState(settings);
  const [action, setAction] = useState<ActionSetting>(() => {
    const current = structuredClone(settings.actions.find((item) => item.kind === kind)!);
    if (!prefill) return current;
    const schedule = { ...current.schedule };
    delete schedule.date;
    delete schedule.completedAt;
    return {
      ...current,
      enabled: true,
      mode: 'draft',
      channel: prefill.channel ?? current.channel,
      ...(prefill.leagueIds ? { leagueIds: prefill.leagueIds } : {}),
      schedule: {
        ...schedule,
        enabled: true,
        frequency: prefill.frequency ?? 'weekly',
        dayOfMonth: prefill.dayOfMonth ?? current.schedule.dayOfMonth ?? 1,
        weekday: prefill.weekday ?? current.schedule.weekday,
        time: prefill.time ?? current.schedule.time,
      },
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty =
    JSON.stringify(action) !== JSON.stringify(base.actions.find((item) => item.kind === kind));
  useLayoutEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  function close() {
    if (!busy && (!dirty || window.confirm('Discard unsaved schedule changes?'))) onClose();
  }
  async function save() {
    if (busy || !dirty) return;
    const recipient =
      action.channel === 'email'
        ? base.emailRecipient
        : action.channel === 'sms'
          ? base.smsRecipient
          : action.channel === 'imessage'
            ? base.imessageChatGuid
            : '';
    if (
      action.mode === 'automatic' &&
      action.enabled &&
      action.schedule.enabled &&
      action.channel !== 'dashboard' &&
      !recipient
    ) {
      setError(
        'Choose a recipient in Delivery & access before enabling automatic delivery. You can save review-before-send mode now.',
      );
      return;
    }
    if (
      action.mode === 'automatic' &&
      action.enabled &&
      action.schedule.enabled &&
      action.channel !== 'dashboard' &&
      !window.confirm(
        `Save automatic delivery? ${reportName(action.kind)} can send to ${recipient} without your review. The schedule summary shows the time and leagues.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      if (action.mode === 'automatic' && action.channel !== 'dashboard') {
        const current = await requestJson('/api/state?view=summary', isAppState);
        if (
          (current.settings.sectionRevisions?.delivery ?? 0) !==
          (base.sectionRevisions?.delivery ?? 0)
        )
          throw new Error(
            'Delivery settings changed after this preview opened. Reopen the schedule to review the current recipient before saving.',
          );
      }
      const next = {
        ...base,
        actions: base.actions.map((item) => (item.kind === kind ? action : item)),
      };
      const saved = await requestJson('/api/settings/schedules', isAppSettings, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'If-Match': String(base.sectionRevisions?.schedules ?? 0),
        },
        body: JSON.stringify(settingsSectionPatch(next, 'schedules')),
      });
      onSaved(saved);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save schedule.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      titleId="schedule-edit-title"
      className="report-review-modal schedule-editor"
      onClose={close}
    >
      <button
        type="button"
        className="modal-close"
        aria-label="Close schedule editor"
        disabled={busy}
        onClick={close}
      >
        ×
      </button>
      <h2 id="schedule-edit-title">Schedule {reportName(kind).toLowerCase()}</h2>
      {prefill && (
        <p role="note">
          {prefill.source === 'report-library' ? 'The report library' : 'Your search'} filled in a
          proposed schedule. Check the day, time, timezone, and leagues before saving.{' '}
          {prefill.requestedSend
            ? 'You asked to send it; choose a delivery channel, recipient, and automatic policy explicitly below.'
            : 'It starts in review-before-send mode.'}
        </p>
      )}
      <p className="schedule-summary">
        {scheduleSummary(
          action,
          leagues
            .filter((league) => action.leagueIds?.includes(league.id))
            .map((league) => league.displayName),
        )}
      </p>
      <p>
        Destination:{' '}
        {action.channel === 'dashboard'
          ? 'Saved draft in Reports'
          : `${action.channel} · ${action.channel === 'email' ? base.emailRecipient || 'No recipient chosen' : action.channel === 'sms' ? base.smsRecipient || 'No recipient chosen' : base.imessageChatGuid || 'No conversation chosen'}`}
      </p>
      <fieldset disabled={busy} className="schedule-editor-fields">
        <AutomaticActionsSection
          confirmAutomatic={false}
          showSummary={false}
          actions={[action]}
          leagues={leagues}
          onApplySuggestions={() => {}}
          onActionChange={(_kind, patch) => setAction((current) => ({ ...current, ...patch }))}
          onScheduleChange={(_kind, patch) =>
            setAction((current) => {
              const schedule = { ...current.schedule, ...patch };
              delete schedule.completedAt;
              if (schedule.frequency !== 'once') delete schedule.date;
              return { ...current, schedule };
            })
          }
          onActionLeague={(_kind, leagueId, included) =>
            setAction((current) => {
              const ids = current.leagueIds ?? leagues.map((league) => league.id);
              return {
                ...current,
                leagueIds: included
                  ? [...new Set([...ids, leagueId])]
                  : ids.filter((id) => id !== leagueId),
              };
            })
          }
        />
      </fieldset>
      {error && (
        <FriendlyError
          message="Your schedule was not saved. Review the details before trying again. Changes from another window require reopening this editor."
          detail={error}
        />
      )}
      <div className="schedule-editor-save">
        <p role="status">
          {busy ? 'Saving…' : dirty ? 'Unsaved schedule changes' : 'No changes yet'}
        </p>
        <button
          type="button"
          className="primary-button"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          Save schedule
        </button>
        <button type="button" className="small-button" disabled={busy} onClick={close}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
