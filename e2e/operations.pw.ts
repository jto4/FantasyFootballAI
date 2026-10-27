import { test, expect, type Page } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { answerConfirm } from './confirm';

function runtimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('recovers a render failure without exposing raw exception text', async ({ page }, info) => {
  const workspace = await apiWorkspace();
  try {
    await page.goto(workspace.url);
    await expect(page.getByRole('heading', { name: 'Sunday’s league desk' })).toBeVisible();
    await page.evaluate(() => {
      const scope = window as typeof window & { savedDateFormatter?: typeof Intl.DateTimeFormat };
      scope.savedDateFormatter = Intl.DateTimeFormat;
      Intl.DateTimeFormat = function (...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
        if (window.location.hash.startsWith('#/reports'))
          throw new Error('private-render-failure-fixture');
        const SavedFormatter = scope.savedDateFormatter!;
        return new SavedFormatter(...args);
      } as unknown as typeof Intl.DateTimeFormat;
    });
    await page.getByRole('button', { name: 'Reports', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'The dashboard could not display this page' }),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText('private-render-failure-fixture');
    await page.screenshot({ path: info.outputPath('renderer-recovery.png') });
    await page.evaluate(() => {
      const scope = window as typeof window & { savedDateFormatter?: typeof Intl.DateTimeFormat };
      Intl.DateTimeFormat = scope.savedDateFormatter!;
    });
    await page.getByRole('button', { name: 'Retry page', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sunday’s league desk' })).toBeVisible();
    expect(workspace.store.snapshot().leagues).toHaveLength(1);
  } finally {
    await workspace.close();
  }
});

test('bookmark, reload, Back, and Forward recover a saved report and protect unsaved edits', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Generate rankings draft' }).click();
    await page.getByRole('button', { name: 'Create draft', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const savedUrl = page.url();
    expect(savedUrl).toContain('#/reports?league=');
    expect(savedUrl).toContain('report=');
    await page.reload();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close report review', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Report body' })
      .fill('Unsaved text survives a rejected Back action.');
    await page.goBack();
    await answerConfirm(page, false);
    await expect(page.getByRole('textbox', { name: 'Report body' })).toHaveValue(
      'Unsaved text survives a rejected Back action.',
    );
    await expect(page).toHaveURL(savedUrl);
    await page.screenshot({ path: info.outputPath('url-review.png') });
    await page.goBack();
    await answerConfirm(page, true);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goForward();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('cancels a running job and recovers an older pending request beyond recent summaries', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    workspace.block();
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Generate rankings draft' }).click();
    await page.getByRole('button', { name: 'Create draft', exact: true }).click();
    await expect(page.getByText('Writing the report', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel generation', exact: true }).click();
    await expect(page.getByText('Generation cancelled', { exact: true })).toBeVisible();
    workspace.release();
    await expect.poll(() => workspace.store.snapshot().reports.length).toBe(0);
    const request = {
      requestId: 'archived-browser-request',
      leagueId: 'browser-league',
      kind: 'power-rankings',
    };
    await workspace.store.update((state) => {
      state.generationJobs = [
        {
          ...request,
          kind: 'power-rankings',
          id: 'old-request',
          status: 'cancelled',
          createdAt: '2025-01-01T00:00:00Z',
          finishedAt: '2025-01-01T00:00:01Z',
        },
        ...Array.from({ length: 220 }, (_, index) => ({
          ...request,
          requestId: `newer-browser-request-${index}`,
          kind: 'power-rankings' as const,
          id: `newer-job-${index}`,
          status: 'cancelled' as const,
          createdAt: new Date(1760000000000 + index).toISOString(),
          finishedAt: new Date(1760000000001 + index).toISOString(),
        })),
      ];
    });
    await page.evaluate(
      (request) => localStorage.setItem('sidekick.pendingGeneration', JSON.stringify(request)),
      request,
    );
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('sidekick.pendingGeneration')))
      .toBeNull();
    expect(workspace.generations()).toBe(1);
    await page.screenshot({ path: info.outputPath('cancelled-generation.png') });
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('configures encrypted routine copies, validates an export, and downloads safe diagnostics', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    await page.goto(`${workspace.url}/#/settings?league=browser-league`);
    await page.getByRole('button', { name: 'Storage & desktop', exact: true }).click();
    await page.getByLabel('Enable scheduled backups', { exact: true }).check();
    await page
      .getByLabel('Scheduled backup passphrase', { exact: true })
      .fill('browser-backup-passphrase');
    await page
      .getByLabel('Confirm scheduled backup passphrase', { exact: true })
      .fill('browser-backup-passphrase');
    await page.getByRole('button', { name: 'Save backup schedule', exact: true }).click();
    await expect(
      page.getByText('Encrypted backup schedule saved.', { exact: false }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`${workspace.url}/api/backups/routine/status`)).json())
            .files.length,
      )
      .toBe(1);
    await page.getByRole('button', { name: 'Refresh backup status', exact: true }).click();
    await expect(page.getByText('Last successful copy:', { exact: false })).toBeVisible();
    const copy = await page.request.post(`${workspace.url}/api/backup/export`, {
      data: { passphrase: 'browser-backup-passphrase' },
    });
    await page.getByText('Export & restore a backup', { exact: true }).click();
    await page
      .getByLabel('Passphrase for encrypted backup', { exact: true })
      .fill('browser-backup-passphrase');
    await page.getByLabel('Choose a backup to validate without restoring').setInputFiles({
      name: 'backup.ssb',
      mimeType: 'application/vnd.sunday-sidekick.encrypted-backup',
      buffer: await copy.body(),
    });
    await expect(page.getByText('Backup validated:', { exact: false })).toBeVisible();
    await page.getByText('Diagnostics', { exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download diagnostics', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('sidekick-diagnostics.json');
    await expect(page.getByText('Generation queue:', { exact: false })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('storage-diagnostics.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});
