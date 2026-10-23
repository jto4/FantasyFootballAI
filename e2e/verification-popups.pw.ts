import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { answerConfirm } from './confirm';

for (const verification of [false, true])
  test(`${verification ? 'test' : 'normal'} profile Stop respects its confirmation policy`, async ({
    page,
  }, info) => {
    const workspace = await apiWorkspace();
    const prompts: string[] = [];
    let shutdowns = 0;
    try {
      await page.addInitScript((enabled) => {
        window.sidekickDesktop = {
          isVerificationMode: () => enabled,
        } as typeof window.sidekickDesktop;
      }, verification);
      await page.route('**/api/shutdown', (route) => {
        shutdowns++;
        return route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'stopping' }),
        });
      });
      // Native dialogs must never appear; the app asks in its own dialog.
      page.on('dialog', (dialog) => {
        prompts.push(dialog.message());
        void dialog.dismiss();
      });
      await page.goto(workspace.url);
      await expect(page.getByRole('heading', { name: 'Sunday’s league desk' })).toBeVisible();
      if (info.project.name === 'mobile') {
        await expect(page.getByTitle('Local service running', { exact: true })).toHaveText(
          verification ? 'Test profile' : 'Running',
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        expect(shutdowns).toBe(0);
        return;
      }
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Voice', exact: true }).click();
      await page
        .getByLabel('Topics to avoid', { exact: true })
        .fill('Unsaved fictional test input');
      expect(
        await page.evaluate(() => {
          const event = new Event('beforeunload', { cancelable: true });
          window.dispatchEvent(event);
          return event.defaultPrevented;
        }),
      ).toBe(!verification);
      const stop = page.getByRole('button', { name: 'Stop Sunday Sidekick', exact: true });
      await expect(stop).toBeEnabled();
      await stop.click();
      if (verification) {
        await expect(page.getByText('Local service stopped', { exact: true })).toBeVisible();
        expect(prompts).toEqual([]);
        expect(shutdowns).toBe(1);
      } else {
        await answerConfirm(page, false, 'Stop Sunday Sidekick?');
        expect(prompts).toEqual([]);
        expect(shutdowns).toBe(0);
        await expect(stop).toBeEnabled();
      }
      expect(workspace.sends).toHaveLength(0);
    } finally {
      await workspace.close();
    }
  });
