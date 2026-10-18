import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const [executableArg, evidenceArg] = process.argv.slice(2);
if (!executableArg || !evidenceArg)
  throw Error('Pass the packaged executable and an evidence directory.');
const evidence = resolve(evidenceArg),
  profile = await mkdtemp(join(tmpdir(), 'sidekick-market-package-'));
await mkdir(evidence, { recursive: true });
let app;
const errors = [],
  dialogs = [];
try {
  app = await electron.launch({
    executablePath: resolve(executableArg),
    env: { ...process.env, SIDEKICK_VERIFICATION_ROOT: profile },
    timeout: 45000,
  });
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
  const page = await app.firstWindow({ timeout: 30000 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => {
    dialogs.push(d.type());
    void d.dismiss();
  });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.getByRole('button', { name: 'Advice', exact: true }).click();
  await page.getByRole('button', { name: 'Market signals', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Market Signals', exact: true });
  await panel
    .getByLabel('NFL game')
    .locator('option')
    .nth(1)
    .waitFor({ state: 'attached', timeout: 90000 });
  const choice = await panel.getByLabel('NFL game').locator('option').nth(1).getAttribute('value');
  await panel.getByLabel('NFL game').selectOption(choice);
  await panel.getByRole('button', { name: 'Load signals', exact: true }).click();
  await panel
    .getByRole('button', { name: 'Freeze prospective record' })
    .waitFor({ timeout: 100000 });
  await panel.screenshot({ path: join(evidence, 'packaged-market-signals.png') });
  const ledgerBefore = await page.evaluate(
    async () => await (await fetch('/api/market-signals/records')).json(),
  );
  assert.deepEqual(ledgerBefore, { records: [] });
  const signalText = await panel.innerText();
  assert.match(signalText, /do not affect betting predictions/);
  const canFreeze = await panel
    .getByRole('button', { name: 'Freeze prospective record' })
    .isEnabled();
  if (canFreeze) {
    await panel.getByRole('button', { name: 'Freeze prospective record' }).click();
    await panel.getByRole('status').waitFor();
  }
  await page.getByRole('button', { name: 'New decision', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze a bet', exact: true }).click();
  await page.getByRole('button', { name: 'Player props', exact: true }).click();
  assert.equal(
    await page.getByRole('combobox', { name: 'Bet type', exact: true }).inputValue(),
    'player-prop',
  );
  await page.getByRole('region', { name: 'Player prop research' }).waitFor({ state: 'visible' });
  const state = await page.evaluate(
    async () => await (await fetch('/api/advice/performance/export')).json(),
  );
  assert.equal(state.records.length, 0);
  assert.deepEqual(dialogs, []);
  assert.deepEqual(errors, []);
  await writeFile(
    join(evidence, 'verification.json'),
    JSON.stringify(
      {
        packaged: true,
        isolated: true,
        signalCaptureRendered: true,
        prospectiveEligible: canFreeze,
        playerPropsVisible: true,
        dialogs,
        errors,
      },
      null,
      2,
    ),
  );
  // Verification mode closes without a quit dialog and never accesses the owner's vault/profile.
  await app.close();
  app = undefined;
  console.log('Packaged Market Signals and player-prop entry checks passed.');
} finally {
  if (app) await app.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
