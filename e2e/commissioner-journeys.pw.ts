import { test, expect, type Page } from '@playwright/test';
import { initialAppState } from '../apps/dashboard/src/ui/app-state';
import type { SavedReport } from '@sidekick/core';

async function workspace(page: Page, connected = true) {
  const state = structuredClone(initialAppState);
  state.settings.aiRuntime!.model = 'test-model';
  state.settings.emailRecipient = 'commissioner@example.test';
  const action = state.settings.actions.find((item) => item.kind === 'power-rankings')!;
  action.enabled = true;
  action.channel = 'email';
  action.mode = 'automatic';
  const league = {
    id: 'league-123',
    platform: 'sleeper' as const,
    name: 'Browser Fixture',
    displayName: 'Browser Fixture',
    teamCount: 2,
    teams: [
      { id: '1', name: 'Team One', wins: 2, losses: 1, pointsFor: 210 },
      { id: '2', name: 'Team Two', wins: 1, losses: 2, pointsFor: 180 },
    ],
    scoring: {},
    settings: { currentWeek: 3, playoffStartWeek: 14 },
    connectedAt: '2026-10-01T12:00:00Z',
    lastSyncedAt: new Date().toISOString(),
  };
  if (connected) state.leagues.push(league);
  const generatedRequests: Record<string, unknown>[] = [];
  const savedSections: string[] = [];
  const sends: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname,
      method = request.method();
    let result: unknown = {};
    let status = 200;
    if (path === '/api/state') result = state;
    else if (path === '/api/news')
      result = { items: [], stale: false, refreshedAt: new Date().toISOString() };
    else if (path === '/api/credentials')
      result = [
        'openai',
        'resend',
        'espn',
        'twilio',
        'bluebubbles',
        'image-generation',
        'stability-image-generation',
      ].map((provider) => ({
        provider,
        configured: provider === 'openai' || provider === 'resend',
      }));
    else if (path === '/api/yahoo/oauth/status')
      result = {
        clientConfigured: false,
        authorized: false,
        requiresReconnect: false,
        redirectUri: 'oob',
      };
    else if (path === '/api/bluebubbles/webhook') result = { configured: false };
    else if (path === '/api/images' || path === '/api/backups') result = [];
    else if (path === '/api/ai/models') result = { models: ['test-model', 'second-model'] };
    else if (path === '/api/ai/test') result = { ok: true };
    else if (path.startsWith('/api/settings/') && method === 'PATCH') {
      const section = path.split('/').at(-1)!;
      savedSections.push(section);
      Object.assign(state.settings, request.postDataJSON());
      result = state.settings;
    } else if (path === '/api/leagues' && method === 'POST') {
      const input = request.postDataJSON();
      result = { ...league, id: input.leagueId };
      state.leagues.push(result as typeof league);
      status = 201;
    } else if (path === '/api/generation-jobs' && method === 'POST') {
      const input = request.postDataJSON();
      generatedRequests.push(input);
      const report: SavedReport = {
        id: 'report-1',
        leagueId: state.leagues[0]!.id,
        kind: 'power-rankings',
        title: 'Fixture rankings',
        body: 'Original draft ready for review.',
        status: 'draft',
        citations: [],
        revision: 0,
        createdAt: new Date().toISOString(),
        evidence: {
          leagueSyncedAt: league.lastSyncedAt,
          guidance: 'Standings snapshot only; no projections.',
        },
      };
      state.reports.unshift(report);
      const job = {
        id: 'job-1',
        requestId: input.requestId,
        leagueId: input.leagueId,
        kind: input.kind,
        createdAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: 'completed' as const,
        reportId: report.id,
      };
      state.generationJobs = [job];
      result = job;
      status = 202;
    } else if (path === '/api/report-history') {
      const query = new URL(request.url()).searchParams;
      const items = state.reports.filter(
        (report) =>
          (!query.get('leagueId') || report.leagueId === query.get('leagueId')) &&
          (!query.get('status') ||
            (query.get('status') === 'draft'
              ? report.status === 'draft' && !report.deliveryState
              : query.get('status') === 'sent'
                ? report.status === 'sent'
                : report.deliveryState === query.get('status'))),
      );
      result = { items, total: items.length };
    } else if (path === '/api/reports/report-1' && method === 'GET') {
      result = state.reports[0];
    } else if (path === '/api/reports/report-1' && method === 'PATCH') {
      const input = request.postDataJSON();
      Object.assign(state.reports[0]!, input, { revision: input.revision + 1 });
      result = state.reports[0];
    } else if (path.endsWith('/send') && method === 'POST') {
      const input = request.postDataJSON();
      sends.push(input);
      state.reports[0]!.status = 'sent';
      result = { status: 'sent' };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sunday’s league desk' })).toBeVisible();
  await expect(page.locator('body')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  return { state, generatedRequests, savedSections, sends, errors };
}

test('generating, editing, and sending a draft respects review and destination', async ({
  page,
}, testInfo) => {
  const context = await workspace(page);
  await page
    .getByRole('region', { name: 'Commissioner next actions' })
    .screenshot({ path: testInfo.outputPath('action-inbox.png') });
  await page.getByRole('button', { name: 'Generate rankings draft' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close report review' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Send saved report' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close report review' })).toBeFocused();
  expect(context.generatedRequests[0]).toMatchObject({ kind: 'power-rankings' });
  expect(context.sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await page.getByRole('textbox', { name: 'Report body' }).fill('Commissioner edited this draft.');
  await expect(page.getByRole('button', { name: 'Send saved report' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit draft', exact: true })).toBeVisible();
  await expect(page.locator('.report-body').first()).toHaveText('Commissioner edited this draft.');
  await expect(page.getByRole('region', { name: 'Send preview' })).toContainText(
    'commissioner@example.test',
  );
  await page.screenshot({ path: testInfo.outputPath('report-review.png'), fullPage: false });
  await page.getByRole('button', { name: 'Send saved report' }).click();
  await expect(page.getByRole('dialog')).toContainText('Sent');
  expect(context.sends[0]).toMatchObject({
    revision: 1,
    expectedDestination: 'commissioner@example.test',
  });
  await page.getByRole('button', { name: 'Close report review' }).click();
  await page.getByRole('combobox', { name: 'Filter reports by status' }).selectOption('draft');
  await expect(page.getByText('No reports match these filters.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'League desk', exact: true }).click();
  await expect(page.getByText('Sent ·', { exact: false })).toBeVisible();
  expect(context.errors).toEqual([]);
});

test('AI tests and discovery never save unrelated Voice edits', async ({ page }, testInfo) => {
  const context = await workspace(page);
  const original = context.state.settings.writingStyle;
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Voice', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Writing style', exact: false })
    .fill('Unsaved voice change');
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.getByRole('button', { name: 'Save and test runtime', exact: false }).click();
  await expect(page.getByText('AI runtime responded.', { exact: false })).toBeVisible();
  expect(context.state.settings.writingStyle).toBe(original);
  expect(context.savedSections).toEqual(['ai']);
  await page.getByRole('button', { name: 'Discover models', exact: false }).click();
  await expect(page.getByText('Found 2 models.', { exact: false })).toBeVisible();
  expect(context.state.settings.writingStyle).toBe(original);
  await page.getByRole('button', { name: 'Voice · Unsaved', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Writing style', exact: false })).toHaveValue(
    'Unsaved voice change',
  );
  await page.getByRole('button', { name: 'Save Voice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save Voice', exact: true })).toBeDisabled();
  await expect(page.getByText('Voice saved locally.', { exact: false })).toBeVisible();
  expect(context.state.settings.writingStyle).toBe('Unsaved voice change');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('scoped-settings.png'), fullPage: false });
  expect(context.errors).toEqual([]);
});

test('onboarding connects a league URL, tests AI, and ends in draft review', async ({
  page,
}, testInfo) => {
  const context = await workspace(page, false);
  await page.getByRole('button', { name: 'Guided setup', exact: false }).click();
  await page.getByRole('button', { name: 'Connect a league', exact: false }).last().click();
  await page
    .getByRole('textbox', { name: 'LEAGUE ID OR URL' })
    .fill('https://sleeper.com/leagues/123456');
  await page
    .getByRole('dialog', { name: 'Bring your league in.' })
    .getByRole('button', { name: 'Connect league', exact: false })
    .click();
  await expect(page.getByText('Connected Browser Fixture', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continue setup', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Choose and test an AI runtime' })
    .getByRole('button', { name: 'Set up AI', exact: false })
    .click();
  await page.getByRole('button', { name: 'Save and test runtime', exact: false }).click();
  await expect(
    page.getByRole('button', { name: 'Generate first draft', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Generate first draft', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Original draft ready for review.');
  expect(context.sends).toHaveLength(0);
  expect(context.generatedRequests[0]).toMatchObject({
    leagueId: '123456',
    kind: 'power-rankings',
  });
  await page.screenshot({ path: testInfo.outputPath('first-report.png'), fullPage: false });
  expect(context.errors).toEqual([]);
});

test('unsaved settings and draft edits warn before leaving', async ({ page }) => {
  await workspace(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'MODEL', exact: true }).fill('unsaved-model');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'League desk', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'League desk', exact: true }).click();
  await page.getByRole('button', { name: 'Generate rankings draft' }).click();
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await page.getByRole('textbox', { name: 'Report body' }).fill('Unfinished edit');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Close report review' }).click();
  await expect(page.getByRole('textbox', { name: 'Report body' })).toHaveValue('Unfinished edit');
});

test('a failed delivery remains visible and cannot be edited before retry', async ({ page }) => {
  const context = await workspace(page);
  await page.getByRole('button', { name: 'Generate rankings draft' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.route('**/api/reports/report-1/send', async (route) => {
    context.state.reports[0]!.deliveryState = 'failed';
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Delivery provider declined the request.' }),
    });
  });
  await page.getByRole('button', { name: 'Send saved report' }).click();
  await expect(page.getByRole('dialog')).toContainText('Delivery failed');
  await expect(page.getByRole('button', { name: 'Retry saved report' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit draft', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close report review' }).click();
  await page.getByRole('combobox', { name: 'Filter reports by status' }).selectOption('failed');
  await expect(page.getByRole('heading', { name: 'Fixture rankings' })).toBeVisible();
  expect(context.errors).toEqual([
    'Failed to load resource: the server responded with a status of 502 (Bad Gateway)',
  ]);
});
