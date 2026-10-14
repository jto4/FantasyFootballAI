import { expect, test, type Page } from '@playwright/test';
import type { SavedReport } from '@sidekick/core';
import { apiWorkspace } from './api-fixture';

type Workspace = Awaited<ReturnType<typeof apiWorkspace>>;
function runtimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
async function seed(workspace: Workspace, values: Partial<SavedReport> = {}) {
  const report: SavedReport = {
    id: 'review-ui',
    leagueId: 'browser-league',
    kind: 'power-rankings',
    createdAt: new Date().toISOString(),
    title: 'Fictional weekly recap',
    body: 'A fictional report ready for review.',
    citations: [],
    status: 'draft',
    revision: 0,
    ...values,
  };
  await workspace.store.update((state) => {
    state.reports.push(report);
  });
  return report;
}
async function open(page: Page, workspace: Workspace, id: string) {
  await page.goto(`${workspace.url}/#/reports?report=${id}`);
  await expect(page).toHaveTitle('Sunday Sidekick');
  const review = page.getByRole('dialog', { name: 'Review report' });
  await expect(review).toBeVisible();
  return review;
}

test('report text comes before collapsed dates and Close stays visible at the bottom', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    const report = await seed(workspace, {
      body: 'Long fictional weekly recap.\n'.repeat(120),
      evidence: {
        leagueSyncedAt: new Date().toISOString(),
        newsRefreshedAt: new Date().toISOString(),
        guidance: 'These fictional rankings use the recorded standings, not a forecast.',
      },
    });
    const review = await open(page, workspace, report.id);
    const details = review.locator('.report-details');
    await expect(details.locator('dl')).toBeHidden();
    const title = review.getByRole('heading', { name: report.title, exact: true });
    await expect(title).toBeInViewport();
    expect(await title.evaluate((el) => el.getBoundingClientRect().top < innerHeight / 2)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('review-first-screen.png') });
    await details.locator('summary').click();
    await expect(details.locator('dl')).toBeVisible();
    await expect(details).toContainText('League data used');
    await page.screenshot({ path: info.outputPath('review-details.png') });
    await details.locator('summary').click();
    await review.getByText('Evidence and limitations', { exact: true }).click();
    await expect(review.getByText(report.evidence!.guidance, { exact: true })).toBeVisible();
    await review.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const close = review.getByRole('button', { name: 'Close report review' });
    await expect(close).toBeInViewport();
    await expect(
      review.getByRole('heading', { name: 'Review report', exact: true }),
    ).toBeInViewport();
    await expect(review.getByRole('button', { name: 'Send saved report' })).toBeInViewport();
    expect(await review.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('review-sticky-header.png') });
    if (info.project.name === 'mobile') {
      await page.setViewportSize({ width: 320, height: 568 });
      await review.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect(close).toBeInViewport();
      await expect(review.getByRole('button', { name: 'Send saved report' })).toBeInViewport();
      expect(await review.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath('review-narrow-header.png') });
    }
    await close.click();
    await expect(review).toBeHidden();
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('matching delivery text is shown once and editing still previews the saved text', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    const report = await seed(workspace);
    const review = await open(page, workspace, report.id);
    const preview = review.getByRole('region', { name: 'Send preview' });
    await expect(review.locator('.report-body')).toHaveCount(1);
    await expect(preview.locator('.report-body')).toHaveCount(0);
    await expect(preview).toContainText('Sending uses the full saved report shown above.');
    await expect(review.locator('.report-details summary')).toContainText(
      'Some data dates weren’t recorded',
    );
    await review.getByRole('button', { name: 'Edit draft', exact: true }).click();
    await review
      .getByLabel('Report body', { exact: true })
      .fill('Edited fictional report ready to send.');
    await expect(preview.locator('.report-body')).toHaveText(report.body);
    await expect(review.getByRole('button', { name: 'Send saved report' })).toBeDisabled();
    await review.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(review.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible();
    await expect(review.locator('.report-body')).toHaveCount(1);
    await expect(preview.locator('.report-body')).toHaveCount(0);
    await expect(review.locator('.report-body')).toHaveText(
      'Edited fictional report ready to send.',
    );
    await review.getByRole('button', { name: 'Send saved report' }).click();
    await expect(review.getByRole('group', { name: 'Confirm report delivery' })).toBeVisible();
    expect(workspace.sends).toHaveLength(0);
    await review
      .getByRole('button', { name: 'Send email to original@example.test' })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('review-single-copy-confirmation.png') });
    await review.getByRole('button', { name: 'Send email to original@example.test' }).click();
    await expect(review.locator('.report-review-header')).toContainText('Sent');
    expect(workspace.sends).toHaveLength(1);
    expect(workspace.sends[0]!.body).toBe('Edited fictional report ready to send.');
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('shortened phone messages and immutable retries keep their exact separate preview', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    for (const [id, channel, destination, limit] of [
      ['sms-person', 'sms', '+15555550123', 1500],
      ['sms-group', 'sms', 'CH' + '1'.repeat(32), 1600],
      ['imessage', 'imessage', 'fictional-chat', 10000],
    ] as const) {
      const report = await seed(workspace, {
        id,
        kind: 'chat-reply',
        replyChannel: channel,
        replyDestination: destination,
        body: 'Fictional message. '.repeat(700),
      });
      const review = await open(page, workspace, report.id);
      const preview = review.getByRole('region', { name: 'Send preview' });
      await expect(preview.locator('.report-body')).toHaveText(report.body.slice(0, limit));
      await expect(
        preview.getByRole('status').filter({ hasText: 'This channel sends only' }),
      ).toBeVisible();
      await expect(review.locator('.report-body')).toHaveCount(2);
      if (id === 'sms-person') {
        await preview.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('review-shortened-message.png') });
      }
    }
    const report = await seed(workspace, {
      id: 'immutable-retry',
      deliveryState: 'uncertain',
      deliveryEnvelope: {
        channel: 'email',
        destination: 'original@example.test',
        subject: 'Original subject',
        sender: 'sender@example.test',
        body: 'Original immutable delivery text.',
      },
    });
    const review = await open(page, workspace, report.id);
    const preview = review.getByRole('region', { name: 'Send preview' });
    await expect(preview.locator('.report-body')).toHaveText('Original immutable delivery text.');
    await expect(preview.getByRole('alert')).toContainText('may already have delivered');
    await expect(review.getByRole('button', { name: 'Edit draft' })).toHaveCount(0);
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('readable citations keep a separate literal send preview', async ({ page }) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    const report = await seed(workspace, {
      body: 'See [Fictional source](https://example.test/source) before sharing.',
      citations: [{ title: 'Fictional source', url: 'https://example.test/source' }],
    });
    const review = await open(page, workspace, report.id);
    await expect(
      review.locator('.report-body').first().getByRole('link', { name: 'Fictional source' }),
    ).toHaveAttribute('href', 'https://example.test/source');
    await expect(
      review.getByRole('region', { name: 'Send preview' }).locator('.report-body'),
    ).toHaveText(report.body);
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('Edit/shorten opens the saved body, focuses it, and requires an explicit save', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    const beforeSettings = workspace.store.settingsSnapshot();
    for (const channel of ['sms', 'imessage'] as const) {
      const report = await seed(workspace, {
        id: `shorten-${channel}`,
        kind: 'chat-reply',
        replyChannel: channel,
        replyDestination: channel === 'sms' ? '+15555550123' : 'fictional-chat',
        body: 'Fictional recap for the group. '.repeat(400),
      });
      const review = await open(page, workspace, report.id);
      const preview = review.getByRole('region', { name: 'Send preview' });
      const shortcut = preview.getByRole('button', { name: 'Edit/shorten', exact: true });
      await shortcut.scrollIntoViewIfNeeded();
      await expect(shortcut).toBeInViewport();
      expect((await shortcut.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      if (channel === 'sms')
        await page.screenshot({ path: info.outputPath('shorten-shortcut.png') });
      await shortcut.click();
      const body = review.getByLabel('Report body', { exact: true });
      await expect(body).toBeFocused();
      await expect(body).toHaveValue(report.body);
      const header = await review.locator('.report-review-header').boundingBox();
      expect((await body.boundingBox())!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
      expect(workspace.store.reportById(report.id)!.body).toBe(report.body);
      await expect(review.getByRole('button', { name: 'Send saved report' })).toBeDisabled();
      await expect(shortcut).toHaveCount(0);
      if (channel === 'sms')
        await page.screenshot({ path: info.outputPath('focused-shortening.png') });
      await body.fill('Short fictional message for the group.');
      await review.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect(review.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible();
      expect(workspace.store.reportById(report.id)!.body).toBe(
        'Short fictional message for the group.',
      );
      await expect(preview.locator('.report-body')).toHaveCount(0);
      await expect(preview).toContainText('Sending uses the full saved report shown above.');
      await expect(
        preview.getByRole('status').filter({ hasText: 'This channel sends only' }),
      ).toHaveCount(0);
      await review.getByRole('button', { name: 'Send saved report' }).click();
      const label = channel === 'sms' ? 'text message' : 'iMessage';
      await expect(review.getByRole('group', { name: 'Confirm report delivery' })).toContainText(
        `by ${label}`,
      );
      await expect(
        review.getByRole('button', {
          name: `Send ${label} to ${report.replyDestination}`,
          exact: true,
        }),
      ).toBeVisible();
      if (channel === 'sms')
        await page.screenshot({ path: info.outputPath('shortened-confirmation.png') });
      await review.getByRole('button', { name: 'Back to review' }).click();
      expect(workspace.sends).toHaveLength(0);
    }
    expect(workspace.store.settingsSnapshot()).toEqual(beforeSettings);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('send previews name all delivery methods and attempted deliveries never offer shortening', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    for (const [channel, label] of [
      ['email', 'Email'],
      ['sms', 'Text message'],
      ['imessage', 'iMessage'],
      ['dashboard', 'In-app only'],
    ] as const) {
      const report = await seed(workspace, {
        id: `label-${channel}`,
        ...(channel === 'email'
          ? {}
          : channel === 'dashboard'
            ? { kind: 'matchup-preview' }
            : {
                kind: 'chat-reply',
                replyChannel: channel,
                replyDestination: channel === 'sms' ? '+15555550123' : 'fictional-chat',
              }),
      });
      const review = await open(page, workspace, report.id);
      const preview = review.getByRole('region', { name: 'Send preview' });
      await expect(preview.locator('p').filter({ hasText: /^Channel:/ })).toHaveText(
        `Channel: ${label}`,
      );
      if (channel === 'dashboard') {
        await expect(review.getByRole('button', { name: 'Send saved report' })).toBeDisabled();
        await expect(preview).toContainText(
          'This report stays in the app. Copy or download it to share.',
        );
        await preview.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('in-app-delivery-label.png') });
      }
    }
    const report = await seed(workspace, {
      id: 'no-shortening-after-attempt',
      kind: 'chat-reply',
      replyChannel: 'sms',
      replyDestination: '+15555550123',
      body: 'Previously attempted fictional message. '.repeat(100),
      deliveryState: 'failed',
    });
    const review = await open(page, workspace, report.id);
    await expect(
      review.getByRole('status').filter({ hasText: 'This channel sends only' }),
    ).toBeVisible();
    await expect(review.getByRole('button', { name: 'Edit/shorten' })).toHaveCount(0);
    await expect(review).toContainText('Reports with a delivery attempt cannot be edited.');
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});
