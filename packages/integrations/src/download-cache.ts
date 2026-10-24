import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readBoundedText } from './http.js';

/**
 * A disk cache for public downloads (nflverse files, the Sleeper player list). Every use still
 * asks the server, but conditionally (ETag / Last-Modified): an unchanged file answers 304 with
 * no body and is read from disk. So a restart or a scheduled refresh costs a few bytes instead
 * of megabytes, and "retrieved at" stays honest because the copy was confirmed current.
 *
 * Big files can be kept in a derived, compact form (`derive`) instead of their raw text, e.g.
 * depth charts reduced to rank changes. Only public data is cached; files are private to the
 * user (0600 in a 0700 folder) and the folder is capped by size, oldest-used first.
 */
export interface CachedValue<T> {
  value: T;
  /** When the server last confirmed this copy (now, unless the network failed). */
  validatedAt: string;
  /** True when the network failed and an earlier copy was used. */
  stale: boolean;
}
interface Meta {
  url: string;
  version: string;
  etag?: string;
  lastModified?: string;
  validatedAt: string;
}

let configuredDirectory: string | undefined;
let configuredLimit = 300 * 1024 * 1024;
/** Turns on the disk cache for the process (the API calls this with its data folder). */
export function configureDownloadCache(directory: string | undefined, maxBytes = configuredLimit) {
  configuredDirectory = directory;
  configuredLimit = maxBytes;
}

export async function cachedDownload<T>(
  url: string,
  options: {
    fetcher?: typeof fetch;
    maxBytes: number;
    accept?: string;
    timeoutMs?: number;
    now?: () => number;
    /** Parses the downloaded text; runs only on a fresh download. */
    parse: (text: string) => T;
    /** Store a compact form instead of the raw text; bump `version` when the form changes. */
    derive?: { version: string; encode: (value: T) => unknown; decode: (stored: unknown) => T };
  },
): Promise<CachedValue<T>> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const directory = configuredDirectory;
  const version = options.derive?.version ?? 'raw';
  const key = createHash('sha256').update(`${url}\u0000${version}`).digest('hex').slice(0, 32);
  const metaPath = directory && join(directory, `${key}.meta.json`);
  const dataPath = directory && join(directory, `${key}.data`);
  let meta: Meta | undefined;
  if (metaPath)
    try {
      const parsed = JSON.parse(await readFile(metaPath, 'utf8')) as Meta;
      if (parsed.url === url && parsed.version === version) meta = parsed;
    } catch {
      meta = undefined;
    }
  const readCached = async (): Promise<T> => {
    const text = await readFile(dataPath!, 'utf8');
    // Touch for least-recently-used eviction.
    await utimes(dataPath!, new Date(), new Date()).catch(() => undefined);
    return options.derive ? options.derive.decode(JSON.parse(text)) : options.parse(text);
  };
  let response: Response;
  try {
    response = await fetcher(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      redirect: 'follow',
      headers: {
        ...(options.accept ? { accept: options.accept } : {}),
        ...(meta?.etag ? { 'if-none-match': meta.etag } : {}),
        ...(meta?.lastModified ? { 'if-modified-since': meta.lastModified } : {}),
      },
    });
  } catch (error) {
    if (meta) return { value: await readCached(), validatedAt: meta.validatedAt, stale: true };
    throw error;
  }
  const validatedAt = new Date(now()).toISOString();
  if (response.status === 304 && meta) {
    await response.body?.cancel();
    const value = await readCached();
    await writeMeta(metaPath!, { ...meta, validatedAt });
    return { value, validatedAt, stale: false };
  }
  if (!response.ok) {
    await response.body?.cancel();
    if (meta) return { value: await readCached(), validatedAt: meta.validatedAt, stale: true };
    throw new Error(`Download failed (${response.status}).`);
  }
  const text = await readBoundedText(response, options.maxBytes);
  const value = options.parse(text);
  if (directory && dataPath && metaPath) {
    const etag = response.headers.get('etag') ?? undefined;
    const lastModified = response.headers.get('last-modified') ?? undefined;
    // Without a validator the server can't answer 304, so caching would only add disk writes.
    if (etag || lastModified)
      await (async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await atomicWrite(
          dataPath,
          options.derive ? JSON.stringify(options.derive.encode(value)) : text,
        );
        await writeMeta(metaPath, {
          url,
          version,
          ...(etag ? { etag } : {}),
          ...(lastModified ? { lastModified } : {}),
          validatedAt,
        });
        await enforceLimit(directory, configuredLimit);
      })().catch(() => undefined);
  }
  return { value, validatedAt, stale: false };
}

async function atomicWrite(path: string, text: string) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
const writeMeta = (path: string, meta: Meta) => atomicWrite(path, JSON.stringify(meta));

/** Removes least-recently-used entries until the folder fits the limit. */
async function enforceLimit(directory: string, limit: number) {
  const names = await readdir(directory);
  const entries = await Promise.all(
    names
      .filter((name) => name.endsWith('.data'))
      .map(async (name) => ({
        name,
        info: await stat(join(directory, name)).catch(() => undefined),
      })),
  );
  let total = entries.reduce((sum, entry) => sum + (entry.info?.size ?? 0), 0);
  for (const entry of entries
    .filter((e) => e.info)
    .sort((a, b) => a.info!.mtimeMs - b.info!.mtimeMs)) {
    if (total <= limit) break;
    const key = entry.name.slice(0, -'.data'.length);
    await rm(join(directory, entry.name), { force: true });
    await rm(join(directory, `${key}.meta.json`), { force: true });
    total -= entry.info!.size;
  }
}
