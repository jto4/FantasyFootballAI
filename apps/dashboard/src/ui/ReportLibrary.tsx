import { useState } from 'react';
import {
  isAppSettings,
  settingsSectionPatch,
  scheduleRecommendations,
  type AppSettings,
  type LeagueConnection,
  type ReportKind,
} from '@sidekick/core';
import { reportChoices } from './beginner-flow';
import { schedulePlanLabel } from './SchedulePlan';
import { Dialog } from './Dialog';
import { FriendlyError } from './FriendlyError';
import { requestJson } from './api-client';
import { timezoneLabel } from './timezone-label';

export function ReportLibrary({
  league,
  settings,
  busy,
  onCreate,
  onSchedule,
  onSaved,
}: {
  league: LeagueConnection;
  settings: AppSettings;
  busy: boolean;
  onCreate: (kind: ReportKind) => void;
  onSchedule: (kind: ReportKind) => void;
  onSaved: () => Promise<void>;
}) {
  const [plan, setPlan] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const weeklyKinds = ['power-rankings', 'matchup-preview'];
  function previewWeekly() {
    setError('');
    setSaved(false);
    // Capture the revision with the preview; concurrent schedule edits must fail rather than overwrite.
    const next = structuredClone(settings);
    next.actions = next.actions.map((action) => {
      const recommended = scheduleRecommendations[action.kind];
      if (!weeklyKinds.includes(action.kind) || !recommended) return action;
      const schedule = { ...action.schedule, ...recommended, enabled: true };
      delete schedule.date;
      delete schedule.completedAt;
      return {
        ...action,
        enabled: true,
        mode: 'draft',
        channel: 'dashboard',
        leagueIds: [league.id],
        schedule,
      };
    });
    setPlan(next);
  }
  async function savePlan() {
    if (!plan || saving) return;
    setSaving(true);
    setError('');
    try {
      await requestJson('/api/settings/schedules', isAppSettings, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'If-Match': String(plan.sectionRevisions?.schedules ?? 0),
        },
        body: JSON.stringify(settingsSectionPatch(plan, 'schedules')),
      });
      setPlan(null);
      setSaved(true);
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save weekly plan.');
    } finally {
      setSaving(false);
    }
  }
  function choice(kind: ReportKind) {
    const item = reportChoices.find((item) => item.kind === kind)!;
    const action = settings.actions.find((action) => action.kind === kind);
    const scheduled =
      action?.enabled &&
      action.schedule.enabled &&
      (action.leagueIds === undefined || action.leagueIds.includes(league.id));
    return (
      <article className="report-template" key={kind}>
        <div>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <small>
            {scheduled && action
              ? `${action.mode === 'automatic' && action.channel !== 'dashboard' ? 'Auto-send' : 'Auto-draft'} · ${schedulePlanLabel(action)}`
              : 'Create when you need it'}
          </small>
        </div>
        <div className="template-actions">
          <button
            type="button"
            className="small-button"
            disabled={busy}
            onClick={() => onCreate(kind)}
            aria-label={`Create ${item.title.toLowerCase()}`}
          >
            Create now
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => onSchedule(kind)}
            aria-label={`Auto-generate ${item.title.toLowerCase()}`}
          >
            {scheduled ? 'Edit automation' : 'Auto-generate'}
          </button>
        </div>
      </article>
    );
  }
  return (
    <section className="report-library" aria-label="Default report library">
      <div className="visuals-heading">
        <div>
          <p className="section-overline">READY-TO-USE REPORTS</p>
          <h2>Your weekly report plan</h2>
        </div>
        <button type="button" className="small-button" onClick={previewWeekly}>
          Set up weekly drafts
        </button>
      </div>
      <p className="library-context">
        For {league.displayName} · Generated drafts appear here for review.
      </p>
      {choice('power-rankings')}
      {choice('matchup-preview')}
      <details className="seasonal-templates">
        <summary>Draft & offseason reports</summary>
        {choice('draft-hype')}
        {choice('draft-review')}
        {choice('offseason-update')}
      </details>
      {saved && (
        <p role="status">Weekly drafts enabled for {league.displayName}. Nothing was sent.</p>
      )}
      {!plan && error && (
        <FriendlyError
          message="The schedule was saved, but we couldn’t refresh the page."
          detail={error}
          action="Refresh"
          onAction={() => void onSaved()}
        />
      )}
      {plan && (
        <Dialog
          titleId="weekly-plan-title"
          onClose={() => {
            if (!saving) setPlan(null);
          }}
          className="report-review-modal weekly-plan-modal"
        >
          <button
            type="button"
            className="modal-close"
            disabled={saving}
            onClick={() => setPlan(null)}
            aria-label="Close weekly report plan"
          >
            ×
          </button>
          <p className="section-overline">AUTOMATIC GENERATION</p>
          <h2 id="weekly-plan-title">A week of league reports</h2>
          <p>
            For <strong>{league.displayName}</strong>. New reports stay in the app as drafts.
          </p>
          <ol className="weekly-plan-preview">
            {plan.actions
              .filter((action) => weeklyKinds.includes(action.kind))
              .map((action) => (
                <li key={action.kind}>
                  <strong>
                    {action.kind === 'power-rankings'
                      ? 'Tuesday · Power rankings'
                      : 'Wednesday · Matchup preview'}
                  </strong>
                  <span>09:00 · {timezoneLabel(action.schedule.timezone)}</span>
                </li>
              ))}
          </ol>
          <p>
            This replaces the time, league scope, and delivery policy for these two report types.
            Other report schedules stay as configured.
          </p>
          <p className="modal-hint">
            Keep the service running and your computer awake. Active-season reports pause after the
            season ends. Generating drafts shares league context with your selected AI connection
            and may incur provider usage charges.
          </p>
          {error && <FriendlyError message="Couldn’t enable this plan." detail={error} />}
          <button
            type="button"
            className="primary-button full"
            disabled={saving}
            onClick={() => void savePlan()}
          >
            {saving ? 'Saving…' : 'Enable weekly drafts'}
          </button>
        </Dialog>
      )}
    </section>
  );
}
