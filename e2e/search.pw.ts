import { expect, test, type Page } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { settingTargets } from '../apps/dashboard/src/ui/search-catalog';

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
async function search(page: Page, query: string) {
  await page.getByRole('button', { name: 'Search the app', exact: true }).click();
  const input = page.getByRole('combobox', {
    name: 'Search settings, pages, leagues, and reports',
  });
  await expect(input).toBeFocused();
  await input.fill(query);
  return input;
}

test('every browser setting result opens a real highlighted destination', async ({ page }) => {
  test.setTimeout(90000);
  const workspace = await apiWorkspace();
  const errors = captureErrors(page);
  const before = workspace.store.settingsSnapshot();
  try {
    await page.goto(workspace.url);
    await expect(page.getByRole('heading', { name: 'Sunday’s league desk' })).toBeVisible();
    for (const target of settingTargets.filter((item) => !item.desktopOnly)) {
      await search(page, target.title);
      await page
        .getByRole('listbox', { name: 'Search results' })
        .getByRole('option')
        .filter({ has: page.getByText(target.title, { exact: true }) })
        .first()
        .click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`setting=${target.id}(?:&|$)`));
      const control = page.locator(`[data-search-target="${target.id}"]`);
      await expect(control).toBeVisible();
      await expect(page.locator('.search-setting-highlight')).toHaveCount(1);
    }
    expect(workspace.generations()).toBe(0);
    expect(workspace.sends).toHaveLength(0);
    expect(workspace.store.settingsSnapshot()).toEqual(before);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('plain phrases, typos, keyboard navigation, and bookmarks lead to the exact control', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = captureErrors(page);
  try {
    await page.goto(workspace.url);
    await expect(page).toHaveTitle('Sunday Sidekick');
    await expect(page.getByRole('heading', { name: 'Sunday’s league desk' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('search-entry.png') });
    await search(page, 'How do I stop swearing?');
    await expect(
      page.getByRole('listbox', { name: 'Search results' }).getByRole('option').first(),
    ).toContainText('Allow profanity');
    await expect(page.getByRole('dialog')).not.toContainText('Checking saved reports');
    await page.screenshot({ path: info.outputPath('smart-search.png') });
    await page
      .getByRole('combobox', { name: 'Search settings, pages, leagues, and reports' })
      .press('Enter');
    const profanity = page.getByLabel('Allow profanity', { exact: true });
    await expect(profanity).toBeFocused();
    await expect(profanity).not.toBeChecked();
    await page.reload();
    await expect(profanity).toBeFocused();
    await expect(profanity).toBeInViewport();
    await expect(page.locator('.search-setting-highlight')).toBeVisible();
    await page.screenshot({ path: info.outputPath('setting-destination.png') });
    await page.getByRole('button', { name: 'AI', exact: true }).click();
    await expect(page).not.toHaveURL(/setting=/);
    await expect(page.getByRole('heading', { name: 'AI connection', exact: true })).toBeVisible();
    await search(page, 'automatic backpus');
    await page
      .getByRole('combobox', { name: 'Search settings, pages, leagues, and reports' })
      .press('Enter');
    await expect(page.getByRole('heading', { name: 'Scheduled encrypted backups' })).toBeFocused();
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toBeVisible();
    const input = page.getByRole('combobox', {
      name: 'Search settings, pages, leagues, and reports',
    });
    await input.fill('email');
    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', 'workspace-search-result-1');
    await input.press('ArrowUp');
    await expect(input).toHaveAttribute('aria-activedescendant', 'workspace-search-result-0');
    await page
      .getByRole('combobox', { name: 'Search settings, pages, leagues, and reports' })
      .fill('zxqv missing feature');
    await expect(page.getByText('No matches yet.', { exact: false })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('search preserves edits when navigation is rejected and actually discards them when accepted', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await page.goto(`${workspace.url}/#/settings?setting=writing-style`);
    await page
      .getByRole('textbox', { name: 'Writing style', exact: true })
      .fill('Unsaved private wording');
    await search(page, 'email address');
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page
      .getByRole('listbox', { name: 'Search results' })
      .getByRole('option')
      .filter({ has: page.getByText('Email recipient', { exact: true }) })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Writing style', exact: true })).toHaveValue(
      'Unsaved private wording',
    );
    await search(page, 'email address');
    page.once('dialog', (dialog) => void dialog.accept());
    await page
      .getByRole('listbox', { name: 'Search results' })
      .getByRole('option')
      .filter({ has: page.getByText('Email recipient', { exact: true }) })
      .click();
    await expect(page.getByLabel('EMAIL RECIPIENT', { exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Voice', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Writing style', exact: true })).not.toHaveValue(
      'Unsaved private wording',
    );
    expect(workspace.store.settingsSnapshot().writingStyle).not.toBe('Unsaved private wording');
  } finally {
    await workspace.close();
  }
});

test('search finds a connected league and a report beyond the recent fifty without exposing its body', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await workspace.store.update((state) => {
      state.reports = Array.from({ length: 65 }, (_, i) => ({
        id: `search-report-${i}`,
        leagueId: 'browser-league',
        kind: 'power-rankings',
        title: i === 0 ? 'Vintage championship recap' : `Weekly rankings ${i}`,
        body: 'Hidden report body until opened',
        status: 'draft',
        citations: [],
        createdAt: new Date(1700000000000 + i).toISOString(),
      }));
    });
    await page.goto(workspace.url);
    await search(page, 'Real API League');
    await page
      .getByRole('listbox', { name: 'Search results' })
      .getByRole('option')
      .filter({ has: page.getByText('Real API League', { exact: true }) })
      .click();
    await expect(page).toHaveURL(/league=browser-league/);
    await search(page, 'Find my Vintage championship report');
    await expect(
      page
        .getByRole('listbox', { name: 'Search results' })
        .getByRole('option')
        .filter({ hasText: 'Vintage championship recap' }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).not.toContainText('Hidden report body');
    await page
      .getByRole('listbox', { name: 'Search results' })
      .getByRole('option')
      .filter({ hasText: 'Vintage championship recap' })
      .click();
    await expect(page.getByRole('dialog', { name: 'Review report' })).toContainText(
      'Hidden report body until opened',
    );
    expect(workspace.generations()).toBe(0);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});
