/** Keep the startup recovery decision separate from Electron dialogs for deterministic tests. */
export async function recoverFromSafetyBackup(
  dataDirectory,
  { inspect, restore, salvage, startFresh, prompt },
) {
  let report = await inspect(dataDirectory);
  if (report.current?.exists && !report.current.valid && typeof salvage === 'function') {
    try {
      await salvage(dataDirectory);
      report = await inspect(dataDirectory);
    } catch {
      // Use an existing safety copy or the explicit empty-library option if salvage fails.
    }
  }
  const candidates = report.backups
    .filter((backup) => backup.valid)
    .slice(-5)
    .reverse();
  if (candidates.length === 0) {
    const buttons = ['Start fresh', 'Cancel'];
    const choice = await prompt({
      type: 'warning',
      title: 'No valid recovery backup',
      message: 'Sunday Sidekick could not open its local database.',
      detail:
        'You can start with an empty library. The unreadable database and SQLite journals will be moved into a recovery folder first; leagues, reports, and member memory in them will not appear in the new library. Keep the recovery folder if you may need data recovery.',
      buttons,
      cancelId: 1,
      defaultId: 1,
      noLink: true,
    });
    if (choice.response !== 0)
      return {
        status: 'cancelled',
        detail: 'Database recovery was canceled. Your data folder was left unchanged.',
      };
    try {
      const result = await startFresh(dataDirectory);
      return { status: 'started-fresh', recoveryPath: result.recoveryPath };
    } catch (error) {
      return {
        status: 'failed',
        detail:
          error instanceof Error ? error.message : 'The damaged database could not be preserved.',
      };
    }
  }

  const buttons = [...candidates.map((_, index) => `Restore backup ${index + 1}`), 'Cancel'];
  const detail = [
    ...candidates.map(
      (backup, index) =>
        `${index + 1}. ${backup.name}${backup.name.includes('-page-salvage-') ? ' (raw-page recovery and validated salvage; some data may be missing)' : backup.name.includes('-salvage-') ? ' (partial-data salvage; malformed rows were omitted)' : ''}`,
    ),
    '',
    'The current database and SQLite journals will be preserved in a recovery folder. Restored automatic sends will be paused and custom CLI or AI endpoints reset for review.',
  ].join('\n');
  const choice = await prompt({
    type: 'warning',
    title: 'Recover Sunday Sidekick data',
    message: 'The local database could not be opened. Choose a validated safety copy to restore.',
    detail,
    buttons,
    cancelId: buttons.length - 1,
    defaultId: buttons.length - 1,
    noLink: true,
  });
  if (choice.response < 0 || choice.response >= candidates.length)
    return {
      status: 'cancelled',
      detail: 'Database recovery was canceled. Your data folder was left unchanged.',
    };

  try {
    const restored = await restore(dataDirectory, candidates[choice.response].name);
    return {
      status: 'restored',
      backupName: candidates[choice.response].name,
      recoveryPath: restored.recoveryPath,
    };
  } catch (error) {
    return {
      status: 'failed',
      detail:
        error instanceof Error ? error.message : 'The selected safety copy could not be restored.',
    };
  }
}
