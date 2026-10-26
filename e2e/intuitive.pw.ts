import { test, expect, type Page } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { answerConfirm } from './confirm';

function errors(page: Page) {
  const failures: string[] = [];
  page.on('pageerror', (failure) => failures.push(failure.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  return failures;
}
async function guidedConnection(page: Page) {
  await page.getByRole('button', { name: 'Guided setup' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Connect a league' }).click();
}

test('a beginner connects a league and AI, chooses a report, reviews it, and explicitly confirms sending', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace(false, false);
  const failures = errors(page);
  try {
    await page.goto(workspace.url);
    await expect(page).toHaveTitle('Sunday Sidekick');
    await expect(page.getByRole('heading', { name: 'Connect your fantasy league' })).toBeVisible();
    await expect(page.locator('.nav-list > button')).toHaveText([
      'Home',
      'Advice',
      'Ask',
      'Reports',
      'Live',
      'Props',
      'Schedule',
      'Settings',
    ]);
    await page.screenshot({ path: info.outputPath('beginner-home.png') });
    await guidedConnection(page);
    await page
      .getByRole('textbox', { name: 'LEAGUE ID OR URL' })
      .fill('https://fantasy.espn.com/football/league?leagueId=7654&seasonId=2026');
    await expect(page.getByRole('combobox', { name: 'Fantasy platform' })).toHaveValue('espn');
    await expect(page.getByRole('spinbutton', { name: 'ESPN SEASON' })).toHaveValue('2026');
    await page.getByText('Where do I find my league link?', { exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('copy the League home address');
    await page
      .getByRole('textbox', { name: 'LEAGUE ID OR URL' })
      .fill('https://sleeper.com/leagues/123456');
    await expect(page.getByRole('combobox', { name: 'Fantasy platform' })).toHaveValue('sleeper');
    await page.getByRole('dialog').getByRole('button', { name: 'Connect league' }).click();
    await page
      .getByRole('dialog')
      .getByRole('combobox', { name: 'Your team', exact: true })
      .selectOption('1');
    const ai = page.getByRole('dialog', { name: 'Connect your AI writer' });
    await expect(ai.getByRole('button', { name: 'Connect and test' })).toBeDisabled();
    await expect(ai).toContainText('API billing enabled');
    await page.screenshot({ path: info.outputPath('guided-ai.png') });
    await ai.getByLabel('OpenAI API key', { exact: true }).fill('fake-beginner-key');
    await ai.getByRole('button', { name: 'Connect and test' }).click();
    await expect(page.getByRole('dialog')).toContainText('Your league and AI connection are ready');
    expect(workspace.credentialWrites).toEqual([
      { provider: 'openai', value: 'fake-beginner-key' },
    ]);
    expect(JSON.stringify(workspace.store.snapshot())).not.toContain('fake-beginner-key');
    expect(workspace.generations()).toBe(0);
    await page.getByRole('dialog').getByRole('button', { name: 'Create first report' }).click();
    const chooser = page.getByRole('dialog', { name: 'Create a report' });
    await expect(chooser).toContainText('Real API League');
    await chooser.getByRole('radio', { name: /Matchup preview/ }).check();
    await chooser.getByRole('button', { name: 'Create draft', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review report' });
    await expect(review).toContainText('controlled provider response');
    expect(workspace.store.snapshot().reports[0]!.kind).toBe('matchup-preview');
    expect(workspace.sends).toHaveLength(0);
    // This type starts with a dashboard-only destination; explain it and offer delivery setup.
    await expect(review).toContainText('Choose a delivery channel and recipient');
    await expect(review.getByRole('button', { name: 'Send saved report' })).toBeDisabled();
    await review.getByRole('button', { name: 'Close report review' }).click();
    await page
      .getByRole('navigation', { name: 'Reports workspace' })
      .getByRole('button', { name: 'Create', exact: true })
      .click();
    await page.getByRole('button', { name: 'Create power rankings', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Create a report' })
      .getByRole('button', { name: 'Create draft', exact: true })
      .click();
    await expect(review).toContainText('original@example.test');
    await review.getByRole('button', { name: 'Send saved report' }).click();
    await expect(review.getByRole('group', { name: 'Confirm report delivery' })).toBeVisible();
    expect(workspace.sends).toHaveLength(0);
    await page.screenshot({ path: info.outputPath('send-confirmation.png') });
    await review.getByRole('button', { name: 'Back to review' }).click();
    expect(workspace.sends).toHaveLength(0);
    await review.getByRole('button', { name: 'Send saved report' }).click();
    await review.getByRole('button', { name: 'Send email to original@example.test' }).click();
    await expect(review).toContainText('Sent');
    expect(workspace.sends).toHaveLength(1);
    expect(failures).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await workspace.close();
  }
});

test('voice previews, schedule presets, explicit automation consent, and sticky save feedback preserve review defaults', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const failures = errors(page);
  try {
    await workspace.store.update((state) => {
      const action = state.settings.actions.find((item) => item.kind === 'power-rankings')!;
      action.mode = 'automatic';
      action.schedule.time = '17:30';
    });
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Voice', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'STARTING STYLE' })
      .selectOption('builtin:Playful trash talk');
    await expect(page.getByRole('complementary', { name: 'Writing style example' })).toContainText(
      'bench points still don’t count',
    );
    await expect(page.locator('.settings-save-bar')).toContainText('Unsaved changes');
    await page.getByLabel('Topics to avoid', { exact: true }).fill('Family and health');
    await page.getByLabel('Topics to avoid', { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Save Voice', exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath('voice-preset.png') });
    await page.getByRole('button', { name: 'Save Voice', exact: true }).click();
    await expect(page.locator('.settings-save-bar')).toContainText('Saved');
    await page.getByRole('button', { name: 'Schedules & sources', exact: true }).click();
    await page.getByText('Report schedules', { exact: true }).click();
    const action = page
      .locator('.action-block')
      .filter({ has: page.getByText('Weekly power rankings', { exact: true }) });
    await action
      .getByRole('button', { name: 'Create weekly power rankings every Tuesday at 9 AM' })
      .click();
    await expect(action.locator('.schedule-summary')).toContainText(
      'Saves a draft for you to review; nothing is sent.',
    );
    await expect(
      action.getByRole('combobox', { name: 'Weekly power rankings delivery policy' }),
    ).toHaveValue('draft');
    await action
      .getByRole('combobox', { name: 'Weekly power rankings delivery policy' })
      .selectOption('automatic');
    await answerConfirm(page, false);
    await expect(
      action.getByRole('combobox', { name: 'Weekly power rankings delivery policy' }),
    ).toHaveValue('draft');
    await page.getByRole('button', { name: 'Save Schedules & sources', exact: true }).click();
    await expect(page.locator('.settings-save-bar')).toContainText('Saved');
    expect(
      workspace.store.settingsSnapshot().actions.find((item) => item.kind === 'power-rankings')!
        .mode,
    ).toBe('draft');
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.locator('.more-tools > summary').click();
    await page.getByRole('button', { name: 'League members', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'League members' })).toBeVisible();
    expect(workspace.sends).toHaveLength(0);
    expect(failures).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('a failed AI connection gives a useful next step, keeps the key out of settings, and can be retried', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace(false, false);
  try {
    await page.goto(workspace.url);
    await guidedConnection(page);
    await page.getByRole('textbox', { name: 'LEAGUE ID OR URL' }).fill('123456');
    await page.getByRole('dialog').getByRole('button', { name: 'Connect league' }).click();
    await page.route('**/api/ai/test', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Controlled connection failure.', code: 'provider_failure' }),
      }),
    );
    await page
      .getByRole('dialog')
      .getByRole('combobox', { name: 'Your team', exact: true })
      .selectOption('1');
    const ai = page.getByRole('dialog', { name: 'Connect your AI writer' });
    await ai.getByLabel('OpenAI API key', { exact: true }).fill('fake-error-key');
    await ai.getByRole('button', { name: 'Connect and test' }).click();
    await expect(ai.getByRole('alert')).toContainText('Your AI connection needs attention');
    await expect(ai.getByText('Controlled connection failure.', { exact: true })).toBeHidden();
    await ai.getByText('Details for support', { exact: true }).click();
    await expect(ai).toContainText('Controlled connection failure.');
    await page.screenshot({ path: info.outputPath('connection-recovery.png') });
    await page.unroute('**/api/ai/test');
    await ai.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('dialog')).toContainText('Your league and AI connection are ready');
    expect(workspace.credentialWrites).toHaveLength(1);
    expect(JSON.stringify(workspace.store.snapshot())).not.toContain('fake-error-key');
    expect(workspace.generations()).toBe(0);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});

test('a settings conflict during guided setup never writes a new key or sends it to an old server', async ({
  page,
}) => {
  const workspace = await apiWorkspace(false, false);
  try {
    await page.goto(workspace.url);
    await guidedConnection(page);
    await page.getByRole('textbox', { name: 'LEAGUE ID OR URL' }).fill('123456');
    await page.getByRole('dialog').getByRole('button', { name: 'Connect league' }).click();
    const original = workspace.store.settingsSnapshot();
    await page.route('**/api/settings/ai', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Settings changed in another window.',
          code: 'revision_conflict',
        }),
      }),
    );
    await page
      .getByRole('dialog')
      .getByRole('combobox', { name: 'Your team', exact: true })
      .selectOption('1');
    const ai = page.getByRole('dialog', { name: 'Connect your AI writer' });
    await ai.getByLabel('OpenAI API key', { exact: true }).fill('fake-conflict-key');
    await ai.getByRole('button', { name: 'Connect and test' }).click();
    await expect(ai.getByRole('alert')).toBeVisible();
    expect(workspace.credentialWrites).toHaveLength(0);
    expect(workspace.store.settingsSnapshot()).toEqual(original);
    expect(workspace.sends).toHaveLength(0);
    expect(workspace.generations()).toBe(0);
  } finally {
    await workspace.close();
  }
});

test('delivery setup accepts ordinary fields, stores secure connection details, and does not send a message', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Delivery & access', exact: true }).click();
    const card = page.locator('[data-search-target="credential-resend"]');
    await card.locator(':scope > summary').click();
    await card.getByLabel('Resend API key', { exact: true }).fill('fake-email-key');
    await card
      .getByLabel('Sender email address', { exact: true })
      .fill('Sidekick <sender@example.test>');
    await expect(card.getByLabel('Resend delivery settings', { exact: true })).toBeHidden();
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Credential saved to the operating system credential store.' }),
    ).toBeVisible();
    const saved = workspace.credentialWrites.find((write) => write.provider === 'resend')!;
    expect(JSON.parse(saved.value)).toEqual({
      apiKey: 'fake-email-key',
      from: 'Sidekick <sender@example.test>',
    });
    expect(JSON.stringify(workspace.store.settingsSnapshot())).not.toContain('fake-email-key');
    await expect(card.getByLabel('Resend API key', { exact: true })).toHaveValue('');
    expect(workspace.sends).toHaveLength(0);
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByText('League standings & news', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Generate rankings draft' })).toBeEnabled();
  } finally {
    await workspace.close();
  }
});

test('a successful manual connection test clears the earlier startup failure and restores report creation', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await page.route('**/api/ai/test', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Fixture connection unavailable.',
          code: 'provider_failure',
        }),
      }),
    );
    await page.goto(workspace.url);
    await expect(page.getByRole('alert')).toContainText('Your AI connection needs attention');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.unroute('**/api/ai/test');
    await page.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Your AI connection works.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Create a report', exact: true })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(workspace.generations()).toBe(0);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});
