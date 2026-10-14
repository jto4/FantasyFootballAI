import { Router } from 'express';
import {
  BackupRevisionConflict,
  isBackupSchedule,
  type RoutineBackups,
} from './routine-backups.js';
import type { LocalStore } from './store.js';
import type { readApiLogTail } from './diagnostic-logs.js';

export function createOperationsRouter({
  store,
  backups,
  logs,
}: {
  store: LocalStore;
  backups: RoutineBackups;
  logs: () => ReturnType<typeof readApiLogTail>;
}) {
  const router = Router();
  router.get('/api/backups/routine/status', async (_req, res) => {
    try {
      res.json(await backups.status());
    } catch {
      res.status(503).json({ error: 'Scheduled backup status is unavailable.' });
    }
  });
  router.put('/api/backups/routine/schedule', async (req, res) => {
    const schedule: unknown = req.body?.schedule;
    const passphrase: unknown = req.body?.passphrase;
    if (
      !isBackupSchedule(schedule) ||
      (passphrase !== undefined &&
        (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 200))
    )
      return res.status(400).json({ error: 'Invalid backup schedule or passphrase.' });
    try {
      res.json(await backups.configure(schedule, passphrase as string | undefined));
      // The first due copy runs independently of the settings request.
      void backups.run().catch(() => undefined);
    } catch (error) {
      if (error instanceof BackupRevisionConflict)
        return res.status(409).json({
          error: 'Backup schedule changed. Refresh its status before saving.',
          code: 'revision_conflict',
        });
      res.status(400).json({
        error:
          'Could not save the backup schedule. Check the OS credential store and use the saved passphrase for existing copies.',
      });
    }
  });
  router.post('/api/backups/routine/run', async (_req, res) => {
    try {
      await backups.run(true);
      res.json(await backups.status());
    } catch {
      res.status(503).json({ error: 'Scheduled backup could not be created.' });
    }
  });
  router.get('/api/backups/routine/files/:name', async (req, res) => {
    try {
      const contents = await backups.read(req.params.name);
      if (!contents) return res.status(404).json({ error: 'Scheduled backup not found.' });
      res.setHeader('Content-Type', 'application/vnd.sunday-sidekick.encrypted-backup');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}"`);
      res.send(contents);
    } catch {
      res.status(503).json({ error: 'Scheduled backup could not be read.' });
    }
  });
  const diagnostics = async () => {
    const status = await backups.status();
    const tail = await logs().catch(() => ({ available: false, entries: [] }));
    return {
      generatedAt: new Date().toISOString(),
      runtime: {
        platform: process.platform,
        architecture: process.arch,
        node: process.versions.node,
      },
      generation: store.generationDiagnostics(),
      storage: status.storage,
      backups: {
        enabled: status.schedule.enabled,
        count: status.files.length,
        lastSuccessAt: status.lastSuccessAt,
        lastErrorCode: status.lastErrorCode,
      },
      logs: {
        available: tail.available,
        entries: tail.entries.map((entry) => ({
          ...entry,
          // Downloads exclude free-form strings even from structured local log records.
          fields: Object.fromEntries(
            Object.entries(entry.fields).filter(
              ([key, value]) =>
                typeof value === 'number' || ['jobId', 'runId', 'requestId'].includes(key),
            ),
          ),
        })),
      },
    };
  };
  for (const path of ['/api/diagnostics', '/api/diagnostics/export'])
    router.get(path, async (_req, res) => {
      try {
        const value = await diagnostics();
        if (path.endsWith('/export'))
          res.setHeader('Content-Disposition', 'attachment; filename="sidekick-diagnostics.json"');
        res.json(value);
      } catch {
        res.status(503).json({ error: 'Local diagnostics are unavailable.' });
      }
    });
  return router;
}
