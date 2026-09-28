import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { assertPortAvailable } from './port-check.mjs';

const rootPath = fileURLToPath(new URL('../', import.meta.url));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const dashboardUrl = 'http://127.0.0.1:4173';

await assertPortAvailable('127.0.0.1', 4173);

console.info('Building Sunday Sidekick…');
const build = spawnSync(npmCommand, ['run', 'build'], {
  cwd: rootPath,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const service = spawn(process.execPath, ['apps/api/dist/index.js'], {
  cwd: rootPath,
  stdio: 'inherit',
});
let stopping = false;

function stopService(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  if (service.exitCode === null) service.kill(signal);
}

process.once('SIGINT', () => stopService('SIGINT'));
process.once('SIGTERM', () => stopService('SIGTERM'));

service.once('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});

try {
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline && service.exitCode === null) {
    try {
      const response = await fetch(`${dashboardUrl}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      await delay(250);
    }
  }
  if (!ready) throw new Error('The local service did not become ready within 30 seconds.');

  console.info(`Dashboard ready at ${dashboardUrl}`);
  openDashboard();

  if (service.exitCode === null) {
    await new Promise((resolve) => service.once('exit', resolve));
  }
} catch (error) {
  stopService();
  throw error;
}

function openDashboard() {
  const opener =
    process.platform === 'darwin'
      ? ['open', [dashboardUrl]]
      : process.platform === 'win32'
        ? ['cmd.exe', ['/d', '/s', '/c', 'start', '""', dashboardUrl]]
        : ['xdg-open', [dashboardUrl]];
  const child = spawn(opener[0], opener[1], { stdio: 'ignore', detached: true });
  child.on('error', () => {
    console.info(`Could not open a browser automatically. Open ${dashboardUrl} manually.`);
  });
  child.unref();
}
