import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';

test('generation survives browser reload and saves one editable draft in SQLite', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    workspace.block();
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Generate rankings draft' }).click();
    await expect(page.getByText('Generation running', { exact: true })).toBeVisible();
    const request = workspace.store.snapshot().generationJobs![0]!;
    await page.reload();
    workspace.release();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.report-body').first()).toContainText(
      'controlled provider response',
    );
    const replay = await page.request.post(`${workspace.url}/api/generation-jobs`, {
      data: { requestId: request.requestId, leagueId: request.leagueId, kind: request.kind },
    });
    expect(replay.status()).toBe(202);
    expect((await replay.json()).status).toBe('completed');
    expect(workspace.generations()).toBe(1);
    expect(workspace.store.snapshot().reports).toHaveLength(1);
    expect(workspace.sends).toHaveLength(0);
    await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Report body' })
      .fill('Persisted through the real API.');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit draft', exact: true })).toBeVisible();
    expect(workspace.store.snapshot().reports[0]!.body).toBe('Persisted through the real API.');
    await page.screenshot({ path: info.outputPath('real-api-review.png') });
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('two windows preserve Voice edits when a section revision conflicts', async ({
  page,
  context,
}) => {
  const workspace = await apiWorkspace();
  const second = await context.newPage();
  try {
    for (const window of [page, second]) {
      await window.goto(workspace.url);
      await window.getByRole('button', { name: 'Settings', exact: true }).click();
      await window.getByRole('button', { name: 'Voice', exact: true }).click();
    }
    await page.getByLabel('Writing style', { exact: true }).fill('First window voice');
    await page.getByRole('button', { name: 'Save Voice', exact: true }).click();
    await second.getByLabel('Writing style', { exact: true }).fill('Second window unsaved voice');
    await second.getByRole('button', { name: 'Save Voice', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Reload Voice section' })).toBeVisible();
    await expect(second.getByLabel('Writing style', { exact: true })).toHaveValue(
      'Second window unsaved voice',
    );
    expect(workspace.store.settingsSnapshot().writingStyle).toBe('First window voice');
  } finally {
    await second.close();
    await workspace.close();
  }
});

test('uncertain email retry retains original envelope after Settings destination changes', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Generate rankings draft' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    workspace.failNextDelivery();
    await page.getByRole('button', { name: 'Send saved report', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Check and retry delivery' })).toBeVisible();
    await workspace.store.update((state) => {
      state.settings.emailRecipient = 'changed@example.test';
    });
    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Check and retry delivery' }).click();
    await expect(page.getByRole('dialog')).toContainText('Sent');
    expect(workspace.sends).toHaveLength(2);
    expect(workspace.sends[1]).toEqual(workspace.sends[0]);
    expect(workspace.sends[1]!.to).toBe('original@example.test');
    expect(JSON.stringify(workspace.store.snapshot())).not.toContain('fixture-only');
  } finally {
    await workspace.close();
  }
});

test('guided onboarding connects, tests AI, and reviews a draft through production routers', async ({
  page,
}) => {
  const workspace = await apiWorkspace(false);
  try {
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Guided setup', exact: false }).click();
    await page.getByRole('button', { name: 'Connect a league', exact: false }).last().click();
    await page
      .getByRole('textbox', { name: 'LEAGUE ID OR URL' })
      .fill('https://sleeper.com/leagues/123456');
    await page
      .getByRole('dialog', { name: 'Bring your league in.' })
      .getByRole('button', { name: 'Connect league', exact: false })
      .click();
    await expect(page.getByText('Connected Real API League', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Continue setup', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Choose and test an AI runtime' })
      .getByRole('button', { name: 'Set up AI', exact: false })
      .click();
    await page.getByRole('button', { name: 'Save and test runtime', exact: false }).click();
    await page.getByRole('button', { name: 'Generate first draft', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('controlled provider response');
    expect(workspace.store.snapshot().leagues[0]!.id).toBe('123456');
    expect(workspace.store.snapshot().reports).toHaveLength(1);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});

test('report history paginates and background polling preserves an unsaved editor', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    const createdAt = new Date().toISOString();
    await workspace.store.update((state) => {
      state.reports = Array.from({ length: 60 }, (_, i) => ({
        id: `history-${String(i).padStart(3, '0')}`,
        leagueId: 'browser-league',
        kind: 'power-rankings',
        createdAt,
        title: `Report ${String(i).padStart(3, '0')}`,
        body: 'Saved history body',
        citations: [],
        status: 'draft',
        revision: 0,
      }));
    });
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Reports', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review report', exact: true })).toHaveCount(20);
    await page.getByRole('button', { name: 'Load more reports' }).click();
    await expect(page.getByRole('button', { name: 'Review report', exact: true })).toHaveCount(40);
    await page.getByRole('button', { name: 'Review report', exact: true }).first().click();
    await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Report body' })
      .fill('Unsaved while the dashboard refreshes.');
    const refresh = page.waitForResponse(
      (response) => response.url().includes('/api/state?view=summary'),
      { timeout: 10000 },
    );
    await workspace.store.update((state) => {
      state.reports.unshift({
        ...state.reports[0]!,
        id: 'background-report',
        title: 'Background report',
        createdAt: new Date().toISOString(),
      });
    });
    const snapshot = await (await refresh).json();
    expect(
      snapshot.reports.some((report: { id: string }) => report.id === 'background-report'),
    ).toBe(true);
    expect(snapshot.reports[0]).not.toHaveProperty('body');
    await expect(page.getByRole('textbox', { name: 'Report body' })).toHaveValue(
      'Unsaved while the dashboard refreshes.',
    );
  } finally {
    await workspace.close();
  }
});
