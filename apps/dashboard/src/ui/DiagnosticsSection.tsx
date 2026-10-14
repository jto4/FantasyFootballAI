import { useState } from 'react';
import { requestJson } from './api-client';
import { isDiagnostics, type Diagnostics } from './operations-data';
const advice: Record<string, string> = {
  credentials: 'Check the configured credential in Settings.',
  timeout: 'Check provider availability before starting a new request.',
  provider: 'Review provider status and your selected model.',
  storage: 'Check local disk space and database recovery status.',
  configuration: 'Review the AI runtime command and endpoint.',
  cancelled: 'Cancelled jobs remain saved and will not replay.',
};
export function DiagnosticsSection() {
  const [snapshot, setSnapshot] = useState<Diagnostics>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load(download = false) {
    setBusy(true);
    setError('');
    try {
      const result = await requestJson(
        download ? '/api/diagnostics/export' : '/api/diagnostics',
        isDiagnostics,
      );
      setSnapshot(result);
      if (download) {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'sidekick-diagnostics.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Diagnostics are unavailable.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card operations-card">
      <div className="settings-card-title">
        <div>
          <h2 data-search-target="diagnostics" tabIndex={-1}>
            Operational diagnostics
          </h2>
          <p>
            Download counts, runtime details, failure categories, and safe correlation IDs for
            troubleshooting.
          </p>
        </div>
      </div>
      <button type="button" className="small-button" disabled={busy} onClick={() => void load()}>
        Refresh diagnostics
      </button>{' '}
      <button
        type="button"
        className="small-button"
        disabled={busy}
        onClick={() => void load(true)}
      >
        Download diagnostics
      </button>
      {error && <p role="alert">{error}</p>}
      {snapshot && (
        <>
          <p role="status">
            Generation queue: {snapshot.generation.queued} waiting · {snapshot.generation.running}{' '}
            running · oldest pending {snapshot.generation.oldestPendingSeconds} seconds.
          </p>
          <p>
            {snapshot.generation.retainedJobs} recent jobs · {snapshot.generation.archivedReceipts}{' '}
            archived request receipts.
          </p>
          {Object.entries(snapshot.generation.recentFailures).map(([category, count]) => (
            <p key={category}>
              {category}: {count}. {advice[category]}
            </p>
          ))}
          <small>
            Failure counts cover retained recent jobs. Downloads omit league names, report bodies,
            source text, credential values, and filesystem paths.
          </small>
        </>
      )}
    </section>
  );
}
