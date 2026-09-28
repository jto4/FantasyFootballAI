import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { serviceEnvironment, servicePaths } from './service-config.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const paths = servicePaths(homedir(), repositoryRoot);
await mkdir(paths.logDirectory, { recursive: true, mode: 0o700 });
await chmod(paths.logDirectory, 0o700).catch(() => undefined);
await rotateIfLarge(paths.stdoutLog);
await rotateIfLarge(paths.stderrLog);

const stdout = createWriteStream(paths.stdoutLog, { flags: 'a', mode: 0o600 });
const stderr = createWriteStream(paths.stderrLog, { flags: 'a', mode: 0o600 });
await Promise.all([waitForOpen(stdout), waitForOpen(stderr)]);
await Promise.all([chmod(paths.stdoutLog, 0o600), chmod(paths.stderrLog, 0o600)]).catch(
  () => undefined,
);
const api = spawn(process.execPath, ['apps/api/dist/index.js'], {
  cwd: repositoryRoot,
  stdio: ['ignore', stdout, stderr],
  env: serviceEnvironment(process.env, paths.dataDirectory),
});
let stopping = false;

function forwardSignal(signal) {
  if (stopping) return;
  stopping = true;
  if (api.exitCode === null) api.kill(signal);
}

process.once('SIGINT', () => forwardSignal('SIGINT'));
process.once('SIGTERM', () => forwardSignal('SIGTERM'));
api.once('error', (error) => {
  stderr.write(`Could not start the local API: ${error.message}\n`);
  process.exitCode = 1;
  stdout.end();
  stderr.end();
});
stdout.on('error', () => {
  process.exitCode = 1;
  if (api.exitCode === null) api.kill('SIGTERM');
});
stderr.on('error', () => {
  process.exitCode = 1;
  if (api.exitCode === null) api.kill('SIGTERM');
});
api.once('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
  stdout.end();
  stderr.end();
});

function waitForOpen(stream) {
  return new Promise((resolve, reject) => {
    if (stream.fd !== null) return resolve();
    stream.once('open', resolve);
    stream.once('error', reject);
  });
}

async function rotateIfLarge(path) {
  try {
    if ((await stat(path)).size < 10 * 1024 * 1024) return;
    await unlink(`${path}.1`).catch(() => undefined);
    await rename(path, `${path}.1`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
