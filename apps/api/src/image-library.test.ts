import { afterEach, describe, expect, it } from 'vitest';
import { lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deleteLocalImage,
  listLocalImages,
  readLocalImage,
  saveGeneratedImage,
} from './image-library.js';

let directory = '';

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = '';
});

describe('local generated-image library', () => {
  it('stores private image files, lists and reads them, then deletes them', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-image-library-'));
    const databasePath = join(directory, 'state.sqlite');
    const contents = Buffer.from('small png fixture');
    const saved = await saveGeneratedImage(
      databasePath,
      `data:image/png;base64,${contents.toString('base64')}`,
    );

    expect(saved).toMatchObject({
      id: expect.stringMatching(/^[a-f\d-]{36}$/i),
      mimeType: 'image/png',
    });
    const imagePath = join(directory, 'images', `${saved.id}.png`);
    // NTFS access is controlled by the user-profile ACL, not POSIX mode bits.
    if (process.platform !== 'win32') {
      expect((await lstat(imagePath)).mode & 0o777).toBe(0o600);
    }
    expect(await listLocalImages(databasePath)).toEqual([saved]);
    expect((await readLocalImage(databasePath, saved.id))?.contents).toEqual(contents);
    expect(await deleteLocalImage(databasePath, saved.id)).toBe(true);
    expect(await listLocalImages(databasePath)).toEqual([]);
  });

  it('rejects unsupported data and does not accept path-like image IDs', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sidekick-image-library-'));
    const databasePath = join(directory, 'state.sqlite');
    await expect(
      saveGeneratedImage(databasePath, 'https://images.example.test/a.png'),
    ).rejects.toThrow();
    await expect(saveGeneratedImage(databasePath, 'data:image/png;base64,!!!!')).rejects.toThrow();
    expect(await readLocalImage(databasePath, '../../state.sqlite')).toBeUndefined();
    expect(await deleteLocalImage(databasePath, '../../state.sqlite')).toBe(false);
  });
});
