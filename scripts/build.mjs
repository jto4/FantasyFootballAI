import { mkdir, readdir, rm } from 'node:fs/promises';
import { markLocalOnly, removeConflictCopies } from './icloud-safe.mjs';
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
  // Empty the folder in place: deleting and recreating it makes iCloud Drive keep the old
  // one as a "dist 2" conflict copy. The folder keeps its local-only marker this way.
  const directory = join(rootPath, output);
  await mkdir(directory, { recursive: true });
  for (const entry of await readdir(directory))
    await rm(join(directory, entry), { recursive: true, force: true });
}
markLocalOnly(outputs);
await removeConflictCopies();

for (const workspace of builds) {
  const result = spawnSync(npmCommand, ['--workspace', workspace, 'run', 'build'], {
    cwd: rootPath,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
