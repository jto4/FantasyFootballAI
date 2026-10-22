import { test, expect, type Page } from '@playwright/test';
import { apiWorkspace } from './api-fixture';

function runtimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('the search shortcut cannot cover a dialog with unsaved work', async ({ page }, info) => {
  const workspace = await apiWorkspace(false, false);
  const errors = runtimeErrors(page);
  try {
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Try a sample league', exact: true }).click();
    const sample = page.getByRole('dialog', { name: 'Try a sample league' });
    await sample.getByRole('button', { name: 'Open sample draft' }).click();
    await sample.getByRole('button', { name: 'Edit sample draft' }).click();
    const input = sample.getByLabel('Edit sample draft', { exact: true });
    await input.fill('Unsaved fictional work stays in this dialog.');
    await page.keyboard.press('Control+k');
    await page.keyboard.press('Meta+k');
    await page.screenshot({ path: info.outputPath('dialog-shortcut.png') });
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Unsaved fictional work stays in this dialog.');
    await sample.getByRole('button', { name: 'Close sample league' }).click();
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'What are you looking for?' })).toBeVisible();
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('long report and league names fit a narrow review without horizontal scrolling', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    const title = 'W'.repeat(120);
    await workspace.store.update((state) => {
      state.leagues[0]!.displayName = 'FictionalLeague'.repeat(6);
      state.reports.push({
        id: 'long-report',
        leagueId: 'browser-league',
        kind: 'power-rankings',
        createdAt: new Date().toISOString(),
        title,
        body: 'Fictional review text.\n'.repeat(70),
        citations: [],
        status: 'draft',
        revision: 0,
      });
    });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(workspace.url + '/#/reports?report=long-report');
    const review = page.getByRole('dialog', { name: 'Review report' });
    await expect(review.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('long-report.png') });
    expect(await review.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await review.getByRole('button', { name: 'Copy report' }).scrollIntoViewIfNeeded();
    await expect(review.getByRole('button', { name: 'Copy report' })).toBeInViewport();
    await review.getByRole('button', { name: 'Close report review' }).click();
    await expect(review).toBeHidden();
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('a delayed refresh of the previous report cannot replace a newly opened report', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = () => {};
  const refreshStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let fulfilled = () => {};
  const refreshFulfilled = new Promise<void>((resolve) => {
    fulfilled = resolve;
  });
  try {
    await workspace.store.update((state) => {
      state.reports = ['A', 'B'].map((id) => ({
        id: `report-${id}`,
        leagueId: 'browser-league',
        kind: 'power-rankings',
        createdAt: new Date().toISOString(),
        title: `Fictional report ${id}`,
        body: `Body for fictional report ${id}`,
        citations: [],
        status: 'draft',
        revision: 0,
      }));
    });
    await page.goto(workspace.url + '/#/reports?report=report-A');
    const review = page.getByRole('dialog', { name: 'Review report' });
    await expect(
      review.getByRole('heading', { name: 'Fictional report A', exact: true }),
    ).toBeVisible();
    await page.route('**/api/reports/report-A', async (route) => {
      const response = await route.fetch();
      started();
      await gate;
      await route.fulfill({ response }).catch(() => {});
      fulfilled();
    });
    await workspace.store.update((state) => {
      state.reports[0]!.revision = 1;
      state.reports[0]!.body = 'Delayed updated body for A';
    });
    await refreshStarted;
    await review.getByRole('button', { name: 'Close report review' }).click();
    await expect(review).toBeHidden();
    await page
      .locator('.report-card, .report-table tbody tr')
      .filter({ hasText: 'Fictional report B' })
      .getByRole('button', { name: 'Review report', exact: true })
      .click();
    await expect(
      review.getByRole('heading', { name: 'Fictional report B', exact: true }),
    ).toBeVisible();
    release();
    await refreshFulfilled;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({ path: info.outputPath('report-refresh.png') });
    await expect(
      review.getByRole('heading', { name: 'Fictional report B', exact: true }),
    ).toBeVisible();
    await expect(review.locator('.report-body').first()).toContainText(
      'Body for fictional report B',
    );
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    release();
    await workspace.close();
  }
});

test('scrolling inside a review does not move the page behind it and scrolling returns after close', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    await workspace.store.update((state) => {
      state.reports = Array.from({ length: 20 }, (_, index) => ({
        id: `scroll-${index}`,
        leagueId: 'browser-league',
        kind: 'power-rankings',
        createdAt: new Date().toISOString(),
        title: `Fictional scroll report ${index}`,
        body: 'Long fictional report text.\n'.repeat(150),
        citations: [],
        status: 'draft',
        revision: 0,
      }));
    });
    await page.goto(workspace.url + '/#/reports?report=scroll-0');
    const review = page.getByRole('dialog', { name: 'Review report' });
    await expect(review).toBeVisible();
    const before = await page.evaluate(() => scrollY);
    await review.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await review.hover();
    await page.mouse.wheel(0, 600);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({ path: info.outputPath('review-scroll.png') });
    expect(await page.evaluate(() => scrollY)).toBe(before);
    await page.keyboard.press('Escape');
    await expect(review).toBeHidden();
    await page.mouse.move(250, 400);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
    expect(errors).toEqual([]);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});
