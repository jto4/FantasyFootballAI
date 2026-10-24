import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';

test('personalize saves preferences, hides Home cards and applies display choices', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Desktop-first settings flow.');
  const workspace = await apiWorkspace();
  try {
    await page.goto(`${workspace.url}/#/settings`);
    await page.getByRole('button', { name: 'Personalize', exact: true }).click();
    const display = page.getByRole('group', { name: 'Appearance and display', exact: true });
    await display.getByLabel('Text size').selectOption('large');
    await display.getByLabel('Odds format').selectOption('decimal');
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');

    await page.getByRole('radio', { name: /Maximize win chance/ }).check();
    await page.getByRole('radio', { name: /Straight/ }).check();
    await page.getByRole('checkbox', { name: 'Saved decisions', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Move Watchlist up', exact: true }).click();
    await page
      .getByRole('checkbox', { name: 'Game-day summary before your first kickoff' })
      .check();
    await page.getByLabel(/Minimum edge before a prop lean/).fill('3');
    await page.getByRole('checkbox', { name: 'DraftKings', exact: true }).check();
    // Add a nudge and type a negative value freely.
    const nudges = page.getByRole('group', { name: 'Add a player to player nudges choices' });
    // The picker adds the player and clears itself, so the box never stays checked.
    await nudges.getByRole('checkbox').first().click();
    const nudge = page.getByRole('textbox', { name: /^Nudge for .* in percent/ });
    await nudge.fill('-');
    await nudge.fill('-20');
    await nudge.press('Enter');
    await expect(nudge).toHaveValue('-20');
    await page.getByRole('button', { name: 'Save Personalize', exact: true }).click();
    await expect(page.locator('.settings-save-bar')).toContainText('Saved');

    const preferences = workspace.store.settingsSnapshot().preferences!;
    expect(preferences.lineupStrategy).toBe('win-chance');
    expect(preferences.playerNudges?.[0]?.percent).toBe(-20);
    expect(preferences.ai?.tone).toBe('straight');
    expect(preferences.notifications?.gameDaySummary).toBe(true);
    expect(preferences.props).toMatchObject({ minEdgePoints: 3, sportsbooks: ['DraftKings'] });
    expect(preferences.homeCards?.find((card) => card.id === 'decisions')?.visible).toBe(false);

    // Display choices are per device and survive a reload; Home follows the saved layout.
    await page.goto(`${workspace.url}/#/desk`);
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
    await expect(page.getByRole('heading', { name: 'Saved decisions to revisit' })).toHaveCount(0);
  } finally {
    await workspace.close();
  }
});
