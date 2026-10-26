import { readFile, writeFile } from 'node:fs/promises';

const limit = 200;
const text = (value, max) =>
  typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

/**
 * The game-day notifications this app has shown, newest first, so one that was missed or
 * dismissed can be read again. Kept beside the sent-alert keys, owner-only, and read back
 * through validation since the file is outside the app's database.
 */
export function createNotificationHistory(path, now = Date.now) {
  let entries;
  let writes = Promise.resolve();
  async function load() {
    if (entries) return entries;
    try {
      const value = JSON.parse(await readFile(path, 'utf8'));
      entries = Array.isArray(value)
        ? value
            .filter(
              (e) =>
                e &&
                text(e.at, 40) &&
                text(e.title, 200) &&
                text(e.body, 1000) &&
                (e.hash === undefined || text(e.hash, 500)),
            )
            .slice(0, limit)
        : [];
    } catch {
      entries = [];
    }
    return entries;
  }
  return {
    async add({ title, body, hash }) {
      const list = await load();
      list.unshift({
        at: new Date(now()).toISOString(),
        title: String(title).slice(0, 200),
        body: String(body).slice(0, 1000),
        ...(typeof hash === 'string' && hash.startsWith('#') ? { hash: hash.slice(0, 500) } : {}),
      });
      entries = list.slice(0, limit);
      const snapshot = JSON.stringify(entries);
      writes = writes
        .catch(() => undefined)
        .then(() => writeFile(path, snapshot, { mode: 0o600 }))
        .catch(() => undefined);
      return writes;
    },
    async list() {
      return [...(await load())];
    },
  };
}
