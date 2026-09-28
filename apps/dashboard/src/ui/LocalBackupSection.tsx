import { useEffect, useState, type ChangeEvent } from 'react';
import { Download, ShieldCheck, Trash2, Upload } from 'lucide-react';
import type { AppSettings } from '@sidekick/core';
import { normalizeActionSettings } from '@sidekick/core';

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

  useEffect(() => {
    void fetch('/api/backups')
      .then((response) => (response.ok ? response.json() : []))
      .then((backups: SafetyBackup[]) => setSafetyBackups(Array.isArray(backups) ? backups : []))
      .catch(() => onNotice('Could not read local safety backups.'));
  }, [onNotice]);

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
      const response = await fetch('/api/backup/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passphrase: backupPassphrase }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? 'Could not create a local backup.');
      }
      const backup = await response.blob();
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
    const response = await fetch(`/api/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!response.ok) {
      onNotice('Could not delete that safety backup.');
      return;
    }
    setSafetyBackups((backups) => backups.filter((backup) => backup.name !== name));
    onNotice('Safety backup deleted from this computer.');
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const backup = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!backup) return;
    if (backup.size > 201 * 1024 * 1024) {
      onNotice('Choose a backup file no larger than 201 MB.');
      return;
    }
    const confirmed = window.confirm(
      'Restore this backup? Current settings, leagues, reports, member memory, scheduled history, and generated images will be replaced. Automatic actions will return to draft mode; custom AI endpoints and local CLI runtimes will return to the default until you review and save those settings. A safety copy of the current database will be kept in the local backups folder.',
    );
    if (!confirmed) return;

    setBackupBusy(true);
    onNotice('Validating and restoring backup…');
    try {
      const response = await fetch('/api/backup', {
        method: 'PUT',
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
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not restore this backup.');
      const restoredSettings = result.settings as AppSettings;
      onSettingsRestored({
        ...restoredSettings,
        actions: normalizeActionSettings(restoredSettings.actions),
      });
      await onRestored();
      const backupsResponse = await fetch('/api/backups');
      if (backupsResponse.ok) setSafetyBackups(await backupsResponse.json());
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
          <h2>Local backup and restore</h2>
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
      <label className="backup-passphrase-restore">
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
