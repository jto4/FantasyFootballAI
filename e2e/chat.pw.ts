import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { seedAdvice } from './advice-fixture';

test('Ask answers from a league lookup, saves the chat, and the panel opens with ⌘J', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  try {
    await seedAdvice(workspace.store);
    await page.goto(`${workspace.url}/#/ask?league=browser-league`);
    await expect(page.getByRole('heading', { name: 'Ask Sidekick', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Who should I start?');
    await page.keyboard.press('Enter');
    const log = page.getByRole('log', { name: 'Chat' });
    await expect(log.getByText('Start your studs.')).toBeVisible();
    await expect(log.getByText(/Checked: Reading .* standings/)).toBeVisible();
    if (info.project.name !== 'mobile')
      await expect(
        page.getByRole('navigation', { name: 'Saved chats' }).getByText('Who should I start?'),
      ).toBeVisible();

    await page.goto(`${workspace.url}/#/desk?league=browser-league`);
    await page.locator('body').press('ControlOrMeta+j');
    const panel = page.getByRole('complementary').getByRole('region', { name: 'Ask Sidekick' });
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Chat history', exact: true }).click();
    await panel.getByRole('button', { name: /^Who should I start\?/ }).click();
    await expect(panel.getByText('Start your studs.')).toBeVisible();
    await panel.getByRole('button', { name: 'Close chat', exact: true }).click();
    await expect(panel).toBeHidden();
  } finally {
    await workspace.close();
  }
});
