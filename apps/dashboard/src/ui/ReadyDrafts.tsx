import { useState } from 'react';
import { isSavedReport, type ReportSummary } from '@sidekick/core';
import { requestJson } from './api-client';
import { formatDateTime } from './date-format';

/**
 * Home shortcut for reviewed sharing: copies saved text only and never sends anything. Shows the
 * newest draft of each report type; older drafts of the same type stay in the Reports library.
 */
export function ReadyDrafts({
  drafts,
  onReview,
  onLibrary,
}: {
  drafts: ReportSummary[];
  onReview: (id: string) => void;
  onLibrary: () => void;
}) {
  const [status, setStatus] = useState<{ id: string; message: string }>();
  if (!drafts.length) return null;
  const latest = [...drafts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((draft, index, all) => all.findIndex((d) => d.kind === draft.kind) === index);
  const older = drafts.length - latest.length;
  async function copy(id: string) {
    try {
      const report = await requestJson(`/api/reports/${encodeURIComponent(id)}`, isSavedReport);
      await navigator.clipboard.writeText(`${report.title}\n\n${report.body}`);
      setStatus({ id, message: 'Copied. Paste it into your group chat.' });
    } catch {
      setStatus({ id, message: 'Couldn’t copy automatically. Open Review to copy the text.' });
    }
  }
  return (
    <section className="ready-drafts" aria-labelledby="ready-drafts-title">
      <div className="ready-drafts-head">
        <div>
          <p className="section-overline">READY TO SEND</p>
          <h2 id="ready-drafts-title">
            {latest.length === 1 ? 'Your report is ready' : `${latest.length} reports are ready`}
          </h2>
          {older > 0 && (
            <small>
              {older} older {older === 1 ? 'draft is' : 'drafts are'} in the Reports library.
            </small>
          )}
        </div>
        <button type="button" className="text-button" onClick={onLibrary}>
          Review your drafts
        </button>
      </div>
      <ul>
        {latest.map((draft) => (
          <li key={draft.id}>
            <div>
              <strong>{draft.title}</strong>
              <small>Draft · {formatDateTime(draft.createdAt)}</small>
            </div>
            <div className="ready-draft-actions">
              <button type="button" className="primary-button" onClick={() => void copy(draft.id)}>
                Copy for group chat
              </button>
              <button type="button" className="text-button" onClick={() => onReview(draft.id)}>
                Review
              </button>
            </div>
            {status?.id === draft.id && <p role="status">{status.message}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
