import { test, expect, type Page } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { seedAdvice } from './advice-fixture';

async function open(page: Page, url: string) {
  await page.goto(`${url}/#/advice?league=browser-league&mode=lineup`);
  await expect(page).toHaveTitle('Sunday Sidekick');
  await expect(page.getByRole('heading', { name: 'Advice', exact: true })).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Connection for this analysis', exact: true }),
  ).toBeEnabled();
}
function errors(page: Page) {
  const found: string[] = [];
  page.on('pageerror', (error) => found.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') found.push(message.text());
  });
  return found;
}
test('existing signed-in Claude is explicit, tested without league data, and used in both saved passes', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace(true, false, undefined, 'signed-in');
  const runtime = errors(page);
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(workspace.store);
    const settings = workspace.store.settingsSnapshot();
    await open(page, workspace.url);
    expect(workspace.signedInCalls).toHaveLength(0);
    await expect(
      page.getByRole('combobox', { name: 'Connection for this analysis', exact: true }),
    ).toHaveValue('saved');
    await page
      .getByRole('combobox', { name: 'Connection for this analysis', exact: true })
      .selectOption('claude-cli');
    await expect(
      page.getByRole('combobox', { name: 'AI for this analysis', exact: true }),
    ).toHaveValue('opus');
    await expect(
      page.getByRole('button', { name: 'Test signed-in AI', exact: true }),
    ).toBeEnabled();
    const section = page.getByRole('region', {
      name: 'AI connection for this analysis',
      exact: true,
    });
    await section
      .getByRole('combobox', { name: 'Connection for this analysis', exact: true })
      .scrollIntoViewIfNeeded();
    expect(await page.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('signed-in-connection.png') });
    await page.getByRole('button', { name: 'Test signed-in AI', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Claude answered the test' }),
    ).toBeVisible();
    expect(workspace.signedInCalls).toHaveLength(1);
    expect(workspace.signedInCalls[0]!.prompt).toBe('Return only {"ok":true}.');
    expect(workspace.adviceCalls).toHaveLength(0);
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(result).toBeVisible();
    if (!(await result.locator('.result-numbers').evaluate((el: HTMLDetailsElement) => el.open)))
      await result.getByText('Numbers & comparisons', { exact: true }).click();
    await result.locator('summary').filter({ hasText: 'Sources, model & usage' }).click();
    await expect(result).toContainText('Claude Opus · signed-in CLI');
    await expect(result).toContainText('signed-in Claude connection selected for this analysis');
    expect(workspace.signedInCalls).toHaveLength(3);
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.savedAdviceConfigurations()).toBe(0);
    expect(workspace.store.snapshot().adviceResults![0]!.request.connection).toBe('claude-cli');
    expect(workspace.store.settingsSnapshot()).toEqual(settings);
    await page.reload();
    await expect(result).toBeVisible();
    if (!(await result.locator('.result-numbers').evaluate((el: HTMLDetailsElement) => el.open)))
      await result.getByText('Numbers & comparisons', { exact: true }).click();
    expect(workspace.signedInCalls).toHaveLength(3);
    expect(workspace.sends).toHaveLength(0);
    expect(workspace.credentialWrites).toHaveLength(0);
    expect(runtime).toEqual([]);
  } finally {
    await workspace.close();
  }
});
test('unavailable sign-ins explain recovery and reload without generating or switching providers', async ({
  page,
}) => {
  const workspace = await apiWorkspace(true, false, undefined, 'not-installed');
  const runtime = errors(page);
  try {
    await seedAdvice(workspace.store);
    await open(page, workspace.url);
    await page
      .getByRole('combobox', { name: 'Connection for this analysis', exact: true })
      .selectOption('claude-cli');
    for (const state of ['not-installed', 'signed-out', 'unavailable'] as const) {
      workspace.setSignedInStatus(state);
      await page.getByRole('button', { name: 'Reload connections', exact: true }).click();
      await expect(
        page.getByRole('combobox', { name: 'Connection for this analysis', exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole('button', { name: 'Test signed-in AI', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Analyze my choices', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByText('Check the Claude CLI sign-in and reload connections before analyzing.', {
          exact: true,
        }),
      ).toBeVisible();
    }
    workspace.setSignedInStatus('signed-in');
    await page.getByRole('button', { name: 'Reload connections', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Analyze my choices', exact: true }),
    ).toBeEnabled();
    expect(workspace.signedInCalls).toHaveLength(0);
    expect(runtime).toEqual([]);
  } finally {
    await workspace.close();
  }
});
test('failed generation keeps inputs and a blocked connection test can be canceled', async ({
  page,
}) => {
  const workspace = await apiWorkspace(true, false, undefined, 'signed-in');
  try {
    await seedAdvice(workspace.store);
    await open(page, workspace.url);
    await page
      .getByRole('combobox', { name: 'Connection for this analysis', exact: true })
      .selectOption('claude-cli');
    await expect(
      page.getByRole('button', { name: 'Analyze my choices', exact: true }),
    ).toBeEnabled();
    workspace.blockSignedInProbe(true);
    await page.getByRole('button', { name: 'Test signed-in AI', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Analyze my choices', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel connection test', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Connection test canceled' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Analyze my choices', exact: true }),
    ).toBeEnabled();
    await expect.poll(() => workspace.signedInCalls[0]?.signal?.aborted).toBe(true);
    workspace.blockSignedInProbe(false);
    workspace.failSignedIn(true);
    await page.getByRole('button', { name: 'Test signed-in AI', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Claude could not complete the test' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'No unverified result was saved' }),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Connection for this analysis', exact: true }),
    ).toHaveValue('claude-cli');
    expect(workspace.store.snapshot().adviceResults).toEqual([]);
    workspace.reportSignedInLimit();
    await page.getByRole('button', { name: 'Test signed-in AI', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Claude reported a limit' }),
    ).toBeVisible();
    expect(workspace.savedAdviceConfigurations()).toBe(0);
  } finally {
    await workspace.close();
  }
});
test('Help links to the signed-in connection guidance and the actual Advice page', async ({
  page,
}) => {
  const workspace = await apiWorkspace(true, false, undefined, 'signed-in');
  try {
    await seedAdvice(workspace.store);
    await page.goto(`${workspace.url}/#/help?answer=advice-signed-in-ai`);
    const article = page.locator('#help-advice-signed-in-ai');
    await expect(article).toHaveAttribute('open', '');
    await expect(article).toContainText('Test signed-in AI sends only a fixed connection check');
    await article.getByRole('button', { name: 'Open Advice', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Advice', exact: true })).toBeVisible();
    expect(workspace.signedInCalls).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});
