import { chmod, mkdir, rename, rm, stat, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_ENTRY_BYTES = 16 * 1024;

/** Persist only API stdout (JSON events) in a small rotating, private local log set. */
export function createRotatingLogWriter(directory, { maxBytes = 2_000_000, copies = 3 } = {}) {
  const path = join(directory, 'api.log');
  let queue = Promise.resolve();
  let closed = false;

  async function rotateIfNeeded(incomingBytes) {
    const currentSize = await stat(path).then(
      (details) => details.size,
      () => 0,
    );
    if (currentSize + incomingBytes <= maxBytes) return;
    for (let index = copies; index >= 1; index -= 1) {
      const source = index === 1 ? path : `${path}.${index - 1}`;
      const destination = `${path}.${index}`;
      if (index === copies) await rm(destination, { force: true });
      try {
        await rename(source, destination);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }

  return {
    write(chunk) {
      if (closed) return Promise.resolve();
      const data = Buffer.from(chunk).subarray(0, MAX_ENTRY_BYTES);
      queue = queue
        .catch(() => undefined)
        .then(async () => {
          await mkdir(directory, { recursive: true, mode: 0o700 });
          await chmod(directory, 0o700).catch(() => undefined);
          await rotateIfNeeded(data.byteLength);
          await appendFile(path, data, { mode: 0o600 });
          await chmod(path, 0o600).catch(() => undefined);
        });
      return queue;
    },
    async close() {
      closed = true;
      await queue.catch(() => undefined);
    },
  };
}
