import { spawn } from 'node:child_process';
import { access, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [executable, dataDirectory, ...options] = process.argv.slice(2);
if (!executable || !dataDirectory)
  throw new Error('Pass the packaged app and a temporary data folder.');
const useXvfb = options.includes('--xvfb');
const sandboxArguments = options.filter((option) => option !== '--xvfb');
const chromiumProfile = join(dataDirectory, 'chromium');
await mkdir(dataDirectory, { recursive: true });
const runtimeArgs = [
  ...sandboxArguments,
  `--user-data-dir=${chromiumProfile}`,
  '--sidekick-headless',
];
const command = useXvfb ? 'xvfb-run' : executable;
const args = useXvfb ? ['-a', executable, ...runtimeArgs] : runtimeArgs;
const child = spawn(command, args, {
  cwd: dataDirectory,
  env: {
    ...process.env,
    APPDATA: join(dataDirectory, 'appdata'),
    HOME: dataDirectory,
    LOCALAPPDATA: join(dataDirectory, 'localappdata'),
    SIDEKICK_USER_DATA_DIR: join(dataDirectory, 'data'),
    USERPROFILE: dataDirectory,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let output = '';
child.stdout.on('data', (chunk) => {
  output = `${output}${chunk}`.slice(-32_768);
});
child.stderr.on('data', (chunk) => {
  output = `${output}${chunk}`.slice(-32_768);
});
const exit = new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => resolve({ code, signal }));
});
const apiLogPath = join(dataDirectory, 'data', 'logs', 'api.log');

async function waitForApiShutdownLog(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const log = await readFile(apiLogPath, 'utf8').catch(() => '');
    if (log.includes('"event":"api.stopping"')) return;
    await delay(100);
  }
  throw new Error('Packaged headless desktop did not log API shutdown.');
}

try {
  const portFile = join(dataDirectory, 'data', 'service-port');
  const deadline = Date.now() + 60_000;
  let port;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        `Headless desktop exited before becoming ready (${child.exitCode ?? child.signalCode}).`,
      );
    try {
      port = (await readFile(portFile, 'utf8')).trim();
      if (/^\d{1,5}$/.test(port)) break;
    } catch {
      // The marker is published atomically after the local API is ready.
    }
    await delay(100);
  }
  if (!port) throw new Error('Headless desktop did not publish its local service port.');

  const health = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(5_000),
  });
  const healthBody = await health.json();
  if (!health.ok || healthBody.status !== 'ok' || healthBody.localOnly !== true)
    throw new Error('Packaged headless desktop returned an invalid local health response.');
  if (!output.includes('background service ready'))
    throw new Error('Packaged desktop did not confirm headless startup.');

  let result;
  if (process.platform === 'win32') {
    const shutdown = await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    });
    if (!shutdown.ok)
      throw new Error('Packaged headless desktop refused its local shutdown request.');
    await waitForApiShutdownLog(5_000);
    child.kill();
    result = await Promise.race([
      exit,
      delay(10_000).then(() => {
        throw new Error('Packaged headless desktop did not exit after the smoke check.');
      }),
    ]);
  } else {
    child.kill('SIGTERM');
    result = await Promise.race([
      exit,
      delay(15_000).then(() => {
        throw new Error('Packaged headless desktop did not exit after SIGTERM.');
      }),
    ]);
    if (result.code !== 0 && result.signal !== 'SIGTERM')
      throw new Error(
        `Packaged headless desktop exited unexpectedly (${result.code ?? result.signal}).`,
      );
    await access(portFile).then(
      () => {
        throw new Error('Packaged headless desktop left a stale service-port marker.');
      },
      () => undefined,
    );
  }

  const log = await readFile(apiLogPath, 'utf8');
  const events = log.split(/\r?\n/).flatMap((line) => {
    try {
      return [JSON.parse(line).event];
    } catch {
      return [];
    }
  });
  if (!events.includes('api.started') || !events.includes('api.stopping'))
    throw new Error('Packaged headless desktop did not log a complete API lifecycle.');
  console.info(
    'Packaged headless desktop smoke check passed: local API health and clean shutdown.',
  );
} catch (error) {
  child.kill('SIGTERM');
  await Promise.race([exit.catch(() => undefined), delay(3_000)]);
  throw error;
}
