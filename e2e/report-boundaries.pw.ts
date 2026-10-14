import { test, expect, type Page } from '@playwright/test';
import type { SavedReport } from '@sidekick/core';
import { apiWorkspace } from './api-fixture';

function errors(page: Page) {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  return failures;
}
function report(id: string, values: Partial<SavedReport> = {}): SavedReport {
  return {
    id,
    leagueId: 'browser-league',
    kind: 'power-rankings',
    createdAt: new Date().toISOString(),
    title: `Fictional report ${id}`,
    body: `Fictional body for ${id}.`,
    citations: [],
    status: 'draft',
    revision: 0,
    ...values,
  };
}

test('a delayed draft save cannot replace another report or display feedback in its review', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const failures = errors(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = () => {};
  const saveStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finished = () => {};
  const saveFinished = new Promise<void>((resolve) => {
    finished = resolve;
  });
  try {
    await workspace.store.update((state) => {
      state.reports = [report('A'), report('B')];
    });
    await page.goto(workspace.url + '/#/reports?report=A');
    const review = page.getByRole('dialog', { name: 'Review report' });
    await review.getByRole('button', { name: 'Edit draft', exact: true }).click();
    await review.getByLabel('Report body', { exact: true }).fill('Saved fictional changes to A.');
    await page.route('**/api/reports/A', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const response = await route.fetch();
      started();
      await gate;
      await route.fulfill({ response }).catch(() => {});
      finished();
    });
    await review.getByRole('button', { name: 'Save draft', exact: true }).click();
    await saveStarted;
    await expect(review.getByLabel('Report body', { exact: true })).toBeDisabled();
    await expect(review.getByLabel('Report title', { exact: true })).toBeDisabled();
    await expect(review.getByRole('button', { name: 'Cancel editing' })).toBeDisabled();
    await expect(review).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(review.getByRole('button', { name: 'Close report review' })).toBeFocused();
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('continue in the background');
      await dialog.accept();
    });
    await review.getByRole('button', { name: 'Close report review' }).click();
    await expect(review).toBeHidden();
    await page
      .locator('.report-card')
      .filter({ has: page.getByRole('heading', { name: 'Fictional report B', exact: true }) })
      .getByRole('button', { name: 'Review report' })
      .click();
    await expect(
      review.getByRole('heading', { name: 'Fictional report B', exact: true }),
    ).toBeVisible();
    await expect(review.getByRole('button', { name: 'Send saved report' })).toBeEnabled();
    release();
    await saveFinished;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect
      .poll(() => workspace.store.reportById('A')?.body)
      .toBe('Saved fictional changes to A.');
    await expect(
      review.getByRole('heading', { name: 'Fictional report B', exact: true }),
    ).toBeVisible();
    await expect(review.locator('.report-body')).toHaveText('Fictional body for B.');
    await expect(review.getByRole('status').filter({ hasText: 'Draft saved' })).toHaveCount(0);
    await expect(review.getByRole('button', { name: 'Send saved report' })).toBeEnabled();
    await page.screenshot({ path: info.outputPath('delayed-save.png') });
    expect(workspace.sends).toHaveLength(0);
    expect(failures).toEqual([]);
  } finally {
    release();
    await workspace.close();
  }
});

test('message limits never split an emoji and exact-fit messages need no duplicate preview', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const failures = errors(page);
  try {
    for (const [id, channel, destination, limit] of [
      ['sms', 'sms', '+15555550123', 1500],
      ['group', 'sms', 'CH' + '1'.repeat(32), 1600],
      ['imessage', 'imessage', 'fictional-chat', 10000],
    ] as const) {
      for (const fits of [false, true]) {
        const length = limit - (fits ? 2 : 1);
        const sentence = 'Fictional recap. ';
        const prefix = sentence.repeat(Math.floor(length / sentence.length)).padEnd(length, 'F');
        const saved = report(`${id}-${fits}`, {
          kind: 'chat-reply',
          replyChannel: channel,
          replyDestination: destination,
          body: prefix + '🏈' + (fits ? '' : ' More fictional text.'),
        });
        await workspace.store.update((state) => {
          state.reports.push(saved);
        });
        await page.goto(`${workspace.url}/#/reports?report=${saved.id}`);
        const review = page.getByRole('dialog', { name: 'Review report' });
        await expect(review.getByRole('heading', { name: saved.title, exact: true })).toBeVisible();
        const preview = review.getByRole('region', { name: 'Send preview' });
        if (fits) {
          await expect(preview.locator('.report-body')).toHaveCount(0);
          await expect(preview).toContainText('full saved report shown above');
        } else {
          await expect(preview.locator('.report-body')).toHaveText(prefix);
          await expect(preview).not.toContainText('�');
          await expect(
            preview.getByRole('status').filter({ hasText: 'This channel sends only' }),
          ).toBeVisible();
          if (id === 'sms') {
            await preview
              .getByRole('status')
              .filter({ hasText: 'This channel sends only' })
              .scrollIntoViewIfNeeded();
            await page.screenshot({ path: info.outputPath('emoji-limit.png') });
          }
        }
      }
    }
    expect(workspace.sends).toHaveLength(0);
    expect(failures).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('keyboard review skips collapsed metadata and keeps an edited field clear of the sticky header', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const failures = errors(page);
  try {
    await workspace.store.update((state) => {
      state.reports.push(report('keyboard', { body: 'Fictional weekly recap.\n'.repeat(70) }));
    });
    await page.goto(workspace.url + '/#/reports?report=keyboard');
    await expect(page).toHaveTitle('Sunday Sidekick');
    const review = page.getByRole('dialog', { name: 'Review report' });
    const close = review.getByRole('button', { name: 'Close report review' });
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(review.locator('.report-details summary')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(review.locator('.report-details dl')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(review.locator('.report-details dl')).toBeHidden();
    await page.keyboard.press('Tab');
    await expect(review.getByRole('button', { name: 'Edit draft', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await review.getByLabel('Report title', { exact: true }).focus();
    const header = review.locator('.report-review-header');
    const input = review.getByLabel('Report title', { exact: true });
    await expect(input).toBeFocused();
    const inputBox = await input.boundingBox();
    const headerBox = await header.boundingBox();
    expect(inputBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
    await input.fill('Unsaved fictional title');
    await page.screenshot({ path: info.outputPath('keyboard-editor.png') });
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('Unsaved fictional title');
    await expect(review).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await close.click();
    await expect(review).toBeHidden();
    expect(workspace.sends).toHaveLength(0);
    expect(failures).toEqual([]);
  } finally {
    await workspace.close();
  }
});
