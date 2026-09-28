import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import {
  createPortableBackup,
  decryptPortableBackup,
  encryptPortableBackup,
  parsePortableBackup,
  validateBackupPassphrase,
} from './backup-archive.js';
import { listLocalImages, replaceLocalImages, saveGeneratedImage } from './image-library.js';

let directory = '';

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = '';
});

describe('portable local backups', () => {
  it('round-trips the database and private generated images', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-portable-backup-'));
    const databasePath = join(directory, 'state.sqlite');
    const imageBytes = Buffer.from('image bytes');
    const saved = await saveGeneratedImage(
      databasePath,
      `data:image/png;base64,${imageBytes.toString('base64')}`,
    );
    const database = Buffer.from('SQLite format 3\0fixture database');
    const archive = await createPortableBackup(database, databasePath);
    const restored = parsePortableBackup(archive);

    expect(restored.database).toEqual(database);
    expect(restored.images).toEqual([
      { id: saved.id, mimeType: 'image/png', contents: imageBytes },
    ]);
    await replaceLocalImages(databasePath, restored.images);
    expect(await listLocalImages(databasePath)).toHaveLength(1);
    await replaceLocalImages(databasePath, []);
    expect(await listLocalImages(databasePath)).toEqual([]);
  });

  it('continues to accept legacy SQLite backups and rejects archive paths outside the format', () => {
    const database = Buffer.from('SQLite format 3\0legacy backup');
    expect(parsePortableBackup(database)).toEqual({ database, images: [] });
    const malicious = zipSync({
      'database.sqlite': database,
      'manifest.json': Buffer.from(
        JSON.stringify({ format: 'sunday-sidekick-backup', version: 1 }),
      ),
      '../outside.txt': Buffer.from('not allowed'),
    });
    expect(() => parsePortableBackup(Buffer.from(malicious))).toThrow(/unsupported path/i);
  });

  it('encrypts portable archives and authenticates the passphrase and contents', async () => {
    const database = Buffer.from('SQLite format 3\0encrypted fixture');
    const archive = await createPortableBackup(database, join(tmpdir(), 'missing-images.sqlite'));
    const encrypted = await encryptPortableBackup(archive, 'correct horse battery staple');
    const decrypted = await decryptPortableBackup(encrypted, 'correct horse battery staple');

    expect(encrypted.subarray(0, 8).toString('ascii')).toBe('SSBKENC1');
    expect(parsePortableBackup(decrypted).database).toEqual(database);
    await expect(decryptPortableBackup(encrypted, 'wrong horse battery staple')).rejects.toThrow(
      /passphrase is incorrect/i,
    );
    const damaged = Buffer.from(encrypted);
    const lastByte = damaged.length - 1;
    damaged[lastByte] = damaged[lastByte]! ^ 1;
    await expect(decryptPortableBackup(damaged, 'correct horse battery staple')).rejects.toThrow(
      /passphrase is incorrect/i,
    );
  });

  it('requires a bounded passphrase for encrypted backups', () => {
    expect(() => validateBackupPassphrase('short')).toThrow(/12 and 200 characters/);
    expect(() => validateBackupPassphrase('x'.repeat(201))).toThrow(/12 and 200 characters/);
    expect(() => validateBackupPassphrase('a'.repeat(12))).not.toThrow();
  });
});
