import { useState } from 'react';
import type { LeagueConnection, ReportKind } from '@sidekick/core';
import { Dialog } from './Dialog';
import { ReportChoices } from './ReportChoices';

export function ReportComposer({
  league,
  initialKind,
  busy,
  ready,
  onSetup,
  onClose,
  onCreate,
}: {
  league: LeagueConnection;
  initialKind: ReportKind;
  busy: boolean;
  ready: boolean;
  onSetup: () => void;
  onClose: () => void;
  onCreate: (kind: ReportKind) => void;
}) {
  const [kind, setKind] = useState(initialKind);
  return (
    <Dialog
      titleId="create-report-title"
      onClose={onClose}
      className="report-review-modal report-composer"
    >
      <button
        type="button"
        className="modal-close"
        aria-label="Close report creation"
        onClick={onClose}
      >
        ×
      </button>
      <p className="section-overline">1. CHOOSE → 2. REVIEW → 3. SEND</p>
      <h2 id="create-report-title">Create a report</h2>
      <p>
        For <strong>{league.displayName}</strong>. We’ll create a draft for you to read and edit.
      </p>
      <ReportChoices kind={kind} onChange={setKind} />
      <p className="modal-hint">
        Creating a draft shares league report context with your selected AI connection. It never
        sends a message to your league.
      </p>
      {!ready && (
        <p role="status">
          Test your AI connection before creating a draft.{' '}
          <button type="button" className="text-button" onClick={onSetup}>
            Finish AI setup
          </button>
        </p>
      )}
      <button
        type="button"
        className="primary-button full"
        disabled={busy || !ready}
        onClick={() => onCreate(kind)}
      >
        {busy ? 'Creating…' : 'Create draft'}
      </button>
    </Dialog>
  );
}
