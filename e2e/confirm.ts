import { expect, type Page } from '@playwright/test';

/** Answers the app's in-app confirmation (ConfirmDialog), which replaced window.confirm. */
export async function answerConfirm(page: Page, accept: boolean, text?: string | RegExp) {
  const dialog = page.locator('section.confirm-dialog');
  await expect(dialog).toBeVisible();
  if (text) await expect(dialog).toContainText(text);
  // Cancel is first (and focused); confirm is second.
  await dialog
    .getByRole('button')
    .nth(accept ? 1 : 0)
    .click();
  await expect(dialog).toBeHidden();
}
