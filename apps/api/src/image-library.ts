import { randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';

const maximumImageBytes = 15 * 1024 * 1024;
const imageTypes = {
  png: { extension: '.png', mimeType: 'image/png' },
  jpeg: { extension: '.jpg', mimeType: 'image/jpeg' },
  webp: { extension: '.webp', mimeType: 'image/webp' },
} as const;

export interface LocalImage {
  id: string;
  createdAt: string;
  size: number;
  mimeType: string;
}

export interface ImportedLocalImage {
  id: string;
  mimeType: string;
  contents: Buffer;
}

export async function saveGeneratedImage(
  databasePath: string,
  source: string,
): Promise<LocalImage> {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
  if (!match || match[2]!.length % 4 !== 0)
    throw new Error('Generated image is not supported for local storage.');
  const format = match[1] as keyof typeof imageTypes;
  const contents = Buffer.from(match[2]!, 'base64');
  if (contents.length === 0 || contents.length > maximumImageBytes)
    throw new Error('Generated image exceeds the 15 MB local storage limit.');

  const directory = imageDirectory(databasePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => undefined);
  const id = randomUUID();
  const path = join(directory, `${id}${imageTypes[format].extension}`);
  await writeFile(path, contents, { flag: 'wx', mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
  const details = await lstat(path);
  return {
    id,
    createdAt: details.mtime.toISOString(),
    size: details.size,
    mimeType: imageTypes[format].mimeType,
  };
}

export async function listLocalImages(databasePath: string): Promise<LocalImage[]> {
  const directory = imageDirectory(databasePath);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const images = await Promise.all(
    names.map(async (name) => {
      const parsed = parseImageName(name);
      if (!parsed) return undefined;
      try {
        const details = await lstat(join(directory, name));
        if (!details.isFile() || details.size === 0 || details.size > maximumImageBytes)
          return undefined;
        return {
          id: parsed.id,
          createdAt: details.mtime.toISOString(),
          size: details.size,
          mimeType: parsed.mimeType,
        };
      } catch {
        return undefined;
      }
    }),
  );
  return images
    .filter((image): image is LocalImage => image !== undefined)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function readLocalImage(
  databasePath: string,
  id: string,
): Promise<{ image: LocalImage; contents: Buffer } | undefined> {
  const image = (await listLocalImages(databasePath)).find((item) => item.id === id);
  if (!image) return undefined;
  const extension = Object.values(imageTypes).find(
    (type) => type.mimeType === image.mimeType,
  )?.extension;
  if (!extension) return undefined;
  try {
    return {
      image,
      contents: await readFile(join(imageDirectory(databasePath), `${id}${extension}`)),
    };
  } catch {
    return undefined;
  }
}

export async function deleteLocalImage(databasePath: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const image = (await listLocalImages(databasePath)).find((item) => item.id === id);
  if (!image) return false;
  const extension = Object.values(imageTypes).find(
    (type) => type.mimeType === image.mimeType,
  )?.extension;
  if (!extension) return false;
  try {
    await unlink(join(imageDirectory(databasePath), `${id}${extension}`));
    return true;
  } catch {
    return false;
  }
}

/** Replace the image library as one directory swap after a backup has been validated. */
export async function replaceLocalImages(
  databasePath: string,
  images: ImportedLocalImage[],
): Promise<void> {
  const parent = dirname(databasePath);
  const destination = imageDirectory(databasePath);
  const staging = join(parent, `.images-restore-${randomUUID()}`);
  const previous = join(parent, `.images-previous-${randomUUID()}`);
  await mkdir(staging, { recursive: false, mode: 0o700 });
  try {
    for (const image of images) {
      const extension = extensionForMime(image.mimeType);
      if (
        !isUuid(image.id) ||
        !extension ||
        image.contents.length === 0 ||
        image.contents.length > maximumImageBytes
      )
        throw new Error('Backup contains an invalid local image.');
      await writeFile(join(staging, `${image.id}${extension}`), image.contents, {
        flag: 'wx',
        mode: 0o600,
      });
    }
    await chmod(staging, 0o700).catch(() => undefined);
    try {
      await rename(destination, previous);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try {
      await rename(staging, destination);
    } catch (error) {
      await rename(previous, destination).catch(() => undefined);
      throw error;
    }
    await rm(previous, { recursive: true, force: true }).catch(() => undefined);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function imageDirectory(databasePath: string): string {
  return join(dirname(databasePath), 'images');
}

function parseImageName(name: string): { id: string; mimeType: string } | undefined {
  const extension = extname(name).toLowerCase();
  const type = Object.values(imageTypes).find((item) => item.extension === extension);
  const id = name.slice(0, -extension.length);
  return type && isUuid(id) ? { id, mimeType: type.mimeType } : undefined;
}

export function extensionForMime(mimeType: string): string | undefined {
  return Object.values(imageTypes).find((type) => type.mimeType === mimeType)?.extension;
}

function isUuid(value: string): boolean {
  return /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
}
