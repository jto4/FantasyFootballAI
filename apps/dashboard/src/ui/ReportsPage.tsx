import { useReportHistory } from './hooks/useReportHistory';
import { requestJson } from './api-client';
import {
  isSavedReport,
  isGenerationJob,
  type ReportSummary,
  type GenerationJob,
  deliveryText,
  reportVisuals,
  type ReportKind,
} from '@sidekick/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AppSettings, LeagueConnection, SavedReport } from '@sidekick/core';
import { reportBodyParts } from './report-body';
import {
  canEditReport,
  deliveryChannelLabel,
  reportDestination,
  reportStatus,
} from './report-status';
import { Dialog } from './Dialog';
import { formatDateTime } from './date-format';
import { FriendlyError } from './FriendlyError';
import { LoadingStatus } from './LoadFeedback';
import { useMediaQuery } from './hooks/useMediaQuery';
import { reportName } from './beginner-flow';
import { ReportSharing } from './ReportSharing';
import { LeagueTrends } from './LeagueTrends';
import { ReportLibrary } from './ReportLibrary';
import { LeagueVisuals } from './LeagueVisuals';

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
  onReviewChange,
  onCreate,
  onDeliverySetup,
  league,
  generating = false,
  onCreateKind,
  onSchedule,
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
  onReviewChange?: (id: string) => void;
  onCreate?: () => void;
  league?: LeagueConnection | undefined;
  generating?: boolean;
  onCreateKind?: (kind: ReportKind) => void;
  onSchedule?: (kind: ReportKind) => void;
  onDeliverySetup?: () => void;
}) {
  // Until the user picks a tab, show the library once any report exists and Create otherwise.
  const [chosenView, setView] = useState<'create' | 'library' | 'charts'>();
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(initialReportId ?? '');
  const [editing, setEditing] = useState(false);
  const bodyInput = useRef<HTMLTextAreaElement>(null);
  const focusBodyOnEdit = useRef(false);
  useLayoutEffect(() => {
    if (!editing || !focusBodyOnEdit.current) return;
    focusBodyOnEdit.current = false;
    bodyInput.current?.focus();
    bodyInput.current?.scrollIntoView({ block: 'center' });
  }, [editing]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [revision, setRevision] = useState(0);
  const [cancellingId, setCancellingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [replyToId, setReplyToId] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  useEffect(() => {
    setSelectedId(initialReportId ?? '');
    setEditing(false);
    setConfirmSend(false);
    setReplyToId('');
    setEmailSubject('');
    setDraftSaved(false);
  }, [initialReportId]);
  const [report, setReport] = useState<SavedReport>();
  const [detailLoading, setDetailLoading] = useState(false);
  const activeDetail = useRef({ id: selectedId, editing });
  useLayoutEffect(() => {
    activeDetail.current = { id: selectedId, editing };
    return () => {
      activeDetail.current = { id: '', editing: false };
    };
  }, [selectedId, editing]);
  useEffect(() => {
    setSaving(false);
  }, [selectedId, editing]);
  const summary = reports.find((item) => item.id === selectedId);
  const history = useReportHistory(
    leagueFilter,
    statusFilter,
    reports
      .map((item) => `${item.id}:${item.revision}:${item.status}:${item.deliveryState}`)
      .join('|'),
  );
  async function loadDetail() {
    const scope = activeDetail.current;
    if (!selectedId || scope.id !== selectedId || scope.editing) return;
    try {
      const detail = await requestJson(
        `/api/reports/${encodeURIComponent(selectedId)}`,
        isSavedReport,
      );
      if (activeDetail.current === scope) setReport(detail);
    } catch (failure) {
      if (activeDetail.current === scope) throw failure;
    }
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
      .then((detail) => {
        if (!abort.signal.aborted) setReport(detail);
      })
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
    if (!selectedId || report?.id !== selectedId || editing) return;
    const abort = new AbortController();
    // A late refresh must not replace a different report or an active edit.
    void requestJson(`/api/reports/${encodeURIComponent(selectedId)}`, isSavedReport, {
      signal: abort.signal,
    })
      .then((detail) => {
        if (!abort.signal.aborted) setReport(detail);
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [selectedId, editing, summary?.revision, summary?.status, summary?.deliveryState]);
  const dirty = Boolean(editing && report && (title !== report.title || body !== report.body));
  // Register edits before a native Back action can reach the parent navigation guard.
  useLayoutEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty || window.sidekickDesktop?.isVerificationMode?.() === true) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function closeReview() {
    if (
      (saving || dirty) &&
      !window.confirm(
        saving
          ? 'Your save is still finishing. Close this review? It will continue in the background.'
          : 'Discard unsaved draft edits?',
      )
    )
      return false;
    setSelectedId('');
    onReviewChange?.('');
    setEditing(false);
    setError('');
    return true;
  }
  async function saveDraft() {
    if (!report || saving) return;
    const scope = activeDetail.current;
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
      if (activeDetail.current === scope) setReport(result);
      await onSaved();
      if (activeDetail.current === scope) {
        setEditing(false);
        setDraftSaved(true);
      }
    } catch (failure) {
      if (activeDetail.current === scope)
        setError(failure instanceof Error ? failure.message : 'Could not save draft.');
    } finally {
      if (activeDetail.current === scope) setSaving(false);
    }
  }
  const filtered = history.items;
  const wide = useMediaQuery('(min-width: 1000px)');
  const [sort, setSort] = useState<{
    key: 'title' | 'kind' | 'league' | 'status' | 'createdAt';
    ascending: boolean;
  }>({ key: 'createdAt', ascending: false });
  const leagueName = (item: ReportSummary) =>
    leagues.find((entry) => entry.id === item.leagueId)?.displayName ?? 'Disconnected league';
  const sortValue = (item: ReportSummary) =>
    sort.key === 'title'
      ? item.title
      : sort.key === 'kind'
        ? reportName(item.kind)
        : sort.key === 'league'
          ? leagueName(item)
          : sort.key === 'status'
            ? reportStatus(item)
            : item.createdAt;
  const sorted = [...filtered].sort(
    (a, b) => sortValue(a).localeCompare(sortValue(b)) * (sort.ascending ? 1 : -1),
  );
  function openReview(id: string) {
    setSelectedId(id);
    onReviewChange?.(id);
    setEditing(false);
    setError('');
    setReplyToId('');
    setEmailSubject('');
    setConfirmSend(false);
    setDraftSaved(false);
  }
  // An opened review (including a just-created draft) returns to the Library when closed.
  useEffect(() => {
    if (selectedId) setView((current) => (current === 'charts' ? current : 'library'));
  }, [selectedId]);
  const view =
    chosenView ??
    (initialReportId || reports.length > 0 || filtered.length > 0 || history.loading || !league
      ? 'library'
      : 'create');
  function editDraft(focusBody = false) {
    if (!report || !canEditReport(report) || saving || sendingReportId) return;
    focusBodyOnEdit.current = focusBody;
    setConfirmSend(false);
    setDraftSaved(false);
    setTitle(report.title);
    setBody(report.body);
    setRevision(report.revision ?? 0);
    setEditing(true);
  }
  const target = report
    ? reportDestination(report, settings)
    : { channel: 'dashboard' as const, destination: '' };
  const channelLabel = deliveryChannelLabel(target.channel);
  const sendChannelLabel =
    target.channel === 'email' ? 'email' : target.channel === 'sms' ? 'text message' : channelLabel;
  const reportParts = report ? reportBodyParts(report.body, report.citations) : [];
  const sendBody = report
    ? (report.deliveryEnvelope?.body ??
      deliveryText(report.body, target.channel, target.destination))
    : '';
  // Linked citations change the reading view; retain literal delivery text in that case.
  const separateSendPreview =
    editing || sendBody !== report?.body || reportParts.some((part) => part.kind === 'citation');
  const shortenedPreview = Boolean(
    report && !report.deliveryEnvelope && sendBody.length < report.body.length,
  );
  const sendBlocked =
    editing ||
    dirty ||
    saving ||
    Boolean(sendingReportId) ||
    report?.deliveryState === 'sending' ||
    target.channel === 'dashboard' ||
    !target.destination ||
    Boolean(replyToId.trim() && !emailSubject.trim()) ||
    (report?.deliveryState === 'uncertain' && !report.deliveryEnvelope);
  const sendReason =
    editing || dirty
      ? 'Save or cancel your draft edits before sending.'
      : target.channel === 'dashboard' || !target.destination
        ? 'Choose a delivery channel and recipient before sending.'
        : replyToId.trim() && !emailSubject.trim()
          ? 'Enter the email thread subject before sending.'
          : report?.deliveryState === 'uncertain' && !report.deliveryEnvelope
            ? 'The original delivery details are unavailable. Check the provider’s history before creating another report.'
            : '';
  return (
    <>
      <div className="page-title-block">
        <div>
          <p className="section-overline">REVIEW & DELIVERY</p>
          <h1>Reports</h1>
          <p>Review and edit drafts. Nothing is sent until you confirm where it goes.</p>
        </div>
        {/* With a league selected, the Create tab is the one way in. */}
        {onCreate && !(league && onCreateKind) && (
          <button type="button" className="primary-button" onClick={onCreate}>
            Create a report
          </button>
        )}
      </div>
      {league && (
        <nav className="reports-workspace-nav" aria-label="Reports workspace">
          <button type="button" aria-pressed={view === 'create'} onClick={() => setView('create')}>
            Create
          </button>
          <button
            type="button"
            aria-pressed={view === 'library'}
            onClick={() => setView('library')}
          >
            Library{reports.length ? ` (${reports.length})` : ''}
          </button>
          <button type="button" aria-pressed={view === 'charts'} onClick={() => setView('charts')}>
            League charts
          </button>
        </nav>
      )}
      {view === 'charts' && league && (
        <>
          <LeagueVisuals
            key={league.id}
            data={reportVisuals(league)}
            syncedAt={league.lastSyncedAt}
          />
          <LeagueTrends key={`trends:${league.id}`} league={league} />
        </>
      )}
      {view === 'create' && league && onCreateKind && onSchedule && (
        <ReportLibrary
          key={league.id}
          league={league}
          settings={settings}
          busy={generating}
          onCreate={onCreateKind}
          onSchedule={onSchedule}
          onSaved={onSaved}
        />
      )}
      <div hidden={view === 'charts'}>
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
              {(job.status === 'queued' || job.status === 'running') && (
                <button
                  className="small-button"
                  disabled={Boolean(cancellingId)}
                  onClick={async () => {
                    setCancellingId(job.id);
                    setError('');
                    try {
                      await requestJson(
                        '/api/generation-jobs/' + encodeURIComponent(job.requestId) + '/cancel',
                        isGenerationJob,
                        { method: 'POST' },
                      );
                      await onSaved();
                    } catch (failure) {
                      setError(
                        failure instanceof Error ? failure.message : 'Could not cancel generation.',
                      );
                    } finally {
                      setCancellingId('');
                    }
                  }}
                >
                  Cancel generation
                </button>
              )}
              {(job.status === 'failed' ||
                job.status === 'interrupted' ||
                job.status === 'cancelled') && (
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
          <FriendlyError
            message="We couldn’t load your reports. Your saved reports are still on this computer."
            detail={history.error || error}
            action="Retry loading"
            onAction={() => {
              if (selectedId)
                void loadDetail().catch((failure) =>
                  setError(failure instanceof Error ? failure.message : 'Could not load report.'),
                );
              else history.retry();
            }}
          />
        )}
        {detailLoading && <LoadingStatus message="Loading saved report…" />}
      </div>
      <div hidden={view !== 'library'}>
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
        {wide && sorted.length > 0 ? (
          <table className="report-table">
            <caption className="visually-hidden">
              Saved reports. Sorting applies to the reports loaded so far.
            </caption>
            <thead>
              <tr>
                {(
                  [
                    ['title', 'Report'],
                    ['kind', 'Type'],
                    ['league', 'League'],
                    ['status', 'Status'],
                    ['createdAt', 'Created'],
                  ] as const
                ).map(([key, label]) => (
                  <th
                    key={key}
                    scope="col"
                    aria-sort={
                      sort.key === key ? (sort.ascending ? 'ascending' : 'descending') : undefined
                    }
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSort((current) => ({
                          key,
                          ascending: current.key === key ? !current.ascending : key !== 'createdAt',
                        }))
                      }
                    >
                      {label}
                      <span aria-hidden="true">
                        {sort.key === key ? (sort.ascending ? ' ▲' : ' ▼') : ''}
                      </span>
                    </button>
                  </th>
                ))}
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.title}</th>
                  <td>{reportName(item.kind)}</td>
                  <td>{leagueName(item)}</td>
                  <td>
                    <span className={`report-status-chip ${statusTone(item)}`}>
                      {reportStatus(item)}
                    </span>
                  </td>
                  <td>
                    <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="small-button"
                      onClick={() => openReview(item.id)}
                    >
                      Review report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="report-list">
            {filtered.map((item) => (
              <article className="report-card" key={item.id}>
                <div>
                  <span className={`report-status-chip ${statusTone(item)}`}>
                    {reportStatus(item)}
                  </span>
                  <h2>{item.title}</h2>
                  <p>
                    {leagueName(item)} · Generated {formatDateTime(item.createdAt)}
                  </p>
                </div>
                <button type="button" className="small-button" onClick={() => openReview(item.id)}>
                  Review report
                </button>
              </article>
            ))}
          </div>
        )}
        {history.loading && <LoadingStatus message="Loading report history…" shape="rows" />}
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
            {leagueFilter === 'all' && statusFilter === 'all'
              ? 'No reports yet.'
              : 'No reports match these filters.'}{' '}
            {league && onCreateKind ? (
              <button type="button" className="text-button" onClick={() => setView('create')}>
                Create a report →
              </button>
            ) : (
              'Choose Create a report to make a new draft.'
            )}
          </p>
        )}
      </div>
      {report && (
        <Dialog
          titleId="report-review-title"
          className="report-review-modal saved-report-review"
          onClose={closeReview}
        >
          <header className="report-review-header">
            <button
              type="button"
              className="modal-close"
              aria-label="Close report review"
              onClick={closeReview}
            >
              ×
            </button>
            <div>
              <p className="section-overline">{reportStatus(report)}</p>
              <h2 id="report-review-title">Review report</h2>
            </div>
          </header>
          <div className="report-review-content">
            <p className="report-workflow" aria-label="Report progress">
              {report.status === 'sent'
                ? '✓ Created → ✓ Reviewed → ✓ Sent'
                : confirmSend
                  ? '✓ Created → ✓ Reviewed → 3. Confirm send'
                  : '✓ Created → 2. Review → 3. Send'}
            </p>
            <p>
              League:{' '}
              <strong>
                {leagues.find((league) => league.id === report.leagueId)?.displayName ??
                  'Disconnected league'}
              </strong>
            </p>
            <details className="report-details" key={report.id}>
              <summary>
                Details
                {(!report.evidence?.leagueSyncedAt || !report.evidence.newsRefreshedAt) && (
                  <span className="report-data-note"> · Some data dates weren’t recorded</span>
                )}
              </summary>
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
            </details>
            {report.evidence?.guidance && (
              <details>
                <summary>Evidence and limitations</summary>
                <p>{report.evidence.guidance}</p>
              </details>
            )}
            {report.evidence?.visuals && (
              <details className="report-chart-details">
                <summary>Explore the report’s chart snapshot</summary>
                <LeagueVisuals
                  key={report.id}
                  data={report.evidence.visuals}
                  syncedAt={report.evidence.leagueSyncedAt}
                  frozen
                />
              </details>
            )}
            {error && (
              <FriendlyError
                message="Your draft needs attention. Your edits are still here."
                detail={error}
              />
            )}
            {draftSaved && !editing && <p role="status">✓ Draft saved.</p>}
            {editing ? (
              <div className="draft-editor">
                <label>
                  Report title
                  <input
                    aria-label="Report title"
                    disabled={saving}
                    maxLength={120}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label>
                  Report body
                  <textarea
                    ref={bodyInput}
                    aria-label="Report body"
                    disabled={saving}
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
                  disabled={saving}
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
                  {reportParts.map((part, index) =>
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
                    disabled={Boolean(sendingReportId)}
                    onClick={() => editDraft()}
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
            <ReportSharing
              key={`${report.id}:${report.revision}`}
              title={report.title}
              body={report.body}
              disabled={editing || dirty || saving}
            />
            {report.status === 'draft' && (
              <section className="send-preview" aria-label="Send preview">
                <h3>Send preview</h3>
                <p>
                  Channel: <strong>{channelLabel}</strong>
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
                {separateSendPreview ? (
                  <>
                    <p>
                      {target.channel === 'dashboard'
                        ? 'The saved text is shown below.'
                        : 'Your selected provider receives the saved text below.'}
                      {editing && ' Save your edits to update it.'}
                    </p>
                    <div className="report-body">{sendBody}</div>
                  </>
                ) : (
                  <p>
                    {target.channel === 'dashboard'
                      ? 'This report stays in the app. Copy or download it to share.'
                      : 'Sending uses the full saved report shown above.'}
                  </p>
                )}
                {shortenedPreview && (
                  <div className="shortened-report-notice">
                    <p role="status">
                      This channel sends only the preview text above. Shorten the draft to include
                      all of it.
                    </p>
                    {!editing && canEditReport(report) && (
                      <button
                        type="button"
                        className="small-button shorten-report-button"
                        disabled={saving || Boolean(sendingReportId)}
                        onClick={() => editDraft(true)}
                      >
                        Edit/shorten
                      </button>
                    )}
                  </div>
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
                {sendReason && (
                  <p role="status">
                    {sendReason}{' '}
                    {(target.channel === 'dashboard' || !target.destination) && onDeliverySetup && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          if (closeReview()) onDeliverySetup();
                        }}
                      >
                        Set up delivery
                      </button>
                    )}
                  </p>
                )}
                {confirmSend && (
                  <div
                    className="send-confirmation"
                    role="group"
                    aria-label="Confirm report delivery"
                  >
                    <h3>Ready to send?</h3>
                    <p>
                      The {separateSendPreview ? 'preview text' : 'full saved report'} above will be
                      sent by <strong>{sendChannelLabel}</strong> to{' '}
                      <strong>{target.destination}</strong>.
                    </p>
                    <button
                      type="button"
                      className="small-button"
                      disabled={Boolean(sendingReportId)}
                      onClick={() => setConfirmSend(false)}
                    >
                      Back to review
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="primary-button"
                  disabled={sendBlocked}
                  onClick={() => {
                    if (!confirmSend) {
                      setConfirmSend(true);
                      return;
                    }
                    void onSend(report.id, {
                      revision: report.revision ?? 0,
                      expectedChannel: target.channel,
                      expectedDestination: target.destination,
                      ...(replyToId.trim()
                        ? { replyToId: replyToId.trim(), emailSubject: emailSubject.trim() }
                        : {}),
                    })
                      .then(async () => {
                        setConfirmSend(false);
                        await loadDetail();
                      })
                      .catch((failure) =>
                        setError(
                          failure instanceof Error
                            ? failure.message
                            : 'Could not refresh delivery status.',
                        ),
                      );
                  }}
                >
                  {sendingReportId === report.id
                    ? 'Sending…'
                    : confirmSend
                      ? `Send ${sendChannelLabel} to ${target.destination}`
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
          </div>
        </Dialog>
      )}
    </>
  );
}

function statusTone(report: ReportSummary) {
  if (report.status === 'sent') return 'sent';
  if (report.deliveryState === 'failed' || report.deliveryState === 'uncertain') return 'problem';
  if (report.deliveryState === 'sending') return 'sending';
  return 'draft';
}
