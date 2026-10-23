import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { apiWorkspace } from './api-fixture';
import { answerConfirm } from './confirm';

async function search(page: Page, query: string) {
  await page.getByRole('button', { name: 'Search the app' }).click();
  await page
    .getByRole('combobox', { name: 'Search settings, pages, leagues, and reports' })
    .fill(query);
}
function consoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('task navigation asks once before discarding settings edits and does not save them', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Voice', exact: true }).click();
    await page.getByLabel('Topics to avoid', { exact: true }).fill('Unsaved private topic');
    await search(page, 'stop sending emails');
    await page.getByRole('option', { name: /Stop automatic report delivery/ }).click();
    await answerConfirm(page, true, 'discard your unsaved edits');
    const preview = page.getByRole('dialog', { name: 'Stop automatic messages?' });
    await expect(preview).toBeVisible();
    expect(workspace.store.settingsSnapshot().excludedTopics).not.toBe('Unsaved private topic');
    await preview.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Voice', exact: true }).click();
    await expect(page.getByLabel('Topics to avoid', { exact: true })).not.toHaveValue(
      'Unsaved private topic',
    );
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});

test('sample mode needs no accounts, allows edits and sharing, and leaves real state untouched', async ({
  page,
  context,
}, info) => {
  const workspace = await apiWorkspace(false, false);
  const errors = consoleErrors(page);
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/'))
      mutations.push(request.url());
  });
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(workspace.url).origin,
    });
    await page.goto(workspace.url);
    await expect(page).toHaveTitle('Sunday Sidekick');
    await page.getByRole('button', { name: 'Try a sample league', exact: true }).click();
    const sample = page.getByRole('dialog', { name: 'Try a sample league' });
    await expect(sample.getByRole('radio', { name: /Matchup preview/ })).toBeVisible();
    await page.screenshot({ path: info.outputPath('sample-choices.png') });
    await sample.getByRole('radio', { name: /Matchup preview/ }).check();
    await sample.getByRole('button', { name: 'Open sample draft' }).click();
    await expect(sample).toContainText('the week’s closest matchup');
    await sample.getByRole('button', { name: 'Edit sample draft' }).click();
    await expect(sample.getByRole('button', { name: 'Copy report' })).toBeDisabled();
    await sample
      .getByLabel('Edit sample draft', { exact: true })
      .fill('A fictional sample edited by a commissioner.');
    await sample.getByRole('button', { name: 'Save sample draft' }).click();
    await sample.getByRole('button', { name: 'Copy report' }).click();
    await expect(sample.getByRole('status').filter({ hasText: 'Report copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      'A fictional sample edited',
    );
    const downloadPromise = page.waitForEvent('download');
    await sample.getByRole('button', { name: 'Download report' }).click();
    const download = await downloadPromise;
    expect(await readFile((await download.path())!, 'utf8')).toContain('A fictional sample edited');
    await page.screenshot({ path: info.outputPath('sample-review.png') });
    expect(workspace.store.snapshot().leagues).toHaveLength(0);
    expect(workspace.store.snapshot().reports).toHaveLength(0);
    expect(workspace.generations()).toBe(0);
    expect(workspace.sends).toHaveLength(0);
    expect(mutations).toEqual([]);
    await sample.getByRole('button', { name: 'Set up my league' }).click();
    await expect(page.getByRole('dialog', { name: 'Connect your league' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('help answers are searchable, bookmarkable, and lead directly to the actual setting', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = consoleErrors(page);
  try {
    await page.goto(workspace.url + '/#/help');
    await expect(page.getByRole('heading', { name: 'Help & FAQ' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('help-home.png') });
    await search(page, 'why did my report not send?');
    await page.getByRole('option', { name: /Find out why a report did not send/ }).click();
    await expect(page.getByRole('heading', { name: 'Help & FAQ' })).toBeVisible();
    const answer = page.locator('#help-delivery');
    await expect(answer).toHaveAttribute('open', '');
    await expect(answer).toContainText('provider may already have sent it');
    await expect(page).toHaveURL(/#\/help\?.*answer=delivery/);
    await page.reload();
    await expect(answer).toHaveAttribute('open', '');
    await page.screenshot({ path: info.outputPath('help-answer.png') });
    await answer.getByRole('button', { name: 'Check report attempts' }).click();
    await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
    await search(page, 'Does my ChatGPT subscription include report writing?');
    await page
      .getByRole('option', { name: /Does my ChatGPT subscription include report writing/ })
      .click();
    await page
      .locator('#help-ai-billing')
      .getByRole('button', { name: 'Check AI connection' })
      .click();
    await expect(page.locator('.search-setting-highlight')).toBeVisible();
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await workspace.close();
  }
});

test('task search scopes email automation and requires confirmation before any settings change', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = consoleErrors(page);
  try {
    await workspace.store.update((state) => {
      state.settings.actions.find((item) => item.kind === 'power-rankings')!.mode = 'automatic';
      const other = state.settings.actions.find((item) => item.kind === 'matchup-preview')!;
      other.channel = 'sms';
      other.mode = 'automatic';
      state.settings.chatRepliesEnabled = true;
      state.settings.chatRepliesAutoSend = true;
    });
    await page.goto(workspace.url);
    await search(page, 'stop sending emails');
    await page.getByRole('option', { name: /Stop automatic report delivery/ }).click();
    const preview = page.getByRole('dialog', { name: 'Stop automatic messages?' });
    await expect(preview).toContainText('original@example.test');
    await expect(preview).toContainText(
      'Chat replies and other channels keep their existing policy',
    );
    expect(
      workspace.store.settingsSnapshot().actions.find((item) => item.kind === 'power-rankings')!
        .mode,
    ).toBe('automatic');
    await page.screenshot({ path: info.outputPath('task-preview.png') });
    await preview.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(
      workspace.store.settingsSnapshot().actions.find((item) => item.kind === 'power-rankings')!
        .mode,
    ).toBe('automatic');
    await search(page, 'stop sending emails');
    await page.getByRole('option', { name: /Stop automatic report delivery/ }).click();
    await preview.getByRole('button', { name: 'Confirm review before send' }).click();
    await expect(preview).toBeHidden();
    const saved = workspace.store.settingsSnapshot();
    expect(saved.actions.find((item) => item.kind === 'power-rankings')!.mode).toBe('draft');
    expect(saved.actions.find((item) => item.kind === 'matchup-preview')!.mode).toBe('automatic');
    expect(saved.chatRepliesAutoSend).toBe(true);
    await search(page, 'stop automatic messages');
    await page.getByRole('option', { name: /Stop automatic report delivery/ }).click();
    await preview.getByRole('button', { name: 'Confirm review before send' }).click();
    await expect(preview).toBeHidden();
    expect(workspace.store.settingsSnapshot().chatRepliesAutoSend).toBe(false);
    expect(workspace.store.settingsSnapshot().actions.every((item) => item.mode === 'draft')).toBe(
      true,
    );
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('search prefills an inline schedule, preserves unsaved edits, and saves only the schedules section', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = consoleErrors(page);
  try {
    await page.goto(workspace.url);
    const before = workspace.store.settingsSnapshot();
    await search(page, 'email rankings every Thursday at 10:30 AM');
    await page.getByRole('option', { name: /Set up a report schedule/ }).click();
    const editor = page.getByRole('dialog', { name: 'Schedule power rankings' });
    await expect(editor.getByRole('combobox', { name: 'DAY', exact: true })).toHaveValue('4');
    await expect(editor.getByRole('textbox', { name: 'TIME', exact: true })).toHaveValue('10:30');
    await expect(
      editor.getByRole('combobox', { name: 'Weekly power rankings delivery policy' }),
    ).toHaveValue('draft');
    expect(workspace.store.settingsSnapshot()).toEqual(before);
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await answerConfirm(page, false);
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Save schedule', exact: true }).click();
    await expect(editor).toBeHidden();
    const action = workspace.store
      .settingsSnapshot()
      .actions.find((item) => item.kind === 'power-rankings')!;
    expect(action.schedule.weekday).toBe(4);
    expect(action.schedule.time).toBe('10:30');
    expect(action.mode).toBe('draft');
    expect(workspace.store.settingsSnapshot().writingStyle).toBe(before.writingStyle);
    const card = page
      .locator('.schedule-card')
      .filter({ has: page.getByRole('heading', { name: 'Power rankings', exact: true }) });
    await expect(card).toContainText('Next planned run:');
    await expect(card).toContainText('original@example.test');
    await card.getByRole('button', { name: 'Edit power rankings schedule' }).click();
    await editor.getByRole('textbox', { name: 'TIME', exact: true }).fill('11:00');
    await editor.getByRole('button', { name: 'Save schedule' }).scrollIntoViewIfNeeded();
    await expect(editor.getByRole('button', { name: 'Save schedule' })).toBeInViewport();
    await page.screenshot({ path: info.outputPath('schedule-editor.png') });
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await answerConfirm(page, true);
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('setup resumes a validated league choice after reload without storing credentials or arbitrary URL data', async ({
  page,
}) => {
  const workspace = await apiWorkspace(false, false);
  try {
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Guided setup', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Connect a league' }).click();
    await page
      .getByRole('textbox', { name: 'LEAGUE ID OR URL' })
      .fill('https://sleeper.com/leagues/123456?secret=private-value');
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem('sidekick.setupProgress')!).leagueInput,
        ),
      )
      .toBe('123456');
    await page.reload();
    await expect(
      page.getByRole('status').filter({ hasText: 'Continue setting up your league' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Resume league connection' }).click();
    await expect(page.getByRole('textbox', { name: 'LEAGUE ID OR URL' })).toHaveValue('123456');
    expect(await page.evaluate(() => localStorage.getItem('sidekick.setupProgress'))).not.toContain(
      'private-value',
    );
    expect(workspace.generations()).toBe(0);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});

test('saved reports share only reviewed text, recover from a denied clipboard, and remain drafts', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = consoleErrors(page);
  try {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new DOMException('Controlled denied permission', 'NotAllowedError');
          },
        },
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: ShareData) => {
          (window as unknown as { sharedText: string }).sharedText = data.text ?? '';
        },
      });
    });
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Create a report', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Create a report' })
      .getByRole('button', { name: 'Create draft', exact: true })
      .click();
    const review = page.getByRole('dialog', { name: 'Review report' });
    await expect(review).toContainText('controlled provider response');
    await review.getByRole('button', { name: 'Edit draft', exact: true }).click();
    await expect(review.getByRole('button', { name: 'Copy report' })).toBeDisabled();
    await review.getByRole('button', { name: 'Cancel editing' }).click();
    await review.getByRole('button', { name: 'Copy report' }).click();
    await expect(review.getByLabel('Report text to copy', { exact: true })).toHaveValue(
      /controlled provider response/,
    );
    await review.getByRole('button', { name: 'Share report', exact: true }).click();
    expect(
      await page.evaluate(() => (window as unknown as { sharedText: string }).sharedText),
    ).toContain('controlled provider response');
    await page.screenshot({ path: info.outputPath('report-sharing.png') });
    expect(workspace.sends).toHaveLength(0);
    expect(workspace.store.snapshot().reports[0]!.status).toBe('draft');
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('delivery changes and schedule conflicts cannot silently overwrite a preview', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await page.goto(workspace.url);
    await search(page, 'turn automatic emails on');
    await page.getByRole('option', { name: /Review enabling automatic report delivery/ }).click();
    const preview = page.getByRole('dialog', { name: 'Allow automatic report delivery?' });
    await expect(preview).toContainText('original@example.test');
    const changed = await page.request.patch(workspace.url + '/api/settings/delivery', {
      headers: {
        'If-Match': String(workspace.store.settingsSnapshot().sectionRevisions?.delivery ?? 0),
      },
      data: { emailRecipient: 'new@example.test' },
    });
    expect(changed.ok()).toBe(true);
    await preview.getByRole('button', { name: 'Confirm automatic delivery' }).click();
    await expect(preview.getByRole('alert')).toContainText('Delivery choices need attention');
    expect(
      workspace.store.settingsSnapshot().actions.find((action) => action.kind === 'power-rankings')!
        .mode,
    ).toBe('draft');
    await preview.getByRole('button', { name: 'Cancel', exact: true }).click();
    await search(page, 'rankings every Thursday at 10 AM');
    await page.getByRole('option', { name: /Set up a report schedule/ }).click();
    const editor = page.getByRole('dialog', { name: 'Schedule power rankings' });
    await page.route('**/api/settings/schedules', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Controlled newer schedule revision',
          code: 'revision_conflict',
        }),
      }),
    );
    await editor.getByRole('button', { name: 'Save schedule' }).click();
    await expect(editor.getByRole('alert')).toContainText('Your schedule was not saved');
    await expect(editor.getByRole('textbox', { name: 'TIME', exact: true })).toHaveValue('10:00');
    expect(
      workspace.store.settingsSnapshot().actions.find((action) => action.kind === 'power-rankings')!
        .schedule.weekday,
    ).toBe(2);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});
