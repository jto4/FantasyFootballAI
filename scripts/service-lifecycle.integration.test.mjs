import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { createServiceManager } from './service-manager.mjs';
import { serviceName, servicePaths, windowsTaskCommand } from './service-config.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const serviceCli = join(repositoryRoot, 'scripts', 'service.mjs');
const fakeCommand = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const name = process.argv[1].split(/[\\\\/]/).at(-1);
appendFileSync(process.env.SIDEKICK_FAKE_COMMAND_LOG, JSON.stringify({ name, args: process.argv.slice(2) }) + '\\n');
`;

function runService(home, path, logPath, command, { shim } = {}) {
  return new Promise((resolve, reject) => {
    const childArgs = shim ? ['--import', shim, serviceCli, command] : [serviceCli, command];
    const child = spawn(process.execPath, childArgs, {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        PATH: path,
        SIDEKICK_FAKE_COMMAND_LOG: logPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (part) => (stdout += part));
    child.stderr.setEncoding('utf8').on('data', (part) => (stderr += part));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`service ${command} failed (${code}): ${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

describe('macOS source service lifecycle CLI', { skip: process.platform !== 'darwin' }, () => {
  it('installs privately and runs lifecycle commands without touching the real LaunchAgent', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'sidekick-service-lifecycle-'));
    const home = join(temporaryRoot, 'home');
    const bin = join(temporaryRoot, 'bin');
    const logPath = join(temporaryRoot, 'commands.jsonl');
    await Promise.all([mkdir(home, { recursive: true }), mkdir(bin, { recursive: true })]);

    try {
      for (const name of ['npm', 'launchctl']) {
        const commandPath = join(bin, name);
        await writeFile(commandPath, fakeCommand, { mode: 0o700 });
        await chmod(commandPath, 0o700);
      }
      const fakePath = `${bin}${delimiter}${process.env.PATH ?? ''}`;
      for (const command of ['install', 'update', 'start', 'stop', 'status']) {
        await runService(home, fakePath, logPath, command);
      }

      const launchAgent = join(home, 'Library', 'LaunchAgents', 'com.sundaysidekick.app.plist');
      const agentContents = await readFile(launchAgent, 'utf8');
      const agentStat = await stat(launchAgent);
      assert.equal(agentStat.mode & 0o777, 0o600);
      assert.ok(agentContents.includes(repositoryRoot));
      assert.ok(agentContents.includes(join(home, '.sidekick', 'logs', 'service.log')));

      const calls = (await readFile(logPath, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.deepEqual(
        calls.filter((call) => call.name === 'npm').map((call) => call.args),
        [
          ['run', 'build'],
          ['run', 'build'],
        ],
      );
      assert.deepEqual(
        calls.filter((call) => call.name === 'launchctl').map((call) => call.args[0]),
        ['bootout', 'bootstrap', 'bootout', 'bootstrap', 'bootstrap', 'bootout', 'print'],
      );
      assert.ok(
        calls
          .filter((call) => call.name === 'launchctl')
          .every((call) =>
            call.args.some((argument) => argument.startsWith(`gui/${process.getuid()}`)),
          ),
      );

      await runService(home, fakePath, logPath, 'uninstall');
      await assert.rejects(stat(launchAgent), { code: 'ENOENT' });
      const finalCalls = (await readFile(logPath, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.equal(finalCalls.at(-1)?.name, 'launchctl');
      assert.equal(finalCalls.at(-1)?.args[0], 'bootout');
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

describe('Linux source service lifecycle CLI', { skip: process.platform === 'win32' }, () => {
  it('installs privately and runs lifecycle commands against a temporary systemd home', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'sidekick-systemd-lifecycle-'));
    const home = join(temporaryRoot, 'home');
    const bin = join(temporaryRoot, 'bin');
    const logPath = join(temporaryRoot, 'commands.jsonl');
    const platformShim = join(temporaryRoot, 'force-linux.mjs');
    await Promise.all([mkdir(home, { recursive: true }), mkdir(bin, { recursive: true })]);

    try {
      await writeFile(
        platformShim,
        "Object.defineProperty(process, 'platform', { value: 'linux' });\n",
      );
      for (const name of ['npm', 'systemctl']) {
        const commandPath = join(bin, name);
        await writeFile(commandPath, fakeCommand, { mode: 0o700 });
        await chmod(commandPath, 0o700);
      }
      const fakePath = `${bin}${delimiter}${process.env.PATH ?? ''}`;
      const options = { shim: platformShim };
      for (const command of ['install', 'update', 'start', 'stop', 'status']) {
        await runService(home, fakePath, logPath, command, options);
      }

      const unit = join(home, '.config', 'systemd', 'user', 'sunday-sidekick.service');
      const unitContents = await readFile(unit, 'utf8');
      const unitStat = await stat(unit);
      assert.equal(unitStat.mode & 0o777, 0o600);
      assert.ok(unitContents.includes(repositoryRoot));
      assert.ok(unitContents.includes('UMask=0077'));
      assert.ok(unitContents.includes(join(repositoryRoot, 'scripts', 'service-runner.mjs')));

      const calls = (await readFile(logPath, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.deepEqual(
        calls.filter((call) => call.name === 'npm').map((call) => call.args),
        [
          ['run', 'build'],
          ['run', 'build'],
        ],
      );
      assert.deepEqual(
        calls.filter((call) => call.name === 'systemctl').map((call) => call.args),
        [
          ['--user', 'daemon-reload'],
          ['--user', 'enable', '--now', 'sunday-sidekick.service'],
          ['--user', 'restart', 'sunday-sidekick.service'],
          ['--user', 'daemon-reload'],
          ['--user', 'enable', '--now', 'sunday-sidekick.service'],
          ['--user', 'restart', 'sunday-sidekick.service'],
          ['--user', 'start', 'sunday-sidekick.service'],
          ['--user', 'stop', 'sunday-sidekick.service'],
          ['--user', 'status', 'sunday-sidekick.service', '--no-pager'],
        ],
      );

      await runService(home, fakePath, logPath, 'uninstall', options);
      await assert.rejects(stat(unit), { code: 'ENOENT' });
      const finalCalls = (await readFile(logPath, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.deepEqual(
        finalCalls.slice(-2).map((call) => call.args),
        [
          ['--user', 'disable', '--now', 'sunday-sidekick.service'],
          ['--user', 'daemon-reload'],
        ],
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

describe('Windows source service lifecycle manager', () => {
  it('runs install, update, start, stop, status, and uninstall through Task Scheduler commands', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'sidekick-windows-lifecycle-'));
    const home = join(temporaryRoot, 'home');
    const repository = join(temporaryRoot, 'repo');
    await Promise.all([mkdir(home, { recursive: true }), mkdir(repository, { recursive: true })]);
    const calls = [];
    const healthRequests = [];
    const nodePath = join(temporaryRoot, 'Program Files', 'node.exe');
    const paths = servicePaths(home, repository);
    const service = createServiceManager({
      platform: 'win32',
      home,
      repositoryRoot: repository,
      nodePath,
      runCommand: (program, args, options) => {
        calls.push({ program, args, options });
        return { status: 0 };
      },
      fetchImpl: async (url) => {
        healthRequests.push(url);
        return { ok: true, json: async () => ({ backgroundService: false }) };
      },
      logger: { info() {} },
    });

    try {
      for (const command of ['install', 'update', 'start', 'stop', 'status', 'uninstall']) {
        assert.equal(await service.run(command), true);
      }
      assert.deepEqual(
        calls.map(({ program, args }) => [program, ...args]),
        [
          ['npm.cmd', 'run', 'build'],
          ['schtasks.exe', '/End', '/TN', serviceName],
          [
            'schtasks.exe',
            '/Create',
            '/TN',
            serviceName,
            '/SC',
            'ONLOGON',
            '/TR',
            windowsTaskCommand(nodePath, paths.serviceScript),
            '/F',
          ],
          ['schtasks.exe', '/Run', '/TN', serviceName],
          ['npm.cmd', 'run', 'build'],
          ['schtasks.exe', '/End', '/TN', serviceName],
          [
            'schtasks.exe',
            '/Create',
            '/TN',
            serviceName,
            '/SC',
            'ONLOGON',
            '/TR',
            windowsTaskCommand(nodePath, paths.serviceScript),
            '/F',
          ],
          ['schtasks.exe', '/Run', '/TN', serviceName],
          ['schtasks.exe', '/Run', '/TN', serviceName],
          ['schtasks.exe', '/End', '/TN', serviceName],
          ['schtasks.exe', '/Query', '/TN', serviceName, '/FO', 'LIST', '/V'],
          ['schtasks.exe', '/End', '/TN', serviceName],
          ['schtasks.exe', '/Delete', '/TN', serviceName, '/F'],
        ],
      );
      assert.equal(calls[0]?.options.shell, true);
      assert.equal(calls[1]?.options.shell, false);
      assert.deepEqual(healthRequests, [
        'http://127.0.0.1:4173/api/health',
        'http://127.0.0.1:4173/api/health',
      ]);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
