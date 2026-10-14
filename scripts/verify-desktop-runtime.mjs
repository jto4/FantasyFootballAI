import { _electron as electron } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const [executableArgument, evidenceArgument] = process.argv.slice(2);
if (!executableArgument || !evidenceArgument)
  throw new Error('Pass a packaged executable and an evidence output directory.');
const executable = resolve(executableArgument);
const evidenceDirectory = resolve(evidenceArgument);
const temporary = await mkdtemp(join(tmpdir(), 'sidekick-native-verification-'));
await mkdir(evidenceDirectory, { recursive: true });
const executableSha256 = createHash('sha256')
  .update(await readFile(executable))
  .digest('hex');
const payloadPath =
  process.platform === 'darwin'
    ? join(dirname(executable), '..', 'Resources', 'app.asar')
    : join(dirname(executable), 'resources', 'app.asar');
const applicationPayloadSha256 = createHash('sha256')
  .update(await readFile(payloadPath))
  .digest('hex');
let application;
const errors = [];
try {
  application = await electron.launch({
    executablePath: executable,
    env: { ...process.env, SIDEKICK_VERIFICATION_ROOT: temporary },
    timeout: 45000,
  });
  const runtime = await application.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    version: app.getVersion(),
    platform: process.platform,
    architecture: process.arch,
    electron: process.versions.electron,
    mockKeychain: app.commandLine.hasSwitch('use-mock-keychain'),
  }));
  assert.equal(runtime.packaged, true, 'Verification must launch the packaged app.');
  if (process.platform === 'darwin') assert.equal(runtime.mockKeychain, true);
  const profile = await application.evaluate(({ app }) => ({
    applicationData: app.getPath('appData'),
    browserData: app.getPath('userData'),
  }));
  assert.equal(profile.applicationData, join(temporary, 'preferences'));
  assert.equal(profile.browserData, join(temporary, 'chromium'));
  const window = await application.firstWindow({ timeout: 30000 });
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.session.isPersistent(),
    ),
    false,
  );
  const dialogs = [];
  window.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    void dialog.dismiss().catch(() => undefined);
  });
  window.on('pageerror', (error) => errors.push(error.message));
  window.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await window.getByRole('heading', { name: 'Sunday’s league desk' }).waitFor({ timeout: 30000 });
  await window.getByText('Local service running', { exact: true }).waitFor();
  assert.equal(
    await window.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
    ),
    '#ffffff',
    'A new packaged profile must use the white appearance.',
  );
  const credentials = await window.evaluate(async () => {
    const response = await fetch('/api/credentials');
    return response.json();
  });
  assert.ok(
    Array.isArray(credentials) &&
      credentials.length > 0 &&
      credentials.every((item) => item.configured === false),
    'Verification must use an empty isolated credential namespace.',
  );
  assert.equal(await window.evaluate(() => window.sidekickDesktop.isVerificationMode()), true);
  const writeStatus = await window.evaluate(async (value) => {
    const response = await fetch('/api/credentials/backup-encryption', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    return response.status;
  }, `fictional-verification-${randomUUID()}`);
  assert.equal(writeStatus, 204);
  try {
    const isolatedProbe = await window.evaluate(async () => {
      const response = await fetch('/api/credentials');
      return response.json();
    });
    assert.equal(
      isolatedProbe.find((item) => item.provider === 'backup-encryption')?.configured,
      true,
      'The API child must round-trip the temporary verification credential without a native vault.',
    );
  } finally {
    assert.equal(
      await window.evaluate(
        async () =>
          (await fetch('/api/credentials/backup-encryption', { method: 'DELETE' })).status,
      ),
      204,
    );
  }
  const protocol = await window.evaluate(async () => {
    const response = await fetch('/api/advice/protocol');
    return response.json();
  });
  assert.ok(
    protocol.available && /^[a-f0-9]{64}$/.test(protocol.protocol?.sourceHash),
    'Packaged prospective cohorts require a verified installed-code fingerprint.',
  );
  await window.evaluate(async () => {
    await window.sidekickDesktop.setTeamSelections({ 'fictional-league': 'fictional-team' });
    localStorage.clear();
  });
  await window.screenshot({ path: join(evidenceDirectory, 'native-league-desk.png') });
  await window.getByRole('button', { name: 'Settings', exact: true }).click();
  await window.getByRole('button', { name: 'Storage & desktop', exact: true }).click();
  await window.getByText('Automatic backups', { exact: true }).click();
  await window.getByText('Export & restore a backup', { exact: true }).click();
  await window
    .locator('summary')
    .filter({ hasText: /^Diagnostics$/ })
    .click();
  await window.getByRole('button', { name: 'Refresh backup status', exact: true }).waitFor();
  await window.getByRole('button', { name: 'Refresh diagnostics', exact: true }).click();
  await window.getByText('Generation queue:', { exact: false }).waitFor();
  await window.screenshot({ path: join(evidenceDirectory, 'native-storage.png') });
  await window.getByRole('switch', { name: 'Dark mode', exact: true }).click();
  assert.equal(
    await window.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
    ),
    '#000000',
    'Packaged dark mode must use the black canvas.',
  );
  await window.screenshot({ path: join(evidenceDirectory, 'native-dark-mode.png') });
  await window.getByRole('button', { name: 'Voice', exact: true }).click();
  await window.getByLabel('Topics to avoid', { exact: true }).fill('Unsaved fictional test input');
  assert.equal(
    await window.evaluate(
      async () =>
        (
          await fetch('/api/credentials/backup-encryption', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ value: 'fictional-discard-on-restart' }),
          })
        ).status,
    ),
    204,
  );
  assert.deepEqual(errors, [], 'Native renderer emitted errors.');
  await window.getByRole('button', { name: 'Stop Sunday Sidekick', exact: true }).click();
  assert.deepEqual(dialogs, [], 'A private test Stop must not display a confirmation popup.');
  await application.close();
  application = undefined;
  const log = await readFile(join(temporary, 'data', 'logs', 'api.log'), 'utf8');
  assert.ok(log.includes('"event":"api.stopping"'), 'Native stop did not flush shutdown evidence.');
  application = await electron.launch({
    executablePath: executable,
    env: { ...process.env, SIDEKICK_VERIFICATION_ROOT: temporary },
    timeout: 45000,
  });
  const restarted = await application.firstWindow({ timeout: 30000 });
  restarted.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    void dialog.dismiss().catch(() => undefined);
  });
  await restarted.getByRole('heading', { name: 'Sunday’s league desk' }).waitFor();
  assert.equal(
    await restarted.evaluate(async () => {
      const credentials = await (await fetch('/api/credentials')).json();
      return credentials.some((credential) => credential.configured);
    }),
    false,
    'Test credentials must be discarded at API restart.',
  );
  assert.equal(
    await restarted.evaluate(() => document.documentElement.dataset.theme),
    'dark',
    'Dark mode must survive native restart with cleared renderer storage.',
  );
  assert.deepEqual(
    await restarted.evaluate(() => window.sidekickDesktop.getTeamSelections()),
    { 'fictional-league': 'fictional-team' },
    'Team selection must survive native restart without relying on port-specific renderer storage.',
  );
  await restarted.getByRole('button', { name: 'Stop Sunday Sidekick', exact: true }).click();
  assert.deepEqual(dialogs, [], 'Test restart and Stop must remain dialog-free.');
  await application.close();
  application = undefined;

  const evidence = {
    checkedAt: new Date().toISOString(),
    status: 'passed',
    runtime,
    executableSha256,
    applicationPayloadSha256,
    checks: [
      'packaged GUI launch',
      'team preference survives restart and cleared renderer storage',
      'isolated preferences, single-instance profile, database and process-memory test credentials',
      'nonpersistent browser session and macOS test-only Chromium mock Keychain',
      'API child round-trips a disposable credential without loading the OS credential binding',
      'test Stop and restart produce no confirmation dialogs',
      'test teardown discards unsaved fixture input without a close popup',
      'test credentials disappear at restart',
      'rendered league desk',
      'local API health',
      'packaged numerical code fingerprint for prospective cohorts',
      'storage and backup status',
      'white default and black dark mode survive restart with cleared renderer storage',
      'diagnostics',
      'dashboard stop',
      'flushed API shutdown',
    ],
    limitations: [
      'No interactive installer, login startup, signing, or published upgrade verification. No owner data or provider credentials changed.',
    ],
  };
  await writeFile(
    join(evidenceDirectory, 'native-runtime.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(JSON.stringify(evidence));
} catch (error) {
  // Keep failure evidence compact; renderer text and platform errors may contain local paths.
  await writeFile(
    join(evidenceDirectory, 'native-runtime.json'),
    `${JSON.stringify({ checkedAt: new Date().toISOString(), status: 'failed', platform: process.platform, architecture: process.arch, executableSha256, reason: 'Packaged runtime verification failed. Inspect the local command output.' }, null, 2)}\n`,
  );
  throw error;
} finally {
  await application?.close();
  await rm(temporary, { recursive: true, force: true });
}
