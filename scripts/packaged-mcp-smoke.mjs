import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';

const [executable, dataDirectory, ...runtimeArguments] = process.argv.slice(2);
if (!executable || !dataDirectory) throw new Error('Usage: packaged-mcp-smoke <app> <data-dir>');
await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
const paths = [];
const api = createServer((request, response) => {
  paths.push(request.url);
  response.setHeader('content-type', 'application/json');
  if (request.url === '/api/health') {
    response.end(JSON.stringify({ status: 'ok', localOnly: true }));
  } else if (request.url === '/api/leagues') {
    response.end(JSON.stringify([{ id: 'smoke-league', displayName: 'Smoke League' }]));
  } else {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  }
});
api.listen(0, '127.0.0.1');
await once(api, 'listening');
const address = api.address();
if (!address || typeof address === 'string') throw new Error('Could not start the smoke API.');
await writeFile(join(dataDirectory, 'service-port'), `${address.port}\n`, { mode: 0o600 });

const app = spawn(executable, [...runtimeArguments, '--sidekick-mcp'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
  env: {
    ...process.env,
    SIDEKICK_USER_DATA_DIR: dataDirectory,
    HOME: dataDirectory,
    USERPROFILE: dataDirectory,
  },
});
let stderr = '';
let buffer = '';
let closed = false;
const pending = new Map();
let nextId = 0;
const failure = new Promise((_, reject) => {
  app.once('error', reject);
  app.once('close', (code) => {
    closed = true;
    reject(
      new Error(`Packaged MCP process exited before completing the handshake (${code}). ${stderr}`),
    );
  });
});
app.stdout.setEncoding('utf8').on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) break;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.id !== undefined) pending.get(message.id)?.(message);
  }
});
app.stderr.setEncoding('utf8').on('data', (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-4_000);
});

function request(method, params) {
  const id = ++nextId;
  return Promise.race([
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Packaged MCP request timed out: ${method}. ${stderr}`));
      }, 10_000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(message.error.message ?? `MCP ${method} failed.`));
        else resolve(message.result);
      });
      app.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    }),
    failure,
  ]);
}

try {
  const initialized = await request('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'packaged-smoke', version: '1.0.0' },
  });
  assert.equal(initialized.serverInfo.name, 'sunday-sidekick');
  app.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

  const tools = await request('tools/list', {});
  assert.ok(tools.tools.some((tool) => tool.name === 'list_leagues'));
  const result = await request('tools/call', { name: 'list_leagues', arguments: {} });
  assert.match(JSON.stringify(result), /Smoke League/);
  assert.ok(paths.includes('/api/health'));
  assert.ok(paths.includes('/api/leagues'));
  console.info(
    'Packaged MCP smoke check passed: stdio handshake, tool discovery, and local API call.',
  );
} finally {
  if (!closed) {
    app.stdin.end();
    await Promise.race([once(app, 'close'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
    if (!closed) app.kill();
  }
  api.close();
}
