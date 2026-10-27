import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { generatedPaths, markLocalOnly, removeConflictCopies } from './icloud-safe.mjs';

test('removes generated and identical conflict copies and keeps differing ones', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-icloud-'));
  try {
    await mkdir(join(root, 'packages/core/dist/research 2'), { recursive: true });
    await mkdir(join(root, 'apps/api/dist 2/nested'), { recursive: true });
    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(join(root, '.git'), { recursive: true });
    await writeFile(join(root, 'packages/core/dist/index 2.js'), 'old build');
    await writeFile(join(root, 'src/a.ts'), 'same');
    await writeFile(join(root, 'src/a 2.ts'), 'same');
    await writeFile(join(root, 'src/b.ts'), 'current');
    await writeFile(join(root, 'src/b 2.ts'), 'different edit');
    await writeFile(join(root, 'src/version 10.ts'), 'not a conflict name');
    await writeFile(join(root, '.git/index'), 'index');
    await writeFile(join(root, '.git/index 2'), 'stale');

    const { removed, kept } = await removeConflictCopies(root);

    assert.ok(!existsSync(join(root, 'packages/core/dist/index 2.js')));
    assert.ok(!existsSync(join(root, 'packages/core/dist/research 2')));
    assert.ok(!existsSync(join(root, 'apps/api/dist 2')));
    assert.ok(!existsSync(join(root, 'src/a 2.ts')));
    assert.ok(!existsSync(join(root, '.git/index 2')));
    assert.ok(existsSync(join(root, 'src/b 2.ts')));
    assert.ok(existsSync(join(root, 'src/version 10.ts')));
    assert.ok(existsSync(join(root, '.git/index')));
    assert.deepEqual(kept, [join('src', 'b 2.ts')]);
    assert.equal(removed.length, 5);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('marks build output and local verification folders as local-only', async (t) => {
  assert.ok(generatedPaths.includes('apps/desktop/out'));
  assert.ok(generatedPaths.includes('.sidekick'));
  if (process.platform !== 'darwin') {
    assert.deepEqual(markLocalOnly(['apps/desktop/out'], '/nonexistent'), []);
    return t.skip('Extended attributes are a macOS feature.');
  }
  const root = await mkdtemp(join(tmpdir(), 'sidekick-icloud-'));
  try {
    await mkdir(join(root, 'apps/desktop/out'), { recursive: true });
    assert.deepEqual(markLocalOnly(['apps/desktop/out', 'missing'], root), ['apps/desktop/out']);
    const read = spawnSync(
      'xattr',
      ['-p', 'com.apple.fileprovider.ignore#P', join(root, 'apps/desktop/out')],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(read.stdout.trim(), '1');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
