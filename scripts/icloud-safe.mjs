import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// The checkout can live in an iCloud Drive folder (for example ~/Documents). iCloud syncing
// generated folders creates "name 2.ext" conflict copies and can offload files so reads block.
// The File Provider ignore attribute keeps these folders local-only; it is harmless elsewhere.
const ignoreAttribute = 'com.apple.fileprovider.ignore#P';
const rootPath = fileURLToPath(new URL('../', import.meta.url));
export const generatedPaths = [
  '.git',
  'node_modules',
  'apps/api/node_modules',
  'apps/dashboard/node_modules',
  'apps/desktop/node_modules',
  'packages/core/node_modules',
  'packages/integrations/node_modules',
  'packages/core/dist',
  'packages/integrations/dist',
  'apps/api/dist',
  'apps/dashboard/dist',
  'apps/desktop/out',
  'apps/desktop/.bundle',
  'output',
];
const conflictName = /^(.+) [2-9](\.[^/]+)?$/;

/** Marks existing folders as local-only for iCloud Drive. No-op outside macOS. */
export function markLocalOnly(paths = generatedPaths, root = rootPath) {
  if (process.platform !== 'darwin') return [];
  const marked = [];
  for (const path of paths) {
    const target = join(root, path);
    if (!existsSync(target)) continue;
    const result = spawnSync('xattr', ['-w', ignoreAttribute, '1', target], { stdio: 'ignore' });
    if (result.status === 0) marked.push(path);
  }
  return marked;
}

async function* walk(directory, skip) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (skip.has(entry.name)) continue;
      yield* walk(path, skip);
    }
    yield { path, name: entry.name, directory: entry.isDirectory() };
  }
}

async function sameContent(a, b) {
  try {
    const [left, right] = await Promise.all([stat(a), stat(b)]);
    if (!left.isFile() || !right.isFile() || left.size !== right.size) return false;
    return (await readFile(a)).equals(await readFile(b));
  } catch {
    return false;
  }
}

/**
 * Removes iCloud conflict copies: any copy inside a generated folder, and source copies that are
 * byte-identical to their original. Copies that differ are reported and left for the owner.
 */
export async function removeConflictCopies(root = rootPath) {
  const removed = [];
  const kept = [];
  const generated = generatedPaths.map((path) => join(root, path));
  // Conflict copies of a whole generated folder ("dist 2") sit beside it.
  for (const path of generatedPaths)
    for (let copy = 2; copy <= 9; copy += 1) {
      const target = join(root, `${path} ${copy}`);
      if (!existsSync(target)) continue;
      await rm(target, { recursive: true, force: true });
      removed.push(relative(root, target));
    }
  // node_modules copies are build/install output; dist and out are rebuilt on every build.
  for (const target of generated) {
    if (!existsSync(target) || target.endsWith('node_modules')) continue;
    for await (const entry of walk(target, new Set())) {
      if (!conflictName.test(entry.name)) continue;
      await rm(entry.path, { recursive: true, force: true });
      removed.push(relative(root, entry.path));
    }
  }
  const skip = new Set(['node_modules', '.git', 'dist', 'out', '.bundle', 'output']);
  for await (const entry of walk(root, skip)) {
    const match = conflictName.exec(entry.name);
    if (!match || entry.directory) continue;
    const original = join(entry.path, '..', `${match[1]}${match[2] ?? ''}`);
    if (await sameContent(entry.path, original)) {
      await rm(entry.path, { force: true });
      removed.push(relative(root, entry.path));
    } else kept.push(relative(root, entry.path));
  }
  // Stale index copies are never read by git.
  for (const name of existsSync(join(root, '.git')) ? await readdir(join(root, '.git')) : [])
    if (/^index [2-9]$/.test(name)) {
      await rm(join(root, '.git', name), { force: true });
      removed.push(join('.git', name));
    }
  return { removed, kept };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { removed, kept } = await removeConflictCopies();
  const marked = markLocalOnly();
  if (marked.length) console.log(`Kept local-only (not synced by iCloud): ${marked.join(', ')}`);
  if (removed.length) console.log(`Removed ${removed.length} iCloud conflict copies.`);
  if (kept.length) {
    console.warn(`These iCloud conflict copies differ from their originals; review them:`);
    for (const path of kept) console.warn(`  ${path}`);
  }
}
