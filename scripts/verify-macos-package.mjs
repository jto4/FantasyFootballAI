import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const reason = result.signal ?? result.status ?? 'unknown';
    throw new Error(`${command} ${args[0] ?? ''} failed (${reason}).`);
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

async function findApplicationBundle(mountpoint) {
  const entries = await readdir(mountpoint, { withFileTypes: true });
  const app = entries.find((entry) => entry.isDirectory() && entry.name === 'Sunday Sidekick.app');
  if (!app) throw new Error('The signed DMG does not contain Sunday Sidekick.app at its root.');
  return join(mountpoint, app.name);
}

export async function verifyMacPackageArtifacts({
  installerDirectory,
  teamId,
  platform = process.platform,
  commandRunner = run,
}) {
  if (platform !== 'darwin') throw new Error('macOS package verification must run on macOS.');
  if (typeof teamId !== 'string' || !/^[A-Z0-9]{10}$/.test(teamId))
    throw new Error('A valid Apple Developer Team ID is required to verify a release package.');

  const installers = (await readdir(installerDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.dmg'))
    .map((entry) => join(installerDirectory, entry.name));
  if (installers.length !== 1)
    throw new Error(`Expected exactly one macOS DMG in ${installerDirectory}.`);

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'sidekick-macos-package-check-'));
  const mountpoint = join(temporaryDirectory, 'mounted');
  let mounted = false;
  try {
    await commandRunner('hdiutil', [
      'attach',
      '-nobrowse',
      '-readonly',
      '-mountpoint',
      mountpoint,
      installers[0],
    ]);
    mounted = true;

    const appPath = await findApplicationBundle(mountpoint);
    await commandRunner('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
    const signature = await commandRunner('codesign', ['--display', '--verbose=4', appPath]);
    if (!signature.includes('Authority=Developer ID Application:'))
      throw new Error('The Mac app is not signed with a Developer ID Application certificate.');
    if (!signature.includes(`TeamIdentifier=${teamId}`))
      throw new Error('The Mac app signature does not match the configured Apple Developer team.');

    await commandRunner('xcrun', ['stapler', 'validate', appPath]);
    await commandRunner('spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath]);
  } finally {
    try {
      if (mounted) await commandRunner('hdiutil', ['detach', mountpoint]);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [installerDirectory, teamId] = process.argv.slice(2);
  if (!installerDirectory || !teamId)
    throw new Error('Usage: node scripts/verify-macos-package.mjs <installer-directory> <team-id>');
  await verifyMacPackageArtifacts({ installerDirectory, teamId });
  console.info(
    'Mac release package signature, notarization ticket, and Gatekeeper assessment passed.',
  );
}
