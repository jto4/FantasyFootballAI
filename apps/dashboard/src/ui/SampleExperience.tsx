import { useState } from 'react';
import type { ReportKind } from '@sidekick/core';
import { Dialog } from './Dialog';
import { ReportChoices, reportExamples } from './ReportChoices';
import { ReportSharing } from './ReportSharing';
import { reportName } from './beginner-flow';

export function SampleExperience({
  onClose,
  onSetup,
}: {
  onClose: () => void;
  onSetup: () => void;
}) {
  const [kind, setKind] = useState<ReportKind>('power-rankings');
  const [review, setReview] = useState(false);
  const [body, setBody] = useState(reportExamples[kind]);
  const [savedBody, setSavedBody] = useState(body);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <Dialog titleId="sample-title" className="report-review-modal sample-dialog" onClose={onClose}>
      <button
        type="button"
        className="modal-close"
        aria-label="Close sample league"
        onClick={onClose}
      >
        ×
      </button>
      <p className="sample-label">SAMPLE · FICTIONAL LEAGUE</p>
      <h2 id="sample-title">Try a sample league</h2>
      <p>Sunday Practice League · Sunday Superstars and Bench Believers</p>
      <p>
        No accounts or AI calls. Nothing here changes your real leagues or sends a message. Sample
        edits last until you close this preview.
      </p>
      <p className="workflow-steps">
        {review
          ? '✓ Choose a report → 2. Review and edit → 3. Copy or download'
          : '1. Choose a report → 2. Review and edit → 3. Copy or download'}
      </p>
      {!review ? (
        <>
          <ReportChoices kind={kind} onChange={setKind} />
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setBody(reportExamples[kind]);
              setSavedBody(reportExamples[kind]);
              setReview(true);
              setSaved(false);
            }}
          >
            Open sample draft
          </button>
        </>
      ) : (
        <>
          <h3>Sample: {reportName(kind)}</h3>
          {editing ? (
            <>
              <label>
                Edit sample draft
                <textarea
                  aria-label="Edit sample draft"
                  rows={6}
                  maxLength={10000}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setSavedBody(body);
                  setEditing(false);
                  setSaved(true);
                }}
              >
                Save sample draft
              </button>
              <button
                type="button"
                className="small-button"
                onClick={() => {
                  setBody(savedBody);
                  setEditing(false);
                }}
              >
                Cancel sample edits
              </button>
            </>
          ) : (
            <>
              <p className="report-body">{savedBody}</p>
              <button
                type="button"
                className="small-button"
                onClick={() => {
                  setEditing(true);
                  setSaved(false);
                }}
              >
                Edit sample draft
              </button>
            </>
          )}
          {saved && <p role="status">Sample draft saved in this preview.</p>}
          <ReportSharing
            key={kind}
            title={`Sample: ${reportName(kind)}`}
            body={savedBody}
            disabled={editing}
          />
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setEditing(false);
              setReview(false);
            }}
          >
            Choose another sample report
          </button>
        </>
      )}
      <div className="sample-finish">
        <p>Ready to use your own league?</p>
        <button type="button" className="primary-button" onClick={onSetup}>
          Set up my league
        </button>
        <button type="button" className="small-button" onClick={onClose}>
          Finish exploring
        </button>
      </div>
    </Dialog>
  );
}
