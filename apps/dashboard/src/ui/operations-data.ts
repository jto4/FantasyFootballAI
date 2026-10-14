import { record } from '@sidekick/core';
export type RoutineBackupStatus = {
  schedule: {
    enabled: boolean;
    intervalHours: 24 | 168;
    retainCount: 3 | 7 | 14;
    revision: number;
  };
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  lastErrorCode?: 'credential_store' | 'backup_failed';
  busy: boolean;
  files: { name: string; createdAt: string; size: number }[];
  storage: { databaseBytes: number; imageBytes: number; warnings: string[] };
};
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function isRoutineBackupStatus(value: unknown): value is RoutineBackupStatus {
  return (
    record(value) &&
    record(value.schedule) &&
    typeof value.schedule.enabled === 'boolean' &&
    [24, 168].includes(Number(value.schedule.intervalHours)) &&
    [3, 7, 14].includes(Number(value.schedule.retainCount)) &&
    count(value.schedule.revision) &&
    typeof value.busy === 'boolean' &&
    (value.lastSuccessAt === undefined || date(value.lastSuccessAt)) &&
    (value.lastAttemptAt === undefined || date(value.lastAttemptAt)) &&
    (value.lastErrorCode === undefined ||
      ['credential_store', 'backup_failed'].includes(String(value.lastErrorCode))) &&
    Array.isArray(value.files) &&
    value.files.every(
      (file) =>
        record(file) &&
        typeof file.name === 'string' &&
        /^routine-[0-9TZ.a-f-]+\.ssb$/.test(file.name) &&
        date(file.createdAt) &&
        count(file.size),
    ) &&
    record(value.storage) &&
    count(value.storage.databaseBytes) &&
    count(value.storage.imageBytes) &&
    Array.isArray(value.storage.warnings) &&
    value.storage.warnings.every((warning) =>
      ['database_near_backup_limit', 'archive_near_backup_limit'].includes(String(warning)),
    )
  );
}
export function isSafetyBackupList(
  value: unknown,
): value is { name: string; createdAt: string; size: number }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (file) =>
        record(file) &&
        typeof file.name === 'string' &&
        !/[\\/\r\n]/.test(file.name) &&
        date(file.createdAt) &&
        count(file.size),
    )
  );
}
export function isBackupValidation(
  value: unknown,
): value is { valid: true; reports: number; leagues: number; profiles: number; images: number } {
  return (
    record(value) &&
    value.valid === true &&
    ['reports', 'leagues', 'profiles', 'images'].every((key) => count(value[key]))
  );
}
export type Diagnostics = {
  generatedAt: string;
  generation: {
    queued: number;
    running: number;
    oldestPendingSeconds: number;
    recentFailures: Record<string, number>;
    retainedJobs: number;
    archivedReceipts: number;
  };
  backups: { enabled: boolean; count: number; lastSuccessAt?: string; lastErrorCode?: string };
};
export function isDiagnostics(value: unknown): value is Diagnostics {
  return (
    record(value) &&
    date(value.generatedAt) &&
    record(value.generation) &&
    ['queued', 'running', 'oldestPendingSeconds', 'retainedJobs', 'archivedReceipts'].every((key) =>
      count((value.generation as Record<string, unknown>)[key]),
    ) &&
    record(value.generation.recentFailures) &&
    Object.entries(value.generation.recentFailures).every(
      ([key, number]) =>
        ['credentials', 'timeout', 'provider', 'storage', 'configuration', 'cancelled'].includes(
          key,
        ) && count(number),
    ) &&
    record(value.backups) &&
    typeof value.backups.enabled === 'boolean' &&
    count(value.backups.count)
  );
}
