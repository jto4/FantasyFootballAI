import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  isDataDirectoryActive,
  copyLocalDirectory,
  parseSavedDataDirectory,
  resolveDataDirectory,
} from './data-directory.mjs';

test('desktop data directory selection honors override, saved selection, and default order', () => {
  assert.equal(
    resolveDataDirectory({
      environmentOverride: '/tmp/override',
      savedDirectory: '/tmp/saved',
      defaultDirectory: '/tmp/default',
    }),
    '/tmp/override',
  );
  assert.equal(
    resolveDataDirectory({ savedDirectory: '/tmp/saved', defaultDirectory: '/tmp/default' }),
    '/tmp/saved',
  );
  assert.equal(resolveDataDirectory({ defaultDirectory: '/tmp/default' }), '/tmp/default');
});

test('desktop data directory selection ignores bad saved preferences and rejects relative paths', () => {
  assert.equal(parseSavedDataDirectory('{'), undefined);
  assert.equal(parseSavedDataDirectory('{"directory":"relative"}'), undefined);
  assert.throws(
    () =>
      resolveDataDirectory({ environmentOverride: 'relative', defaultDirectory: '/tmp/default' }),
    /absolute path/,
  );
});

test('does not switch into a folder whose Sidekick service is currently running', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sidekick-active-data-'));
  try {
    await writeFile(path.join(directory, 'service-port'), '43821\n');
    assert.equal(
      await isDataDirectoryActive(directory, async (url) => {
        assert.equal(url, 'http://127.0.0.1:43821/api/health');
        return new Response(JSON.stringify({ status: 'ok', localOnly: true }), { status: 200 });
      }),
      true,
    );
    assert.equal(
      await isDataDirectoryActive(
        directory,
        async () =>
          new Response(JSON.stringify({ status: 'ok', localOnly: false }), { status: 200 }),
      ),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('copies private local data directories through a completed staging copy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sidekick-data-copy-'));
  const source = path.join(root, 'source-images');
  const destination = path.join(root, 'new-data', 'images');
  try {
    await mkdir(source, { mode: 0o700 });
    await writeFile(path.join(source, 'image.webp'), Buffer.from([1, 2, 3]), { mode: 0o600 });
    assert.equal(await copyLocalDirectory(source, destination), true);
    assert.deepEqual(await readFile(path.join(destination, 'image.webp')), Buffer.from([1, 2, 3]));
    if (process.platform !== 'win32') {
      assert.equal((await lstat(destination)).mode & 0o777, 0o700);
      assert.equal((await lstat(path.join(destination, 'image.webp'))).mode & 0o777, 0o600);
    }
    assert.equal(
      await copyLocalDirectory(path.join(root, 'missing'), path.join(root, 'skip')),
      false,
    );
    assert.equal(
      (await readdir(path.join(root, 'new-data'))).some((name) => name.includes('.copy-')),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects destinations inside the source tree and existing destination folders', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sidekick-data-overlap-'));
  const source = path.join(root, 'source');
  const existing = path.join(root, 'existing');
  try {
    await mkdir(source);
    await mkdir(existing);
    await writeFile(path.join(existing, 'keep.txt'), 'keep');
    await assert.rejects(
      copyLocalDirectory(source, path.join(source, 'nested', 'copy')),
      /cannot be inside the source data folder/,
    );
    assert.deepEqual(await readdir(source), []);
    await assert.rejects(copyLocalDirectory(source, existing), /destination folder already exists/);
    assert.equal(await readFile(path.join(existing, 'keep.txt'), 'utf8'), 'keep');
    assert.deepEqual(await readdir(root), ['existing', 'source']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects nested symbolic links without publishing a partial copy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sidekick-data-symlink-'));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'target');
  try {
    await mkdir(source);
    await writeFile(path.join(root, 'outside.txt'), 'outside');
    await symlink(path.join(root, 'outside.txt'), path.join(source, 'outside-link'));
    await assert.rejects(copyLocalDirectory(source, destination), /symbolic links/);
    await assert.rejects(lstat(destination), { code: 'ENOENT' });
    assert.deepEqual(await readdir(root), ['outside.txt', 'source']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restricts Windows migration staging to the current account before copying files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sidekick-data-acl-'));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'target');
  const calls = [];
  try {
    await mkdir(source);
    await writeFile(path.join(source, 'backup.zip'), 'private');
    await copyLocalDirectory(source, destination, {
      platform: 'win32',
      runCommand: async (command, args) => {
        calls.push([command, args]);
        return command === 'powershell.exe' ? { stdout: 'S-1-5-21-123-456-789-1001\n' } : {};
      },
    });
    assert.equal(calls[0][0], 'powershell.exe');
    assert.equal(calls[1][0], 'icacls.exe');
    assert.deepEqual(calls[1][1].slice(1, 3), ['/inheritance:r', '/grant:r']);
    assert.match(calls[1][1][3], /^\*S-1-5-21-123-456-789-1001:/);
    assert.equal(await readFile(path.join(destination, 'backup.zip'), 'utf8'), 'private');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not copy or publish data when Windows ACL setup fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sidekick-data-acl-failure-'));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'target');
  try {
    await mkdir(source);
    await writeFile(path.join(source, 'backup.zip'), 'private');
    await assert.rejects(
      copyLocalDirectory(source, destination, {
        platform: 'win32',
        runCommand: async (command) =>
          command === 'powershell.exe' ? { stdout: 'not-a-sid' } : {},
      }),
      /current Windows account/,
    );
    await assert.rejects(lstat(destination), { code: 'ENOENT' });
    assert.deepEqual(await readdir(root), ['source']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

if (process.platform === 'win32') {
  test('Windows migration output has a protected ACL limited to the current account', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sidekick-data-real-acl-'));
    const source = path.join(root, 'source');
    const destination = path.join(root, 'target');
    try {
      await mkdir(path.join(source, 'nested'), { recursive: true });
      await writeFile(path.join(source, 'nested', 'backup.zip'), 'private');
      await copyLocalDirectory(source, destination);

      const readAcl = (target) => {
        const encodedPath = Buffer.from(target, 'utf8').toString('base64');
        const script = [
          `$TargetPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'))`,
          '$acl = Get-Acl -LiteralPath $TargetPath',
          '$sids = @($acl.Access | ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value })',
          'ConvertTo-Json -Compress -InputObject @{ protected = $acl.AreAccessRulesProtected; sids = $sids }',
        ].join('; ');
        return JSON.parse(
          execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
            encoding: 'utf8',
          }),
        );
      };
      const accountSid = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
        ],
        { encoding: 'utf8' },
      ).trim();

      for (const target of [
        destination,
        path.join(destination, 'nested'),
        path.join(destination, 'nested', 'backup.zip'),
      ]) {
        const acl = readAcl(target);
        assert.deepEqual(acl.sids, [accountSid]);
        if (target === destination) assert.equal(acl.protected, true);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
