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
  listSafetyBackups: () => Promise<Array<{ name: string; createdAt: string; size: number }>>;
  readSafetyBackup: (name: string) => Promise<Buffer | undefined>;
  deleteSafetyBackup: (name: string) => Promise<boolean>;
  restoreBackup: (database: Buffer, images: ImportedLocalImage[]) => Promise<string>;
  afterRestore: () => Promise<AppSettings>;
}

/** Backup endpoints are isolated because export and restore have distinct data boundaries. */
export function createBackupRouter(dependencies: BackupRouteDependencies): Router {
  const router = Router();

  router.get('/api/backup', async (_req, res) => {
    // Desktop data-folder migration consumes this local-only archive internally.
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

  return router;
}
