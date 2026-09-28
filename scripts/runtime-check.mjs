import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function isSupportedNodeVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, major, minor] = match.map(Number);
  return major > 22 || (major === 22 && minor >= 13);
}

export function assertSupportedNodeVersion(version) {
  if (!isSupportedNodeVersion(version)) {
    throw new Error(
      `Node.js 22.13 or newer is required. This command is using ${version || 'an unknown version'}. Install a current Node.js release, then try again.`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assertSupportedNodeVersion(process.versions.node);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unsupported Node.js version.');
    process.exitCode = 1;
  }
}
