import { basename } from 'node:path';
import express, { Router } from 'express';
import type { AppSettings } from '@sidekick/core';
import type { ImportedLocalImage } from './image-library.js';
import {
  decryptPortableBackup,
  encryptPortableBackup,
  parsePortableBackup,
  validateBackupPassphrase,
} from './backup-archive.js';

export interface BackupRouteDependencies {
  currentBackup: () => Promise<Buffer>;
  databaseBackup?: () => Promise<Buffer>;
  listSafetyBackups: () => Promise<Array<{ name: string; createdAt: string; size: number }>>;
  readSafetyBackup: (name: string) => Promise<Buffer | undefined>;
  deleteSafetyBackup: (name: string) => Promise<boolean>;
  restoreBackup: (database: Buffer, images: ImportedLocalImage[]) => Promise<string>;
  afterRestore: () => Promise<AppSettings>;
  validateBackup?: (
    database: Buffer,
  ) => Promise<{ reports: number; leagues: number; profiles: number }>;
}

/** Backup endpoints are isolated because export and restore have distinct data boundaries. */
export function createBackupRouter(dependencies: BackupRouteDependencies): Router {
  const router = Router();

  router.get('/api/backup/database', async (_req, res) => {
    if (!dependencies.databaseBackup)
      return res.status(503).json({ error: 'Database copy is unavailable.' });
    try {
      const contents = await dependencies.databaseBackup();
      if (contents.length > 50 * 1024 * 1024)
        return res.status(413).json({ error: 'Database exceeds the 50 MB copy limit.' });
      res.setHeader('Content-Type', 'application/vnd.sqlite3');
      res.setHeader('Content-Length', contents.length);
      res.send(contents);
    } catch {
      res.status(500).json({ error: 'Could not create a consistent database copy.' });
    }
  });

  router.get('/api/backup', async (_req, res) => {
    // Portable archives include generated images; desktop database moves use the raw copy above.
    try {
      const archive = await dependencies.currentBackup();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="sunday-sidekick-backup.zip"');
      res.setHeader('Content-Length', archive.length);
      res.send(archive);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'Could not create the local backup.' });
    }
  });

  router.post('/api/backup/export', async (req, res) => {
    const passphrase = typeof req.body?.passphrase === 'string' ? req.body.passphrase : '';
    try {
      validateBackupPassphrase(passphrase);
    } catch (error) {
      return res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Invalid passphrase.' });
    }
    try {
      const encrypted = await encryptPortableBackup(await dependencies.currentBackup(), passphrase);
      res.setHeader('Content-Type', 'application/vnd.sunday-sidekick.encrypted-backup');
      res.setHeader('Content-Disposition', 'attachment; filename="sunday-sidekick-backup.ssb"');
      res.setHeader('Content-Length', encrypted.length);
      res.send(encrypted);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'Could not create the local backup.' });
    }
  });

  router.get('/api/backups', async (_req, res) => {
    try {
      res.json(await dependencies.listSafetyBackups());
    } catch {
      res.status(500).json({ error: 'Could not list local safety backups.' });
    }
  });

  router.get('/api/backups/:name', async (req, res) => {
    const backup = await dependencies.readSafetyBackup(req.params.name);
    if (!backup) return res.status(404).json({ error: 'Safety backup not found.' });
    res.setHeader('Content-Type', 'application/vnd.sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}"`);
    res.setHeader('Content-Length', backup.length);
    res.send(backup);
  });

  router.delete('/api/backups/:name', async (req, res) => {
    if (!(await dependencies.deleteSafetyBackup(req.params.name)))
      return res.status(404).json({ error: 'Safety backup not found.' });
    res.status(204).end();
  });

  router.put(
    '/api/backup',
    express.raw({
      type: [
        'application/vnd.sqlite3',
        'application/vnd.sunday-sidekick.backup',
        'application/vnd.sunday-sidekick.encrypted-backup',
        'application/zip',
      ],
      limit: '201mb',
    }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body))
        return res.status(400).json({ error: 'Choose a valid Sunday Sidekick backup file.' });
      try {
        const encodedPassphrase = req.get('x-sidekick-backup-passphrase') ?? '';
        let passphrase = '';
        try {
          passphrase = decodeURIComponent(encodedPassphrase);
        } catch {
          return res
            .status(400)
            .json({ error: 'Backup passphrase header is invalid. Current data was preserved.' });
        }
        const archive = await decryptPortableBackup(req.body, passphrase);
        const contents = parsePortableBackup(archive);
        const safetyCopy = await dependencies.restoreBackup(contents.database, contents.images);
        const settings = await dependencies.afterRestore();
        res.json({ restored: true, safetyCopy: basename(safetyCopy), settings });
      } catch (error) {
        res.status(400).json({
          error:
            error instanceof Error && error.message.includes('passphrase')
              ? `${error.message} Current data was preserved.`
              : 'Backup could not be validated. Current data was preserved.',
        });
      }
    },
  );

  router.post(
    '/api/backup/validate',
    express.raw({
      type: [
        'application/vnd.sqlite3',
        'application/vnd.sunday-sidekick.backup',
        'application/vnd.sunday-sidekick.encrypted-backup',
        'application/zip',
      ],
      limit: '201mb',
    }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body))
        return res.status(400).json({ error: 'Choose a valid backup file.' });
      if (!dependencies.validateBackup)
        return res.status(503).json({ error: 'Backup validation is unavailable.' });
      try {
        const passphrase = decodeURIComponent(req.get('x-sidekick-backup-passphrase') ?? '');
        const contents = parsePortableBackup(await decryptPortableBackup(req.body, passphrase));
        const counts = await dependencies.validateBackup(contents.database);
        res.json({ valid: true, ...counts, images: contents.images.length });
      } catch {
        res
          .status(400)
          .json({ error: 'Backup could not be validated. Current data was preserved.' });
      }
    },
  );

  return router;
}
