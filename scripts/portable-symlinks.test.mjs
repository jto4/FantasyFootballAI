import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { makeInternalSymlinksRelative } from './portable-symlinks.mjs';

test('rewrites absolute links within packaged trees and rejects broken links', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sidekick-package-links-'));
  const copiedRoot = `${root}-copy`;
  try {
    const framework = path.join(root, 'App', 'Contents', 'Frameworks', 'Example.framework');
    const versions = path.join(framework, 'Versions', 'A');
    await mkdir(versions, { recursive: true });
    await writeFile(path.join(versions, 'Example'), 'binary');
    await symlink(versions, path.join(framework, 'Versions', 'Current'));
    await symlink(
      path.join(framework, 'Versions', 'Current', 'Example'),
      path.join(framework, 'Example'),
    );

    await makeInternalSymlinksRelative(root);

    assert.equal(await readlink(path.join(framework, 'Versions', 'Current')), 'A');
    assert.equal(
      await readlink(path.join(framework, 'Example')),
      path.join('Versions', 'Current', 'Example'),
    );
    assert.equal(
      await realpath(path.join(framework, 'Example')),
      await realpath(path.join(versions, 'Example')),
    );

    await cp(root, copiedRoot, { recursive: true, verbatimSymlinks: true });
    assert.equal(
      await readlink(
        path.join(
          copiedRoot,
          'App',
          'Contents',
          'Frameworks',
          'Example.framework',
          'Versions',
          'Current',
        ),
      ),
      'A',
    );

    await symlink(path.join(root, 'missing'), path.join(root, 'broken-link'));
    await assert.rejects(makeInternalSymlinksRelative(root));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(copiedRoot, { recursive: true, force: true });
  }
});
