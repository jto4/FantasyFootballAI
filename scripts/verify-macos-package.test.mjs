import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyMacPackageArtifacts } from './verify-macos-package.mjs';

const teamId = 'TEAM123456';

async function packageFixture() {
  const root = await mkdtemp(join(tmpdir(), 'sidekick-signature-test-'));
  const installers = join(root, 'make');
  await mkdir(installers);
  await writeFile(join(installers, 'Sunday Sidekick.dmg'), 'fixture');
  return { root, installers };
}

test('verifies Developer ID, expected team, stapled ticket, and Gatekeeper for the packaged app', async (context) => {
  const { root, installers } = await packageFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const commands = [];
  let mountpoint = '';

  await verifyMacPackageArtifacts({
    installerDirectory: installers,
    teamId,
    platform: 'darwin',
    commandRunner: async (command, args) => {
      commands.push([command, args]);
      if (command === 'hdiutil' && args[0] === 'attach') {
        mountpoint = args[args.indexOf('-mountpoint') + 1];
        await mkdir(join(mountpoint, 'Sunday Sidekick.app'), { recursive: true });
      }
      if (command === 'codesign' && args[0] === '--display')
        return `Authority=Developer ID Application: Sunday Sidekick (${teamId})\nTeamIdentifier=${teamId}`;
      return '';
    },
  });

  assert.deepEqual(
    commands.map(([command]) => command),
    ['hdiutil', 'codesign', 'codesign', 'xcrun', 'spctl', 'hdiutil'],
  );
  await assert.rejects(readdir(mountpoint), { code: 'ENOENT' });
});

test('refuses unsigned, ad-hoc, or wrong-team app signatures and still detaches the image', async () => {
  const { root, installers } = await packageFixture();
  try {
    const commands = [];
    await assert.rejects(
      verifyMacPackageArtifacts({
        installerDirectory: installers,
        teamId,
        platform: 'darwin',
        commandRunner: async (command, args) => {
          commands.push([command, args]);
          if (command === 'hdiutil' && args[0] === 'attach') {
            const mountpoint = args[args.indexOf('-mountpoint') + 1];
            await mkdir(join(mountpoint, 'Sunday Sidekick.app'), { recursive: true });
          }
          if (command === 'codesign' && args[0] === '--display')
            return 'Authority=Developer ID Application: Other App (OTHERTEAM12)\nTeamIdentifier=OTHERTEAM12';
          return '';
        },
      }),
      /does not match the configured Apple Developer team/,
    );
    assert.equal(commands.at(-1)?.[0], 'hdiutil');
    assert.equal(commands.at(-1)?.[1][0], 'detach');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('requires exactly one DMG and a macOS runner', async () => {
  const { root, installers } = await packageFixture();
  try {
    await assert.rejects(
      verifyMacPackageArtifacts({ installerDirectory: installers, teamId, platform: 'linux' }),
      /must run on macOS/,
    );
    await writeFile(join(installers, 'another.dmg'), 'fixture');
    await assert.rejects(
      verifyMacPackageArtifacts({ installerDirectory: installers, teamId, platform: 'darwin' }),
      /exactly one macOS DMG/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('blocks artifact verification when notarization stapling fails and still detaches the image', async () => {
  const { root, installers } = await packageFixture();
  try {
    const commands = [];
    await assert.rejects(
      verifyMacPackageArtifacts({
        installerDirectory: installers,
        teamId,
        platform: 'darwin',
        commandRunner: async (command, args) => {
          commands.push([command, args]);
          if (command === 'hdiutil' && args[0] === 'attach') {
            const mountpoint = args[args.indexOf('-mountpoint') + 1];
            await mkdir(join(mountpoint, 'Sunday Sidekick.app'), { recursive: true });
          }
          if (command === 'codesign' && args[0] === '--display')
            return `Authority=Developer ID Application: Sunday Sidekick (${teamId})\nTeamIdentifier=${teamId}`;
          if (command === 'xcrun') throw new Error('notarization ticket missing');
          return '';
        },
      }),
      /notarization ticket missing/,
    );
    assert.equal(
      commands.some(([command]) => command === 'spctl'),
      false,
    );
    assert.equal(commands.at(-1)?.[0], 'hdiutil');
    assert.equal(commands.at(-1)?.[1][0], 'detach');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
