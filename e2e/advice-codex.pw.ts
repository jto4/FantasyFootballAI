import { test, expect, type Page } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { seedAdvice } from './advice-fixture';

async function open(page: Page, url: string) {
  await page.goto(`${url}/#/advice?league=browser-league&mode=lineup`);
  await expect(page).toHaveTitle('Sunday Sidekick');
  await expect(page.getByRole('heading', { name: 'Advice', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'AI connection', exact: true })).toBeEnabled();
}
function errors(page: Page) {
  const found: string[] = [];
  page.on('pageerror', (error) => found.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') found.push(message.text());
  });
  return found;
}
test('existing signed-in Codex is explicit, tested without league data, and used in both saved passes', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace(true, false, undefined, 'signed-in', 'codex-cli');
  const runtime = errors(page);
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(workspace.store);
    const settings = workspace.store.settingsSnapshot();
    await open(page, workspace.url);
    expect(workspace.signedInCalls).toHaveLength(0);
    await expect(page.getByRole('combobox', { name: 'AI connection', exact: true })).toHaveValue(
      'saved',
    );
    await page
      .getByRole('combobox', { name: 'AI connection', exact: true })
      .selectOption('codex-cli');
    await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue(
      'gpt-6.1-sol',
    );
    await expect(
      page.getByRole('button', { name: 'Test signed-in AI', exact: true }),
    ).toBeEnabled();
    const section = page.getByRole('region', {
      name: 'AI connection for this analysis',
      exact: true,
    });
    await section
      .getByRole('combobox', { name: 'AI connection', exact: true })
      .scrollIntoViewIfNeeded();
    expect(await page.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('signed-in-codex.png') });
    await page.getByRole('button', { name: 'Test signed-in AI', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Codex answered the test' }),
    ).toBeVisible();
    expect(workspace.signedInCalls).toHaveLength(1);
    await page.getByText('Advanced analysis limits', { exact: true }).click();
    await expect(
      page.getByText('Codex subscription limits apply.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Reasoning and answer limit per pass', exact: true }),
    ).toHaveCount(0);
    await page.getByText('Advanced analysis limits', { exact: true }).click();
    expect(workspace.signedInCalls[0]!.prompt).toBe('Return only {"ok":true}.');
    expect(workspace.adviceCalls).toHaveLength(0);
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(result).toBeVisible();
    if (!(await result.locator('.result-numbers').evaluate((el: HTMLDetailsElement) => el.open)))
      await result.getByText('Numbers & comparisons', { exact: true }).click();
    await result.locator('summary').filter({ hasText: 'Sources, model & usage' }).click();
    await expect(result).toContainText('Codex GPT-6.1-Sol · signed-in CLI');
    await expect(result).toContainText('signed-in Codex connection selected for this analysis');
    expect(workspace.signedInCalls).toHaveLength(3);
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.signedInCalls.every((call) => call.maxOutputTokens === undefined)).toBe(true);
    expect(workspace.savedAdviceConfigurations()).toBe(0);
    expect(workspace.store.snapshot().adviceResults![0]!.request.connection).toBe('codex-cli');
    expect(workspace.store.snapshot().adviceResults![0]!.request.maxOutputTokens).toBeUndefined();
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
  const workspace = await apiWorkspace(true, false, undefined, 'not-installed', 'codex-cli');
  const runtime = errors(page);
  try {
    await seedAdvice(workspace.store);
    await open(page, workspace.url);
    await page
      .getByRole('combobox', { name: 'AI connection', exact: true })
      .selectOption('codex-cli');
    for (const state of ['not-installed', 'signed-out', 'unavailable'] as const) {
      workspace.setSignedInStatus(state);
      await page.getByRole('button', { name: 'Reload connections', exact: true }).click();
      await expect(
        page.getByRole('combobox', { name: 'AI connection', exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole('button', { name: 'Test signed-in AI', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Analyze my choices', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByText(
          'Check the supported Codex CLI version and ChatGPT sign-in, then reload connections before analyzing.',
          {
            exact: true,
          },
        ),
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
  const workspace = await apiWorkspace(true, false, undefined, 'signed-in', 'codex-cli');
  try {
    await seedAdvice(workspace.store);
    await open(page, workspace.url);
    await page
      .getByRole('combobox', { name: 'AI connection', exact: true })
      .selectOption('codex-cli');
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
      page.getByRole('status').filter({ hasText: 'Codex could not complete the test' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'No unverified result was saved' }),
    ).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'AI connection', exact: true })).toHaveValue(
      'codex-cli',
    );
    expect(workspace.store.snapshot().adviceResults).toEqual([]);
    workspace.reportSignedInLimit();
    await page.getByRole('button', { name: 'Test signed-in AI', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Codex reported a limit' }),
    ).toBeVisible();
    expect(workspace.savedAdviceConfigurations()).toBe(0);
  } finally {
    await workspace.close();
  }
});
test('Help links to the signed-in connection guidance and the actual Advice page', async ({
  page,
}) => {
  const workspace = await apiWorkspace(true, false, undefined, 'signed-in', 'codex-cli');
  try {
    await seedAdvice(workspace.store);
    await page.goto(`${workspace.url}/#/help?answer=advice-signed-in-codex`);
    const article = page.locator('#help-advice-signed-in-codex');
    await expect(article).toHaveAttribute('open', '');
    await expect(article).toContainText(
      'Test signed-in AI sends a fixed check with no league data',
    );
    await article.getByRole('button', { name: 'Open Advice', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Advice', exact: true })).toBeVisible();
    expect(workspace.signedInCalls).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});

test('Codex can be saved app-wide without an API key and saved advice uses its subscription budget', async ({
  page,
}, info) => {
  const w = await apiWorkspace(true, false, undefined, 'signed-in', 'codex-cli');
  const runtimeErrors = errors(page);
  try {
    await seedAdvice(w.store);
    await page.goto(w.url);
    await expect(page).toHaveTitle('Sunday Sidekick');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByText('Advanced AI options', { exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Connection type', exact: true })
      .selectOption('codex-cli');
    await expect(
      page.getByText('Uses your existing Codex ChatGPT sign-in', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(page.getByText('Your AI connection works.', { exact: false })).toBeVisible();
    expect(w.store.settingsSnapshot().aiRuntime).toMatchObject({
      mode: 'codex-cli',
      model: 'gpt-6.1-sol',
      command: '',
      args: '',
    });
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Connection type', exact: true })).toHaveValue(
      'codex-cli',
    );
    await open(page, w.url);
    await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue(
      'gpt-6.1-sol',
    );
    await page.getByText('Advanced analysis limits', { exact: true }).click();
    await expect(
      page.getByText('Codex subscription limits apply.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Reasoning and answer limit per pass', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Advice result' })).toBeVisible();
    expect(w.adviceCalls).toHaveLength(2);
    expect(w.adviceCalls.every((call) => call.maxOutputTokens === undefined)).toBe(true);
    expect(w.credentialWrites).toHaveLength(0);
    expect(w.sends).toHaveLength(0);
    expect(runtimeErrors).toEqual([]);
    await page.screenshot({ path: info.outputPath('saved-codex-result.png') });
  } finally {
    await w.close();
  }
});

test('a saved Codex connection becomes ready when credentials finish loading during its startup check', async ({
  page,
}) => {
  const w = await apiWorkspace(true, false, undefined, 'signed-in', 'codex-cli');
  let probes = 0;
  try {
    await w.store.update((s) => {
      s.settings.aiRuntime = {
        mode: 'codex-cli',
        model: 'gpt-6.1-sol',
        command: '',
        args: '',
        baseUrl: 'https://api.openai.com/v1',
      };
    });
    await page.route('**/api/credentials', async (route) => {
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, 100));
      await route.fulfill({ response });
    });
    await page.route('**/api/ai/test', async (route) => {
      probes++;
      await new Promise((r) => setTimeout(r, 400));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
    await page.goto(w.url + '/#/desk');
    await page.getByText('Connections & scheduled reports', { exact: true }).click();
    await expect(page.getByText('Report writer is ready.', { exact: true })).toBeVisible();
    expect(probes).toBe(1);
    expect(w.credentialWrites).toEqual([]);
    expect(w.sends).toEqual([]);
  } finally {
    await w.close();
  }
});
