import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootPath = fileURLToPath(new URL('../', import.meta.url));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const outputs = [
  'packages/core/dist',
  'packages/integrations/dist',
  'apps/api/dist',
  'apps/dashboard/dist',
];
const builds = ['@sidekick/core', '@sidekick/integrations', '@sidekick/api', '@sidekick/dashboard'];

for (const output of outputs) {
  await rm(join(rootPath, output), { recursive: true, force: true });
}

for (const workspace of builds) {
  const result = spawnSync(npmCommand, ['--workspace', workspace, 'run', 'build'], {
    cwd: rootPath,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
