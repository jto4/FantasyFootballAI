import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readDesktopMcpEndpoint } from './mcp-endpoint.mjs';

test('reads and health-checks the running packaged API endpoint', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sidekick-mcp-'));
  try {
    await writeFile(path.join(directory, 'service-port'), '43821\n', { mode: 0o600 });
    const request = async (url) => {
      assert.equal(url, 'http://127.0.0.1:43821/api/health');
      return new Response('{}', { status: 200 });
    };
    assert.equal(await readDesktopMcpEndpoint(directory, request), 'http://127.0.0.1:43821');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('requires a running desktop service and rejects invalid or stale endpoints', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sidekick-mcp-'));
  try {
    await assert.rejects(readDesktopMcpEndpoint(directory), /Start Sunday Sidekick/);
    await writeFile(path.join(directory, 'service-port'), 'http://example.com');
    await assert.rejects(readDesktopMcpEndpoint(directory), /valid local service endpoint/);
    await writeFile(path.join(directory, 'service-port'), '43821');
    await assert.rejects(
      readDesktopMcpEndpoint(directory, async () => new Response('{}', { status: 503 })),
      /not responding locally/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
