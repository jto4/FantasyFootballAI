import { useEffect, useLayoutEffect, useState } from 'react';
import { requestJson } from './api-client';
import { isRoutineBackupStatus, type RoutineBackupStatus } from './operations-data';
import { LoadError, LoadingStatus } from './LoadFeedback';

export function RoutineBackupSection({
  onNotice,
  onDirtyChange,
}: {
  onNotice: (message: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [status, setStatus] = useState<RoutineBackupStatus>();
  const [draft, setDraft] = useState<RoutineBackupStatus['schedule']>();
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty =
    Boolean(status && draft && JSON.stringify(status.schedule) !== JSON.stringify(draft)) ||
    Boolean(passphrase || confirmation);
  useLayoutEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  async function refresh() {
    setError('');
    try {
      const result = await requestJson('/api/backups/routine/status', isRoutineBackupStatus);
      setStatus(result);
      setDraft(result.schedule);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load scheduled backups.');
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function save() {
    if (!draft || busy) return;
    if (passphrase && (passphrase.length < 12 || passphrase !== confirmation)) {
      setError('Use at least 12 characters and matching passphrases.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await requestJson('/api/backups/routine/schedule', isRoutineBackupStatus, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schedule: draft, ...(passphrase ? { passphrase } : {}) }),
      });
      setStatus(result);
      setDraft(result.schedule);
      setPassphrase('');
      setConfirmation('');
      onNotice(
        result.schedule.enabled
          ? 'Encrypted backup schedule saved. The app must be running when a copy is due. Keep the passphrase separately for recovery.'
          : 'Scheduled backups disabled. Existing copies remain saved.',
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save backup schedule.');
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    setBusy(true);
    setError('');
    try {
      const result = await requestJson(
        '/api/backups/routine/run',
        isRoutineBackupStatus,
        { method: 'POST' },
        180000,
      );
      setStatus(result);
      onNotice(
        result.lastErrorCode
          ? 'Backup failed. Existing copies were kept; check backup status.'
          : 'Encrypted backup created and validated.',
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create backup.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card operations-card">
      <div className="settings-card-title">
        <div>
          <h2 data-search-target="routine-backups" tabIndex={-1}>
            Scheduled encrypted backups
          </h2>
          <p>
            Save daily or weekly copies on this computer while the app is running. Passphrases stay
            in the OS credential store. Keep a separate copy of the passphrase to restore a
            downloaded backup.
          </p>
        </div>
      </div>
      {!status && !error && <LoadingStatus message="Loading scheduled backup status…" />}
      {error && <LoadError message={error} onRetry={() => void refresh()} />}
      {draft && status && (
        <>
          <div className="settings-fields two">
            <label className="profile-optout">
              <input
                type="checkbox"
                checked={draft.enabled}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
              />{' '}
              Enable scheduled backups
            </label>
            <label>
              Backup interval
              <select
                value={draft.intervalHours}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...draft, intervalHours: Number(event.target.value) as 24 | 168 })
                }
              >
                <option value={24}>Daily</option>
                <option value={168}>Weekly</option>
              </select>
            </label>
            <label>
              Copies to keep
              <select
                value={draft.retainCount}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...draft, retainCount: Number(event.target.value) as 3 | 7 | 14 })
                }
              >
                {[3, 7, 14].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scheduled backup passphrase
              <input
                type="password"
                autoComplete="new-password"
                maxLength={200}
                value={passphrase}
                disabled={busy}
                placeholder="Required on first enable"
                onChange={(event) => setPassphrase(event.target.value)}
              />
            </label>
            <label>
              Confirm scheduled backup passphrase
              <input
                type="password"
                autoComplete="new-password"
                maxLength={200}
                value={confirmation}
                disabled={busy}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="small-button"
            disabled={!dirty || busy}
            onClick={() => void save()}
          >
            Save backup schedule
          </button>{' '}
          <button
            type="button"
            className="small-button"
            disabled={!status.schedule.enabled || dirty || busy || status.busy}
            onClick={() => void run()}
          >
            Back up now
          </button>{' '}
          <button
            type="button"
            className="small-button"
            disabled={dirty || busy}
            onClick={() => void refresh()}
          >
            Refresh backup status
          </button>
          <p role="status">
            {status.lastSuccessAt
              ? `Last successful copy: ${new Date(status.lastSuccessAt).toLocaleString()}`
              : 'No successful scheduled copy yet.'}{' '}
            {status.lastErrorCode === 'credential_store'
              ? 'The backup passphrase or OS credential store is unavailable.'
              : status.lastErrorCode
                ? 'The last backup failed. Check available space and the size limits below.'
                : ''}
          </p>
          <p>
            Database: {(status.storage.databaseBytes / 1048576).toFixed(1)} MB · Images:{' '}
            {(status.storage.imageBytes / 1048576).toFixed(1)} MB. Backup limits: 50 MB database,
            200 MB archive.
          </p>
          {status.storage.warnings.length > 0 && (
            <p role="alert">
              Your data is approaching the backup size limit. Remove unused generated images or
              unneeded history before the limit is reached.
            </p>
          )}
          {status.files.map((file) => (
            <p key={file.name}>
              <a
                className="routine-copy-link"
                href={`/api/backups/routine/files/${encodeURIComponent(file.name)}`}
                download
              >
                {new Date(file.createdAt).toLocaleString()} · {(file.size / 1048576).toFixed(1)} MB
                · Download encrypted copy
              </a>
            </p>
          ))}
          <small>
            Rotation removes older routine copies only after a new copy passes validation. Export a
            copy to another device for protection against disk loss.
          </small>
        </>
      )}
    </section>
  );
}
