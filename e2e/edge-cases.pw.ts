import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';

test('search never narrows conflicting channels or changes monthly requests into weekly proposals', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Search the app' }).click();
    const input = page.getByRole('combobox', {
      name: 'Search settings, pages, leagues, and reports',
    });
    for (const query of [
      'stop sending texts but keep emails',
      'enable automatic emails and SMS',
      'schedule power rankings monthly',
    ]) {
      await input.fill(query);
      await expect(page.getByRole('option', { name: /Task ·/ })).toHaveCount(0);
    }
    expect(workspace.sends).toHaveLength(0);
    expect(
      workspace.store.settingsSnapshot().actions.find((action) => action.kind === 'power-rankings')
        ?.mode,
    ).toBe('draft');
  } finally {
    await workspace.close();
  }
});

test('ordinary compact times are retained in a proposed schedule', async ({ page }) => {
  const workspace = await apiWorkspace();
  try {
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Search the app' }).click();
    await page
      .getByRole('combobox', { name: 'Search settings, pages, leagues, and reports' })
      .fill('rankings every Friday at 9:30pm');
    await page.getByRole('option', { name: /Set up a report schedule/ }).click();
    const editor = page.getByRole('dialog', { name: 'Schedule power rankings' });
    await expect(editor.getByRole('textbox', { name: 'TIME', exact: true })).toHaveValue('21:30');
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});

test('sharing confirmation expires when the sample text changes', async ({ page, context }) => {
  const workspace = await apiWorkspace(false, false);
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(workspace.url).origin,
    });
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Try a sample league', exact: true }).click();
    const sample = page.getByRole('dialog', { name: 'Try a sample league' });
    await sample.getByRole('button', { name: 'Open sample draft' }).click();
    await sample.getByRole('button', { name: 'Copy report' }).click();
    await expect(sample.getByRole('status').filter({ hasText: 'Report copied' })).toBeVisible();
    const oldClipboard = await page.evaluate(() => navigator.clipboard.readText());
    await sample.getByRole('button', { name: 'Edit sample draft' }).click();
    await sample
      .getByLabel('Edit sample draft', { exact: true })
      .fill('New fictional report text, not copied yet.');
    await sample.getByRole('button', { name: 'Save sample draft' }).click();
    await expect(sample.getByRole('status').filter({ hasText: 'Report copied' })).toHaveCount(0);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(oldClipboard);
    await sample.getByRole('button', { name: 'Copy report' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      'New fictional report text',
    );
  } finally {
    await workspace.close();
  }
});

test('sample keyboard navigation remains inside the dialog on short narrow screens', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace(false, false);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(workspace.url);
    await expect(page).toHaveTitle('Sunday Sidekick');
    const trigger = page.getByRole('button', { name: 'Try a sample league', exact: true });
    await trigger.click();
    const sample = page.getByRole('dialog', { name: 'Try a sample league' });
    const close = sample.getByRole('button', { name: 'Close sample league' });
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(sample.getByRole('button', { name: 'Finish exploring' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await sample.getByRole('button', { name: 'Open sample draft' }).click();
    await expect(sample.getByRole('button', { name: 'Copy report' })).toBeVisible();
    await expect(sample).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    expect(await sample.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('narrow-sample.png') });
    await page.keyboard.press('Escape');
    await expect(sample).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});

test('local Help and FAQ remain usable when the service state cannot load', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.route('**/api/state?*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporary test outage' }),
      }),
    );
    await page.goto(workspace.url + '/#/help');
    await expect(page.getByRole('heading', { name: 'Help & FAQ' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Find a help answer' }).fill('not sending');
    await page.locator('#help-delivery summary').click();
    await expect(page.locator('#help-delivery')).toHaveAttribute('open', '');
    await expect(page.locator('#help-delivery')).toContainText('check provider history');
    await page.screenshot({ path: info.outputPath('help-during-outage.png') });
    await page.getByRole('button', { name: 'Search the app' }).click();
    await page
      .getByRole('combobox', { name: 'Search settings, pages, leagues, and reports' })
      .fill('Can I try Sidekick without an account?');
    await page.getByRole('option', { name: /Can I try Sidekick without an account/ }).click();
    await page.locator('#help-sample').getByRole('button', { name: 'Try a sample league' }).click();
    await expect(page.getByRole('dialog', { name: 'Try a sample league' })).toBeVisible();
    expect(errors).toEqual([]);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});
