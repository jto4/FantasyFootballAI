import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRotatingLogWriter } from './log-writer.mjs';

test('writes private bounded logs and rotates the configured number of copies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-api-logs-'));
  try {
    const writer = createRotatingLogWriter(directory, { maxBytes: 13, copies: 2 });
    await writer.write(Buffer.from('first-entry\n'));
    await writer.write(Buffer.from('second-entry\n'));
    await writer.write(Buffer.from('third-entry\n'));
    await writer.close();

    const names = (await readdir(directory)).sort();
    assert.deepEqual(names, ['api.log', 'api.log.1', 'api.log.2']);
    assert.equal(await readFile(join(directory, 'api.log'), 'utf8'), 'third-entry\n');
    assert.equal(await readFile(join(directory, 'api.log.1'), 'utf8'), 'second-entry\n');
    assert.equal(await readFile(join(directory, 'api.log.2'), 'utf8'), 'first-entry\n');
    assert.equal((await stat(join(directory, 'api.log'))).size, 12);
    await writer.write(Buffer.from('discarded after close'));
    assert.equal(await readFile(join(directory, 'api.log'), 'utf8'), 'third-entry\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
