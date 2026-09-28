import { unzipSync, zipSync } from 'fflate';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCallback,
} from 'node:crypto';
import {
  extensionForMime,
  type ImportedLocalImage,
  listLocalImages,
  readLocalImage,
} from './image-library.js';

const sqliteSignature = Buffer.from('SQLite format 3\0', 'ascii');
const maximumDatabaseBytes = 50 * 1024 * 1024;
const maximumArchiveBytes = 200 * 1024 * 1024;
const maximumImageCount = 1_000;
const encryptedBackupHeader = Buffer.from('SSBKENC1', 'ascii');
const backupSaltBytes = 16;
const backupIvBytes = 12;
const backupTagBytes = 16;
function deriveKey(passphrase: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      passphrase,
      salt,
      length,
      { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export function validateBackupPassphrase(passphrase: string): void {
  if (passphrase.length < 12 || passphrase.length > 200)
    throw new Error('Backup passphrase must be between 12 and 200 characters.');
}

/** Encrypt a complete portable archive with authenticated AES-GCM and a per-file scrypt key. */
export async function encryptPortableBackup(archive: Buffer, passphrase: string): Promise<Buffer> {
  validateBackupPassphrase(passphrase);
  const salt = randomBytes(backupSaltBytes);
  const iv = randomBytes(backupIvBytes);
  const key = await deriveKey(passphrase, salt, 32);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(encryptedBackupHeader);
    const ciphertext = Buffer.concat([cipher.update(archive), cipher.final()]);
    return Buffer.concat([encryptedBackupHeader, salt, iv, cipher.getAuthTag(), ciphertext]);
  } finally {
    key.fill(0);
  }
}

/** Decrypt only files carrying this format's fixed header; authentication rejects wrong passwords. */
export async function decryptPortableBackup(contents: Buffer, passphrase: string): Promise<Buffer> {
  if (!contents.subarray(0, encryptedBackupHeader.length).equals(encryptedBackupHeader))
    return contents;
  validateBackupPassphrase(passphrase);
  const minimumLength =
    encryptedBackupHeader.length + backupSaltBytes + backupIvBytes + backupTagBytes;
  if (contents.length <= minimumLength || contents.length > maximumArchiveBytes + minimumLength)
    throw new Error('Encrypted backup has an invalid size.');
  let offset = encryptedBackupHeader.length;
  const salt = contents.subarray(offset, (offset += backupSaltBytes));
  const iv = contents.subarray(offset, (offset += backupIvBytes));
  const tag = contents.subarray(offset, (offset += backupTagBytes));
  const ciphertext = contents.subarray(offset);
  const key = await deriveKey(passphrase, salt, 32);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(encryptedBackupHeader);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('Backup passphrase is incorrect or the encrypted file is damaged.');
  } finally {
    key.fill(0);
  }
}

export interface PortableBackupContents {
  database: Buffer;
  images: ImportedLocalImage[];
}

/** Package the database and its separately stored generated images into one portable file. */
export async function createPortableBackup(
  database: Buffer,
  databasePath: string,
): Promise<Buffer> {
  if (!isSqlite(database) || database.length > maximumDatabaseBytes)
    throw new Error('Local database exceeds the portable backup limit.');
  const entries: Record<string, Uint8Array> = {
    'database.sqlite': database,
    'manifest.json': Buffer.from(JSON.stringify({ format: 'sunday-sidekick-backup', version: 1 })),
  };
  const images = await listLocalImages(databasePath);
  if (images.length > maximumImageCount)
    throw new Error('Too many generated images for one backup.');
  let totalBytes = database.length;
  for (const item of images) {
    const stored = await readLocalImage(databasePath, item.id);
    if (!stored) throw new Error('A generated image could not be read for backup.');
    totalBytes += stored.contents.length;
    if (totalBytes > maximumArchiveBytes) throw new Error('Portable backup exceeds 200 MB.');
    const extension = extensionForMime(stored.image.mimeType);
    if (!extension) throw new Error('A generated image has an unsupported format.');
    entries[`images/${stored.image.id}${extension}`] = stored.contents;
  }
  const archive = Buffer.from(zipSync(entries, { level: 1 }));
  if (archive.length > maximumArchiveBytes) throw new Error('Portable backup exceeds 200 MB.');
  return archive;
}

/** Accept the portable bundle and legacy SQLite-only backups from earlier versions. */
export function parsePortableBackup(contents: Buffer): PortableBackupContents {
  if (isSqlite(contents)) {
    if (contents.length > maximumDatabaseBytes) throw new Error('Database backup exceeds 50 MB.');
    return { database: contents, images: [] };
  }
  if (
    contents.length < 4 ||
    contents.length > maximumArchiveBytes ||
    contents.toString('ascii', 0, 2) !== 'PK'
  )
    throw new Error('Backup archive is not a supported Sunday Sidekick backup.');

  let expandedBytes = 0;
  let entryCount = 0;
  const entryNames = new Set<string>();
  const files = unzipSync(contents, {
    filter: ({ name, originalSize }) => {
      entryCount += 1;
      expandedBytes += originalSize;
      if (entryCount > maximumImageCount + 2 || expandedBytes > maximumArchiveBytes)
        throw new Error('Backup archive exceeds its expanded size limit.');
      if (entryNames.has(name)) throw new Error('Backup archive repeats a file path.');
      entryNames.add(name);
      if (
        name !== 'database.sqlite' &&
        name !== 'manifest.json' &&
        !/^images\/[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}\.(?:png|jpg|webp)$/i.test(
          name,
        )
      )
        throw new Error('Backup archive contains an unsupported path.');
      return true;
    },
  });
  const database = files['database.sqlite'];
  const manifestBytes = files['manifest.json'];
  if (
    !database ||
    database.length > maximumDatabaseBytes ||
    !isSqlite(Buffer.from(database)) ||
    !manifestBytes ||
    manifestBytes.length > 64 * 1024
  )
    throw new Error('Backup archive is missing a valid database or manifest.');
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')) as unknown;
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    (manifest as { format?: unknown }).format !== 'sunday-sidekick-backup' ||
    (manifest as { version?: unknown }).version !== 1
  )
    throw new Error('Backup archive format is not supported.');

  const images: ImportedLocalImage[] = [];
  const imageIds = new Set<string>();
  for (const [name, bytes] of Object.entries(files)) {
    if (name === 'database.sqlite' || name === 'manifest.json') continue;
    const match = /^images\/([a-f\d-]{36})\.(png|jpg|webp)$/i.exec(name);
    if (!match) throw new Error('Backup archive contains an unsupported file.');
    const id = match[1]!.toLowerCase();
    if (imageIds.has(id)) throw new Error('Backup archive repeats a generated image ID.');
    imageIds.add(id);
    const extension = match[2]!.toLowerCase();
    const mimeType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
    if (!extensionForMime(mimeType) || bytes.length === 0 || bytes.length > 15 * 1024 * 1024)
      throw new Error('Backup archive contains an invalid generated image.');
    images.push({ id, mimeType, contents: Buffer.from(bytes) });
  }
  return { database: Buffer.from(database), images };
}

function isSqlite(contents: Buffer): boolean {
  return (
    contents.length >= sqliteSignature.length &&
    contents.subarray(0, sqliteSignature.length).equals(sqliteSignature)
  );
}
