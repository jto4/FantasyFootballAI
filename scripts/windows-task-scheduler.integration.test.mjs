import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createServiceManager } from './service-manager.mjs';

const shouldExerciseTaskScheduler = process.platform === 'win32' && process.env.CI === 'true';

test(
  'registers, runs, reports, stops, and removes a real per-user Windows scheduled task',
  { skip: !shouldExerciseTaskScheduler },
  async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'sidekick task scheduler '));
    const repositoryRoot = join(temporaryRoot, 'checkout with spaces');
    const scriptDirectory = join(repositoryRoot, 'scripts');
    const marker = join(temporaryRoot, 'task ran.txt');
    const taskName = `Sunday Sidekick CI ${process.pid}`;
    await mkdir(scriptDirectory, { recursive: true });
    await writeFile(
      join(scriptDirectory, 'service-runner.mjs'),
      `import { writeFile } from 'node:fs/promises';\nawait writeFile(${JSON.stringify(marker)}, 'started');\n`,
    );

    const taskQueries = [];
    const service = createServiceManager({
      platform: 'win32',
      home: temporaryRoot,
      repositoryRoot,
      nodePath: process.execPath,
      windowsTaskName: taskName,
      // The task itself and all lifecycle operations use the real Windows scheduler. The
      // isolated checkout has no project build to run before this scheduler-only exercise.
      runCommand(program, args, options) {
        if (program.toLowerCase() === 'npm.cmd') return { status: 0 };
        const result = spawnSync(program, args, {
          cwd: options.cwd,
          encoding: 'utf8',
          windowsHide: true,
        });
        if (args[0] === '/Query') taskQueries.push(result.stdout ?? '');
        return { status: result.status, error: result.error };
      },
      fetchImpl: async () => {
        throw new Error('No Sidekick API should be running during this isolated task test.');
      },
      logger: { info() {} },
    });

    try {
      await service.run('install');
      const deadline = Date.now() + 15_000;
      let ran = false;
      while (Date.now() < deadline) {
        try {
          ran = (await readFile(marker, 'utf8')) === 'started';
          if (ran) break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      assert.equal(
        ran,
        true,
        'Task Scheduler should launch the command and preserve spaced paths.',
      );

      await service.run('status');
      assert.ok((taskQueries.at(-1) ?? '').includes(taskName));
      assert.match(taskQueries.at(-1) ?? '', /Last Result:\s+0/i);
      const taskXml = spawnSync('schtasks.exe', ['/Query', '/TN', taskName, '/XML'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      assert.equal(taskXml.status, 0, taskXml.stderr);
      assert.match(taskXml.stdout ?? '', /<LogonTrigger>/i);
      await service.run('stop');
      await service.run('uninstall');

      const query = spawnSync('schtasks.exe', ['/Query', '/TN', taskName], {
        encoding: 'utf8',
        windowsHide: true,
      });
      assert.notEqual(query.status, 0, 'The isolated scheduled task should be removed.');
    } finally {
      spawnSync('schtasks.exe', ['/End', '/TN', taskName], { windowsHide: true });
      spawnSync('schtasks.exe', ['/Delete', '/TN', taskName, '/F'], { windowsHide: true });
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  },
);
