import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const assemblyScript = join(repositoryRoot, 'scripts', 'assemble-release-assets.sh');
const releaseWorkflow = await readFile(
  join(repositoryRoot, '.github', 'workflows', 'desktop-packages.yml'),
  'utf8',
);
const hasReleaseUtilities =
  process.platform !== 'win32' &&
  spawnSync(
    'bash',
    [
      '-c',
      'command -v bash >/dev/null && command -v zip >/dev/null && command -v unzip >/dev/null && (command -v sha256sum >/dev/null || command -v shasum >/dev/null)',
    ],
    { stdio: 'ignore' },
  ).status === 0;

test('draft release publication uploads every native updater asset and checksum', () => {
  const commands = releaseWorkflow
    .split(/\r?\n/)
    .filter((line) => /gh release (?:upload|create)/.test(line));
  assert.equal(commands.length, 2);
  assert.match(releaseWorkflow, /gh release create[\s\S]{0,1000}--generate-notes/);
  for (const command of commands) {
    for (const asset of [
      'release-assets/*.zip',
      'release-assets/RELEASES',
      'release-assets/*-full.nupkg',
      'release-assets/*-win32-x64-Setup.exe',
      'release-assets/SHA256SUMS',
      'release-assets/UPDATE-SHA256SUMS',
    ]) {
      assert.ok(command.includes(asset), `Release command is missing ${asset}`);
    }
  }
});

test('release archive assembly includes each native package and verifies assets', async (context) => {
  if (!hasReleaseUtilities) {
    context.skip('The release assembly utilities are unavailable on this platform.');
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), 'sidekick-release-assembly-'));
  const input = join(directory, 'input');
  const output = join(directory, 'output');
  const packages = [
    {
      name: 'sunday-sidekick-Linux-X64',
      installers: ['SundaySidekick.deb', 'sunday-sidekick.rpm'],
    },
    {
      name: 'sunday-sidekick-Windows-X64',
      installers: ['Setup.exe', 'SundaySidekick-1.2.3-full.nupkg', 'RELEASES'],
    },
    {
      name: 'sunday-sidekick-macOS-ARM64',
      installers: ['Sunday Sidekick-arm64.dmg', 'Sunday Sidekick-darwin-arm64-1.2.3.zip'],
    },
    {
      name: 'sunday-sidekick-macOS-X64',
      installers: ['Sunday Sidekick-x64.dmg', 'Sunday Sidekick-darwin-x64-1.2.3.zip'],
    },
  ];

  try {
    for (const [index, item] of packages.entries()) {
      const packageDirectory = join(input, item.name);
      await mkdir(packageDirectory, { recursive: true });
      for (const installer of item.installers ?? [item.installer]) {
        await writeFile(join(packageDirectory, installer), `native package ${index}`);
      }
    }

    const result = spawnSync('bash', [assemblyScript, input, output, 'v1.2.3'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    for (const item of packages) {
      const sourceEntries = await readdir(join(input, item.name));
      assert.ok(!sourceEntries.includes('INSTALL.md'));
      assert.ok(!sourceEntries.includes('LICENSE'));

      const archive = join(output, `${item.name}-v1.2.3.zip`);
      const listing = spawnSync('unzip', ['-Z1', archive], { encoding: 'utf8' });
      assert.equal(listing.status, 0, listing.stderr);
      for (const installer of item.installers ?? [item.installer]) {
        assert.ok(listing.stdout.split(/\r?\n/).includes(installer));
      }
      assert.ok(listing.stdout.split(/\r?\n/).includes('INSTALL.md'));
      assert.ok(listing.stdout.split(/\r?\n/).includes('LICENSE'));

      for (const filename of ['INSTALL.md', 'LICENSE']) {
        const contents = spawnSync('unzip', ['-p', archive, filename], { encoding: 'utf8' });
        assert.equal(contents.status, 0, contents.stderr);
        assert.equal(
          contents.stdout,
          await readFile(
            join(repositoryRoot, filename === 'LICENSE' ? 'LICENSE' : 'docs/release-install.md'),
            'utf8',
          ),
        );
      }
    }

    for (const filename of [
      'RELEASES',
      'SundaySidekick-1.2.3-full.nupkg',
      'Sunday-Sidekick-win32-x64-Setup.exe',
      'Sunday Sidekick-darwin-arm64-1.2.3.zip',
      'Sunday Sidekick-darwin-x64-1.2.3.zip',
      'UPDATE-SHA256SUMS',
    ]) {
      await readFile(join(output, filename));
    }

    const updateHashCheck = spawnSync('shasum', ['-a', '256', '--check', 'UPDATE-SHA256SUMS'], {
      cwd: output,
      encoding: 'utf8',
    });
    const portableUpdateHashCheck =
      updateHashCheck.error?.code === 'ENOENT'
        ? spawnSync('sha256sum', ['--check', 'UPDATE-SHA256SUMS'], {
            cwd: output,
            encoding: 'utf8',
          })
        : updateHashCheck;
    assert.equal(
      portableUpdateHashCheck.status,
      0,
      portableUpdateHashCheck.stderr || portableUpdateHashCheck.stdout,
    );

    const hashCheck = spawnSync('shasum', ['-a', '256', '--check', 'SHA256SUMS'], {
      cwd: output,
      encoding: 'utf8',
    });
    const portableHashCheck =
      hashCheck.error?.code === 'ENOENT'
        ? spawnSync('sha256sum', ['--check', 'SHA256SUMS'], {
            cwd: output,
            encoding: 'utf8',
          })
        : hashCheck;
    assert.equal(portableHashCheck.status, 0, portableHashCheck.stderr || portableHashCheck.stdout);

    const invalidInput = join(directory, 'invalid-input');
    const invalidOutput = join(directory, 'invalid-output');
    for (const [index, item] of packages.entries()) {
      const packageDirectory = join(invalidInput, item.name);
      await mkdir(packageDirectory, { recursive: true });
      const filename = item.name.includes('Windows')
        ? 'Setup.txt'
        : (item.installers?.[0] ?? item.installer);
      for (const installer of item.installers ?? [item.installer]) {
        await writeFile(
          join(packageDirectory, filename === 'Setup.txt' ? filename : installer),
          `sample ${index}`,
        );
      }
    }

    const rejected = spawnSync('bash', [assemblyScript, invalidInput, invalidOutput, 'v1.2.3'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Native installer \(\*\.exe\) is missing/);
    assert.deepEqual(await readdir(invalidOutput), []);

    const missingIntelInput = join(directory, 'missing-intel-input');
    const missingIntelOutput = join(directory, 'missing-intel-output');
    for (const item of packages.filter((item) => item.name !== 'sunday-sidekick-macOS-X64')) {
      const packageDirectory = join(missingIntelInput, item.name);
      await mkdir(packageDirectory, { recursive: true });
      for (const installer of item.installers ?? [item.installer]) {
        await writeFile(join(packageDirectory, installer), 'native package');
      }
    }
    const missingIntel = spawnSync(
      'bash',
      [assemblyScript, missingIntelInput, missingIntelOutput, 'v1.2.3'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(missingIntel.status, 1);
    assert.match(
      missingIntel.stderr,
      /Expected packages from Linux, Windows, and both macOS architectures/,
    );
    assert.deepEqual(await readdir(missingIntelOutput), []);

    const missingRpmInput = join(directory, 'missing-rpm-input');
    const missingRpmOutput = join(directory, 'missing-rpm-output');
    for (const item of packages) {
      const packageDirectory = join(missingRpmInput, item.name);
      await mkdir(packageDirectory, { recursive: true });
      for (const installer of item.installers ?? [item.installer]) {
        if (installer.endsWith('.rpm')) continue;
        await writeFile(join(packageDirectory, installer), 'native package');
      }
    }
    const missingRpm = spawnSync(
      'bash',
      [assemblyScript, missingRpmInput, missingRpmOutput, 'v1.2.3'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(missingRpm.status, 1);
    assert.match(missingRpm.stderr, /Native installer \(\*\.rpm\) is missing/);
    assert.deepEqual(await readdir(missingRpmOutput), []);

    const symlinkInput = join(directory, 'symlink-input');
    const symlinkOutput = join(directory, 'symlink-output');
    const outsideFile = join(directory, 'outside.txt');
    await writeFile(outsideFile, 'leave this file alone');
    for (const item of packages) {
      const packageDirectory = join(symlinkInput, item.name);
      await mkdir(packageDirectory, { recursive: true });
      for (const installer of item.installers ?? [item.installer]) {
        await writeFile(join(packageDirectory, installer), 'native package');
      }
    }
    await symlink(outsideFile, join(symlinkInput, packages[0].name, 'INSTALL.md'));
    const symlinkRejected = spawnSync(
      'bash',
      [assemblyScript, symlinkInput, symlinkOutput, 'v1.2.3'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(symlinkRejected.status, 1);
    assert.match(symlinkRejected.stderr, /Artifact contains a symlink or special file/);
    assert.deepEqual(await readdir(symlinkOutput), []);
    assert.equal(await readFile(outsideFile, 'utf8'), 'leave this file alone');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('refuses to publish update assets when a platform update payload is incomplete', async (context) => {
  if (!hasReleaseUtilities) {
    context.skip('The release assembly utilities are unavailable on this platform.');
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), 'sidekick-update-release-'));
  const input = join(directory, 'input');
  const output = join(directory, 'output');
  const artifacts = [
    ['sunday-sidekick-Linux-X64', ['Sidekick.deb', 'Sidekick.rpm']],
    ['sunday-sidekick-Windows-X64', ['Setup.exe', 'Sidekick-full.nupkg']],
    ['sunday-sidekick-macOS-ARM64', ['Sidekick.dmg', 'Sidekick-darwin-arm64-1.0.0.zip']],
    ['sunday-sidekick-macOS-X64', ['Sidekick.dmg', 'Sidekick-darwin-x64-1.0.0.zip']],
  ];

  try {
    for (const [name, files] of artifacts) {
      const artifact = join(input, name);
      await mkdir(artifact, { recursive: true });
      for (const file of files) await writeFile(join(artifact, file), 'fixture');
    }
    const result = spawnSync('bash', [assemblyScript, input, output, 'v1.0.0'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Windows update metadata, full package, or installer is missing/);
    assert.deepEqual(await readdir(output), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
