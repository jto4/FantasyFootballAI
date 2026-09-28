import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const assemblyScript = join(repositoryRoot, 'scripts', 'assemble-release-assets.sh');
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

test('release archive assembly includes each native package and verifies assets', async (context) => {
  if (!hasReleaseUtilities) {
    context.skip('The release assembly utilities are unavailable on this platform.');
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), 'sidekick-release-assembly-'));
  const input = join(directory, 'input');
  const output = join(directory, 'output');
  const packages = [
    { name: 'sunday-sidekick-Linux-X64', installer: 'SundaySidekick.deb' },
    { name: 'sunday-sidekick-Windows-X64', installer: 'Setup.exe' },
    { name: 'sunday-sidekick-macOS-ARM64', installer: 'Sunday Sidekick-arm64.dmg' },
    { name: 'sunday-sidekick-macOS-X64', installer: 'Sunday Sidekick-x64.dmg' },
  ];

  try {
    for (const [index, item] of packages.entries()) {
      const packageDirectory = join(input, item.name);
      await mkdir(packageDirectory, { recursive: true });
      await writeFile(join(packageDirectory, item.installer), `native package ${index}`);
    }

    const result = spawnSync('bash', [assemblyScript, input, output, 'v1.2.3'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    for (const item of packages) {
      const archive = join(output, `${item.name}-v1.2.3.zip`);
      const listing = spawnSync('unzip', ['-Z1', archive], { encoding: 'utf8' });
      assert.equal(listing.status, 0, listing.stderr);
      assert.ok(listing.stdout.split(/\r?\n/).includes(item.installer));
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
      const filename = item.name.includes('Windows') ? 'Setup.txt' : item.installer;
      await writeFile(join(packageDirectory, filename), `sample ${index}`);
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
      await writeFile(join(packageDirectory, item.installer), 'native package');
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
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
