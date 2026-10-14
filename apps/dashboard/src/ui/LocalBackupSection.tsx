import { requestResponse, readJsonResponse } from './api-client';
import { isSafetyBackupList, isBackupValidation } from './operations-data';
import { isAppSettings, record } from '@sidekick/core';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Download, ShieldCheck, Trash2, Upload } from 'lucide-react';
import type { AppSettings } from '@sidekick/core';
import { normalizeActionSettings } from '@sidekick/core';
import { EmptyStatus, LoadError, LoadingStatus } from './LoadFeedback.js';

type SafetyBackup = { name: string; createdAt: string; size: number };
type Props = {
  onNotice: (message: string) => void;
  onRestored: () => Promise<void>;
  onSettingsRestored: (settings: AppSettings) => void;
};

export function LocalBackupSection({ onNotice, onRestored, onSettingsRestored }: Props) {
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupPassphraseConfirmation, setBackupPassphraseConfirmation] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [safetyBackups, setSafetyBackups] = useState<SafetyBackup[]>([]);
  const [safetyBackupsLoading, setSafetyBackupsLoading] = useState(true);
  const [safetyBackupsError, setSafetyBackupsError] = useState('');

  const refreshSafetyBackups = useCallback(async () => {
    setSafetyBackupsLoading(true);
    setSafetyBackupsError('');
    try {
      const response = await requestResponse('/api/backups');
      if (!response.ok)
        throw new Error(`Could not read local safety backups (${response.status}).`);
      const backups = await readJsonResponse(response, isSafetyBackupList);
      if (!Array.isArray(backups)) throw new Error('The local safety backup list was invalid.');
      setSafetyBackups(backups);
    } catch (error) {
      setSafetyBackupsError(
        error instanceof Error ? error.message : 'Could not read local safety backups.',
      );
    } finally {
      setSafetyBackupsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSafetyBackups();
  }, [refreshSafetyBackups]);

  async function downloadBackup() {
    if (backupPassphrase.length < 12 || backupPassphrase.length > 200) {
      onNotice('Use a backup passphrase between 12 and 200 characters.');
      return;
    }
    if (backupPassphrase !== backupPassphraseConfirmation) {
      onNotice('Backup passphrases do not match.');
      return;
    }
    setBackupBusy(true);
    onNotice('Encrypting local backup…');
    try {
      const response = await requestResponse(
        '/api/backup/export',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ passphrase: backupPassphrase }),
        },
        180000,
      );

      const backup = await response.blob();
      if (backup.size > 201 * 1024 * 1024)
        throw new Error('The backup exceeds the download size limit.');
      const url = URL.createObjectURL(backup);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sunday-sidekick-backup.ssb';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      onNotice(
        'Encrypted backup downloaded. Store its passphrase separately; it cannot be recovered.',
      );
      setBackupPassphrase('');
      setBackupPassphraseConfirmation('');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not create a local backup.');
    } finally {
      setBackupBusy(false);
    }
  }

  async function deleteSafetyBackup(name: string) {
    if (!window.confirm(`Permanently delete safety backup ${name}?`)) return;
    try {
      const response = await requestResponse(`/api/backups/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        onNotice('Could not delete that safety backup.');
        return;
      }
      setSafetyBackups((backups) => backups.filter((backup) => backup.name !== name));
      onNotice('Safety backup deleted from this computer.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not delete safety backup.');
    }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>, validateOnly = false) {
    const backup = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!backup) return;
    if (backup.size > 201 * 1024 * 1024) {
      onNotice('Choose a backup file no larger than 201 MB.');
      return;
    }
    const confirmed =
      validateOnly ||
      window.confirm(
        'Restore this backup? Current settings, leagues, reports, member memory, scheduled history, and generated images will be replaced. Automatic actions will return to draft mode; custom AI endpoints and local CLI runtimes will return to the default until you review and save those settings. A safety copy of the current database will be kept in the local backups folder.',
      );
    if (!confirmed) return;

    setBackupBusy(true);
    onNotice(
      validateOnly
        ? 'Validating backup without changing current data…'
        : 'Validating and restoring backup…',
    );
    try {
      const response = await requestResponse(
        validateOnly ? '/api/backup/validate' : '/api/backup',
        {
          method: validateOnly ? 'POST' : 'PUT',
          headers: {
            'content-type': backup.name.toLowerCase().endsWith('.ssb')
              ? 'application/vnd.sunday-sidekick.encrypted-backup'
              : backup.name.toLowerCase().endsWith('.zip')
                ? 'application/vnd.sunday-sidekick.backup'
                : 'application/vnd.sqlite3',
            ...(restorePassphrase
              ? { 'x-sidekick-backup-passphrase': encodeURIComponent(restorePassphrase) }
              : {}),
          },
          body: backup,
        },
        180000,
      );
      if (validateOnly) {
        const result = await readJsonResponse(response, isBackupValidation);
        onNotice(
          'Backup validated: ' +
            result.leagues +
            ' leagues, ' +
            result.reports +
            ' reports, ' +
            result.profiles +
            ' profiles, ' +
            result.images +
            ' images. Current data was preserved.',
        );
        return;
      }
      const result = await readJsonResponse(
        response,
        (value): value is { restored: true; settings: AppSettings; safetyCopy: string } =>
          record(value) &&
          value.restored === true &&
          isAppSettings(value.settings) &&
          typeof value.safetyCopy === 'string' &&
          !/[\\/\r\n]/.test(value.safetyCopy),
      );
      const restoredSettings = result.settings as AppSettings;
      onSettingsRestored({
        ...restoredSettings,
        actions: normalizeActionSettings(restoredSettings.actions),
      });
      await onRestored();
      const backupsResponse = await requestResponse('/api/backups');
      setSafetyBackups(await readJsonResponse(backupsResponse, isSafetyBackupList));
      onNotice(
        `Backup restored. Review AI and delivery settings before enabling automation. Safety copy: ${result.safetyCopy}`,
      );
      setRestorePassphrase('');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not restore this backup.');
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <section className="settings-card">
      <div className="settings-card-title">
        <div>
          <h2 data-search-target="local-backup" tabIndex={-1}>
            Local backup and restore
          </h2>
          <p>
            Download or restore a consistent backup of your database and generated image library.
            Older SQLite-only backups remain supported. Provider secrets stay in the operating
            system credential manager.
          </p>
        </div>
        <ShieldCheck size={18} />
      </div>
      <div className="settings-fields two">
        <label>
          Backup passphrase
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            value={backupPassphrase}
            onChange={(event) => setBackupPassphrase(event.target.value)}
            placeholder="At least 12 characters"
          />
        </label>
        <label>
          Confirm backup passphrase
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            value={backupPassphraseConfirmation}
            onChange={(event) => setBackupPassphraseConfirmation(event.target.value)}
            placeholder="Re-enter passphrase"
          />
        </label>
        <button
          type="button"
          className="small-button"
          onClick={() => void downloadBackup()}
          disabled={
            backupBusy ||
            backupPassphrase.length < 12 ||
            backupPassphrase !== backupPassphraseConfirmation
          }
        >
          <Download size={14} /> Download backup
        </button>
        <label className="small-button backup-restore-label" data-search-target="validate-backup">
          <ShieldCheck size={14} /> Validate backup
          <input
            type="file"
            className="backup-file-input"
            accept=".ssb,.zip,.sqlite"
            onChange={(event) => void restoreBackup(event, true)}
            disabled={backupBusy}
            aria-label="Choose a backup to validate without restoring"
          />
        </label>
        <label className="small-button backup-restore-label">
          <Upload size={14} /> Restore backup
          <input
            type="file"
            className="backup-file-input"
            accept=".ssb,.zip,.sqlite,application/vnd.sunday-sidekick.encrypted-backup,application/zip,application/vnd.sqlite3,application/x-sqlite3"
            onChange={(event) => void restoreBackup(event)}
            disabled={backupBusy}
            aria-label="Choose a Sunday Sidekick backup archive or legacy SQLite backup to restore"
          />
        </label>
      </div>
      <div className="settings-fields backup-passphrase-restore">
        <label>
          Passphrase for encrypted backup
          <input
            type="password"
            autoComplete="current-password"
            maxLength={200}
            value={restorePassphrase}
            onChange={(event) => setRestorePassphrase(event.target.value)}
            placeholder="Only needed for .ssb backups"
          />
        </label>
      </div>
      {safetyBackupsLoading && <LoadingStatus message="Loading local safety backups…" />}
      {safetyBackupsError && (
        <LoadError message={safetyBackupsError} onRetry={() => void refreshSafetyBackups()} />
      )}
      {!safetyBackupsLoading && !safetyBackupsError && safetyBackups.length === 0 && (
        <EmptyStatus message="No local safety backups are currently saved." />
      )}
      {safetyBackups.length > 0 && (
        <div className="safety-backup-list" aria-label="Local safety backups">
          <h3>Local safety copies</h3>
          {safetyBackups.map((backup) => (
            <div className="safety-backup-row" key={backup.name}>
              <div>
                <strong>{new Date(backup.createdAt).toLocaleString()}</strong>
                <small>{(backup.size / (1024 * 1024)).toFixed(1)} MB · private local data</small>
              </div>
              <a
                className="small-button"
                href={`/api/backups/${encodeURIComponent(backup.name)}`}
                download={backup.name}
              >
                <Download size={13} /> Download
              </a>
              <button
                type="button"
                className="small-button danger"
                onClick={() => void deleteSafetyBackup(backup.name)}
                aria-label={`Delete safety backup from ${new Date(backup.createdAt).toLocaleString()}`}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          ))}
        </div>
      )}
      <small className="schedule-explainer">
        Downloaded backups encrypt league data, reports, imported memory, and generated images with
        your passphrase. Keep it separately: it cannot be recovered. Older ZIP and SQLite backups
        remain supported and are unencrypted. Pre-restore and automatic pre-upgrade safety copies
        stay on this computer until you delete them.
      </small>
    </section>
  );
}
