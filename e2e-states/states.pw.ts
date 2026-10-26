import { expect, test } from '@playwright/test';

// Each entry: the gallery section and text that must be present before the screenshot.
const states: [name: string, ready?: string][] = [
  ['error-plain'],
  ['error-retry-detail', 'Details for support'],
  ['error-network', 'Could not reach the local service'],
  ['error-load'],
  ['error-friendly'],
  ['loading-lines'],
  ['loading-cards'],
  ['empty'],
  ['wait-normal', '0:23'],
  ['wait-slow', 'Taking longer than usual'],
  ['wait-canceling', 'Canceling…'],
  ['home-checking', 'Checking your starters…'],
  ['home-failed', 'Couldn’t finish checking your lineup'],
  ['home-alert', 'is inactive today'],
  ['home-clear', 'You’re set'],
  ['watchlist', 'Fictional Injured'],
  ['watchlist-empty', 'Add players'],
  ['matchup', 'chance you win'],
  ['dynasty', 'Fictional First Back'],
];

test.beforeEach(async ({ page }, info) => {
  // Appearance is the saved in-app choice, not the system setting.
  if (info.project.name === 'dark')
    await page.addInitScript(() => localStorage.setItem('sidekick.theme.v1', 'dark'));
  // A fixed clock keeps elapsed timers and dates identical between runs.
  await page.clock.install({ time: new Date('2026-10-25T15:00:00Z') });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'UI states' })).toBeVisible();
});

for (const [name, ready] of states)
  test(`state: ${name}`, async ({ page }) => {
    const section = page.locator(`[data-state="${name}"]`);
    if (ready) await expect(section).toContainText(ready);
    await expect(section).toHaveScreenshot(`${name}.png`);
  });

for (const [button, name] of [
  ['Discard changes', 'confirm-discard'],
  ['Danger confirmation', 'confirm-danger'],
  ['Plain confirmation', 'confirm-plain'],
] as const)
  test(`state: ${name}`, async ({ page }) => {
    await page.getByRole('button', { name: button, exact: true }).click();
    const dialog = page.locator('section.confirm-dialog');
    await expect(dialog).toBeVisible();
    // Cancel takes the first focus so Enter never confirms by accident.
    await expect(dialog.getByRole('button').first()).toBeFocused();
    await expect(dialog).toHaveScreenshot(`${name}.png`);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

test('queued confirmations each start on Cancel and a double-click answers only one', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Queue two confirmations', exact: true }).click();
  const dialog = page.locator('section.confirm-dialog');
  await expect(dialog).toContainText('The first queued question.');
  await dialog.getByRole('button', { name: 'Discard changes' }).dblclick();
  await expect(dialog).toContainText('The second queued question.');
  await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#confirm-results')).toHaveText('first:true second:false ');
});
