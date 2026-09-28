import { lstat, readdir, readlink, realpath, symlink, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

/** Replace absolute symlinks that point inside a packaged tree with portable relative links. */
export async function makeInternalSymlinksRelative(root) {
  const absoluteRoot = resolve(root);
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await readlink(path);
        if (
          isAbsolute(target) &&
          (target === absoluteRoot || target.startsWith(`${absoluteRoot}${sep}`))
        ) {
          const portableTarget = relative(dirname(path), target);
          await unlink(path);
          await symlink(portableTarget || '.', path);
        }
        await realpath(path);
      } else if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        await lstat(path);
      }
    }
  };
  await visit(absoluteRoot);
}
