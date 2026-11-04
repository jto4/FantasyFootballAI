import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Zip, ZipPassThrough, zipSync } from 'fflate';
import {
  createPortableBackup,
  decryptPortableBackup,
  encryptPortableBackup,
  parsePortableBackup,
  validateBackupPassphrase,
} from './backup-archive.js';
import { listLocalImages, replaceLocalImages, saveGeneratedImage } from './image-library.js';

let directory = '';

function archiveWithRepeatedManifest(): Buffer {
  const chunks: Buffer[] = [];
  const archive = new Zip();
  archive.ondata = (error, chunk) => {
    if (error) throw error;
    if (chunk) chunks.push(Buffer.from(chunk));
  };
  const addFile = (name: string, contents: Buffer) => {
    const file = new ZipPassThrough(name);
    archive.add(file);
    file.push(contents, true);
  };
  addFile('database.sqlite', Buffer.from('SQLite format 3\0fixture database'));
  addFile(
    'manifest.json',
    Buffer.from(JSON.stringify({ format: 'sunday-sidekick-backup', version: 1 })),
  );
  addFile('manifest.json', Buffer.from(JSON.stringify({ format: 'unknown', version: 99 })));
  archive.end();
  return Buffer.concat(chunks);
}

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = '';
});

describe('portable local backups', () => {
  it('carries prop and chat history through a backup, and rejects damaged history', async () => {
    const line = {
      key: 'k',
      gameId: '2026_07_KC_SEA',
      playerName: 'Fictional Passer',
      stat: 'passing_yards' as const,
      sportsbook: 'DraftKings',
      source: 'espn' as const,
      first: { line: 220.5, at: '2026-10-23T12:00:00Z' },
      daily: {},
      closing: { line: 224.5, at: '2026-10-24T12:00:00Z' },
      observations: 2,
    };
    const lean = {
      key: 'l',
      gameId: '2026_07_KC_SEA',
      playerName: 'Fictional Catcher',
      stat: 'receptions' as const,
      line: 4.5,
      side: 'over' as const,
      strength: 'slight' as const,
      projection: 5,
      observedAt: '2026-10-24T12:00:00Z',
    };
    const chat = {
      id: 'c',
      title: 'Lineup',
      createdAt: '2026-10-24T12:00:00Z',
      updatedAt: '2026-10-24T12:00:00Z',
      messages: [{ role: 'user' as const, text: 'Who starts?', at: '2026-10-24T12:00:00Z' }],
    };
    const database = Buffer.concat([
      Buffer.from('SQLite format 3\0', 'ascii'),
      Buffer.from('database'),
    ]);
    const path = join(tmpdir(), 'missing-history-backup.sqlite');
    const history = { propLines: [line], propLeans: [lean], chats: [chat] };
    const archive = await createPortableBackup(database, path, history);
    expect(parsePortableBackup(archive).history).toEqual(history);
    // Without history, the plain download has nothing to carry and restores as before.
    const plain = await createPortableBackup(database, path);
    expect(parsePortableBackup(plain).history).toBeUndefined();
    const damaged = await createPortableBackup(database, path, {
      ...history,
      propLeans: [{ ...lean, line: 'bad' }] as never,
    });
    expect(() => parsePortableBackup(damaged)).toThrow(/history/);
  });

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

  it('rejects repeated archive paths instead of choosing one by entry order', () => {
    expect(() => parsePortableBackup(archiveWithRepeatedManifest())).toThrow(
      /repeats a file path/i,
    );
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
