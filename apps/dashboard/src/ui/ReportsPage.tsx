import { useReportHistory } from './hooks/useReportHistory';
import { requestJson } from './api-client';
import {
  isSavedReport,
  isGenerationJob,
  type ReportSummary,
  type GenerationJob,
} from '@sidekick/core';
import { useEffect, useState } from 'react';
import type { AppSettings, LeagueConnection, SavedReport } from '@sidekick/core';
import { reportBodyParts } from './report-body';
import { canEditReport, reportDestination, reportStatus } from './report-status';
import { Dialog } from './Dialog';
import { formatDateTime } from './date-format';

export type SendPreview = {
  revision: number;
  expectedChannel: string;
  expectedDestination: string;
  replyToId?: string;
  emailSubject?: string;
};
export function ReportsPage({
  reports,
  jobs,
  leagues,
  settings,
  sendingReportId,
  onSend,
  onSaved,
  onDirtyChange,
  initialReportId,
}: {
  reports: ReportSummary[];
  jobs: GenerationJob[];
  leagues: LeagueConnection[];
  settings: AppSettings;
  sendingReportId: string;
  onSend: (id: string, preview: SendPreview) => Promise<void>;
  onSaved: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  initialReportId?: string;
}) {
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(initialReportId ?? '');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [replyToId, setReplyToId] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  useEffect(() => {
    if (initialReportId) setSelectedId(initialReportId);
  }, [initialReportId]);
  const [report, setReport] = useState<SavedReport>();
  const [detailLoading, setDetailLoading] = useState(false);
  const summary = reports.find((item) => item.id === selectedId);
  const history = useReportHistory(
    leagueFilter,
    statusFilter,
    reports
      .map((item) => `${item.id}:${item.revision}:${item.status}:${item.deliveryState}`)
      .join('|'),
  );
  async function loadDetail() {
    if (!selectedId) return;
    const detail = await requestJson(
      `/api/reports/${encodeURIComponent(selectedId)}`,
      isSavedReport,
    );
    setReport(detail);
  }
  useEffect(() => {
    setReport(undefined);
    if (!selectedId) return;
    const abort = new AbortController();
    setDetailLoading(true);
    setError('');
    void requestJson(`/api/reports/${encodeURIComponent(selectedId)}`, isSavedReport, {
      signal: abort.signal,
    })
      .then(setReport)
      .catch((failure) => {
        if (!abort.signal.aborted)
          setError(failure instanceof Error ? failure.message : 'Could not load report.');
      })
      .finally(() => {
        if (!abort.signal.aborted) setDetailLoading(false);
      });
    return () => abort.abort();
  }, [selectedId]);
  useEffect(() => {
    if (selectedId && report && !editing) void loadDetail().catch(() => undefined);
  }, [summary?.revision, summary?.status, summary?.deliveryState]);
  const dirty = Boolean(editing && report && (title !== report.title || body !== report.body));
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function closeReview() {
    if (dirty && !window.confirm('Discard unsaved draft edits?')) return;
    setSelectedId('');
    setEditing(false);
    setError('');
  }
  async function saveDraft() {
    if (!report || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(report.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, body, revision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not save draft.');
      if (!isSavedReport(result)) throw new Error('Invalid saved draft response.');
      setReport(result);
      await onSaved();
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save draft.');
    } finally {
      setSaving(false);
    }
  }
  const filtered = history.items;
  const target = report
    ? reportDestination(report, settings)
    : { channel: 'dashboard', destination: '' };
  return (
    <>
      <div className="page-title-block">
        <div>
          <p className="section-overline">REVIEW & DELIVERY</p>
          <h1>Reports</h1>
          <p>Read, edit, and review the exact destination before sending.</p>
        </div>
      </div>
      {jobs
        .filter((job) => job.status !== 'completed')
        .slice(0, 10)
        .map((job) => (
          <article className="report-card" key={job.id}>
            <div>
              <h2>{job.kind.replaceAll('-', ' ')}</h2>
              <p role="status">Generation {job.status}</p>
              {job.error && <p>{job.error}</p>}
            </div>
            {(job.status === 'failed' || job.status === 'interrupted') && (
              <button
                type="button"
                className="small-button"
                onClick={async () => {
                  try {
                    await requestJson('/api/generation-jobs', isGenerationJob, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        requestId: crypto.randomUUID(),
                        leagueId: job.leagueId,
                        kind: job.kind,
                      }),
                    });
                    await onSaved();
                  } catch (failure) {
                    setError(
                      failure instanceof Error ? failure.message : 'Could not queue report.',
                    );
                  }
                }}
              >
                Start new generation
              </button>
            )}
          </article>
        ))}
      {(history.error || (!report && error)) && (
        <p role="alert">
          {history.error || error}
          <button type="button" onClick={() => history.retry()}>
            Retry loading
          </button>
        </p>
      )}
      {detailLoading && <p role="status">Loading saved report…</p>}
      <div className="report-filters">
        <label>
          League
          <select
            aria-label="Filter reports by league"
            value={leagueFilter}
            onChange={(event) => setLeagueFilter(event.target.value)}
          >
            <option value="all">All leagues</option>
            {leagues.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            aria-label="Filter reports by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All reports</option>
            <option value="draft">Ready to review</option>
            <option value="sent">Sent</option>
            <option value="sending">Sending</option>
            <option value="failed">Delivery failed</option>
            <option value="uncertain">Delivery unknown</option>
          </select>
        </label>
      </div>
      <div className="report-list">
        {filtered.map((item) => (
          <article className="report-card" key={item.id}>
            <div>
              <span className="credential-status">{reportStatus(item)}</span>
              <h2>{item.title}</h2>
              <p>
                {leagues.find((league) => league.id === item.leagueId)?.displayName ??
                  'Disconnected league'}{' '}
                · Generated {formatDateTime(item.createdAt)}
              </p>
            </div>
            <button
              type="button"
              className="small-button"
              onClick={() => {
                setSelectedId(item.id);
                setEditing(false);
                setError('');
                setReplyToId('');
                setEmailSubject('');
              }}
            >
              Review report
            </button>
          </article>
        ))}
      </div>
      {history.loading && <p role="status">Loading report history…</p>}
      {history.cursor && (
        <button
          type="button"
          className="small-button"
          disabled={history.loading}
          onClick={history.loadMore}
        >
          Load more reports
        </button>
      )}
      {filtered.length === 0 && !history.loading && !history.error && (
        <p className="empty-activity">
          No reports match these filters. Generate a draft from the League desk or Schedule.
        </p>
      )}
      {report && (
        <Dialog titleId="report-review-title" onClose={closeReview}>
          <button
            type="button"
            className="modal-close"
            aria-label="Close report review"
            onClick={closeReview}
          >
            ×
          </button>
          <p className="section-overline">{reportStatus(report)}</p>
          <h2 id="report-review-title">Review report</h2>
          <dl className="report-evidence">
            <dt>Generated</dt>
            <dd>{formatDateTime(report.createdAt)}</dd>
            <dt>League data used</dt>
            <dd>
              {report.evidence?.leagueSyncedAt
                ? formatDateTime(report.evidence.leagueSyncedAt)
                : 'Not recorded for this report'}
            </dd>
            <dt>News retrieved</dt>
            <dd>
              {report.evidence?.newsRefreshedAt
                ? formatDateTime(report.evidence.newsRefreshedAt)
                : 'Not recorded for this report'}
            </dd>
            {report.editedAt && (
              <>
                <dt>Last edited</dt>
                <dd>{formatDateTime(report.editedAt)}</dd>
              </>
            )}
          </dl>
          {report.evidence?.guidance && (
            <details>
              <summary>Evidence and limitations</summary>
              <p>{report.evidence.guidance}</p>
            </details>
          )}
          {error && <p role="alert">{error}</p>}
          {editing ? (
            <div className="draft-editor">
              <label>
                Report title
                <input
                  aria-label="Report title"
                  maxLength={120}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                Report body
                <textarea
                  aria-label="Report body"
                  rows={14}
                  maxLength={100000}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </label>
              <p>{dirty ? 'Unsaved draft edits. Save before sending.' : 'No unsaved edits.'}</p>
              <button
                type="button"
                className="primary-button"
                disabled={saving || !title.trim() || !body.trim() || !dirty}
                onClick={() => void saveDraft()}
              >
                {saving ? 'Saving…' : 'Save draft'}
              </button>
              <button
                type="button"
                className="small-button"
                onClick={() => {
                  if (!dirty || window.confirm('Discard unsaved draft edits?')) setEditing(false);
                }}
              >
                Cancel editing
              </button>
            </div>
          ) : (
            <>
              <h3>{report.title}</h3>
              <div className="report-body">
                {reportBodyParts(report.body, report.citations).map((part, index) =>
                  part.kind === 'citation' ? (
                    <a key={index} href={part.url} target="_blank" rel="noreferrer">
                      {part.title}
                    </a>
                  ) : (
                    <span key={index}>{part.value}</span>
                  ),
                )}
              </div>
              {canEditReport(report) && (
                <button
                  type="button"
                  className="small-button"
                  onClick={() => {
                    setTitle(report.title);
                    setBody(report.body);
                    setRevision(report.revision ?? 0);
                    setEditing(true);
                  }}
                >
                  Edit draft
                </button>
              )}
            </>
          )}
          {report.citations.length > 0 && (
            <div>
              <h3>Sources</h3>
              <ul>
                {report.citations.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.status === 'draft' && (
            <section className="send-preview" aria-label="Send preview">
              <h3>Send preview</h3>
              <p>
                Channel: <strong>{target.channel}</strong>
              </p>
              <p>
                Recipient:{' '}
                <strong>{target.destination || 'No delivery destination configured'}</strong>
              </p>
              {report.deliveryEnvelope && (
                <p>
                  Original sender:{' '}
                  <strong>
                    {report.deliveryEnvelope.sender ||
                      report.deliveryEnvelope.providerIdentity ||
                      'Configured group server'}
                  </strong>
                  {report.deliveryEnvelope.replyToId && (
                    <>
                      {' '}
                      · Reply to <strong>{report.deliveryEnvelope.replyToId}</strong>
                    </>
                  )}
                </p>
              )}
              {target.channel === 'email' && (
                <p>
                  Subject:{' '}
                  <strong>
                    {report.deliveryEnvelope?.subject ||
                      emailSubject.trim() ||
                      (replyToId.trim() ? `Re: ${report.title}` : report.title)}
                  </strong>
                </p>
              )}
              <p>Your selected provider receives the saved text below.</p>
              <div className="report-body">
                {report.deliveryEnvelope?.body ??
                  (target.channel === 'sms'
                    ? report.body.slice(0, /^CH/.test(target.destination) ? 1600 : 1500)
                    : target.channel === 'imessage'
                      ? report.body.slice(0, 10000)
                      : report.body)}
              </div>
              {((target.channel === 'sms' &&
                report.body.length > (/^CH/.test(target.destination) ? 1600 : 1500)) ||
                (target.channel === 'imessage' && report.body.length > 10000)) && (
                <p role="status">
                  This channel sends only the preview text above. Shorten the draft to include all
                  of it.
                </p>
              )}
              {target.channel === 'email' && !report.deliveryEnvelope && (
                <details>
                  <summary>Optional email thread reply</summary>
                  <label>
                    Reply to Message-ID
                    <input
                      aria-label="Reply to Message-ID"
                      value={replyToId}
                      onChange={(event) => setReplyToId(event.target.value)}
                      maxLength={300}
                    />
                  </label>
                  {replyToId.trim() && (
                    <label>
                      Thread subject
                      <input
                        aria-label="Thread subject"
                        value={emailSubject}
                        onChange={(event) => setEmailSubject(event.target.value)}
                        maxLength={120}
                      />
                    </label>
                  )}
                </details>
              )}
              {report.deliveryState === 'uncertain' && (
                <p role="alert">
                  The provider may already have delivered this report. Check its history before
                  confirming a retry.
                </p>
              )}
              {report.deliveryState === 'uncertain' && !report.deliveryEnvelope && (
                <p>
                  This older attempt has no saved delivery details, so retry is unavailable. Check
                  the provider’s history before creating another report.
                </p>
              )}
              {!canEditReport(report) && <p>Reports with a delivery attempt cannot be edited.</p>}
              <button
                type="button"
                className="primary-button"
                disabled={
                  editing ||
                  dirty ||
                  saving ||
                  Boolean(sendingReportId) ||
                  report.deliveryState === 'sending' ||
                  target.channel === 'dashboard' ||
                  !target.destination ||
                  Boolean(replyToId.trim() && !emailSubject.trim()) ||
                  (report.deliveryState === 'uncertain' && !report.deliveryEnvelope)
                }
                onClick={() =>
                  void onSend(report.id, {
                    revision: report.revision ?? 0,
                    expectedChannel: target.channel,
                    expectedDestination: target.destination,
                    ...(replyToId.trim()
                      ? { replyToId: replyToId.trim(), emailSubject: emailSubject.trim() }
                      : {}),
                  }).then(loadDetail)
                }
              >
                {sendingReportId === report.id
                  ? 'Sending…'
                  : report.deliveryState === 'uncertain'
                    ? 'Check and retry delivery'
                    : report.deliveryState === 'failed'
                      ? 'Retry saved report'
                      : 'Send saved report'}
              </button>
            </section>
          )}
          {report.deliveryAttempts?.length ? (
            <details>
              <summary>Delivery history</summary>
              <ul>
                {report.deliveryAttempts.map((attempt, index) => (
                  <li key={index}>
                    {attempt.channel} · {attempt.status} · {formatDateTime(attempt.startedAt)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Dialog>
      )}
    </>
  );
}
