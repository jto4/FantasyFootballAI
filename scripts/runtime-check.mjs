import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export function isSupportedNodeVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, major, minor] = match.map(Number);
  return major === 22 && minor >= 13;
}

export function assertSupportedNodeVersion(version) {
  if (!isSupportedNodeVersion(version)) {
    throw new Error(
      `Use the verified Node.js 22 LTS line (22.13 or newer within Node 22). This command is using ${version || 'an unknown version'}. Select the version in .nvmrc, run npm ci, then try again.`,
    );
  }
}

export function assertSQLiteRuntime(load = () => createRequire(import.meta.url)('better-sqlite3')) {
  try {
    const Database = load();
    const database = new Database(':memory:');
    database.close();
  } catch {
    throw new Error(
      'The SQLite native module cannot load in this Node runtime. Select the Node version in .nvmrc and run npm ci. This runtime check does not open your saved database; database recovery is not needed.',
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assertSupportedNodeVersion(process.versions.node);
    assertSQLiteRuntime();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unsupported Node.js version.');
    process.exitCode = 1;
  }
}
