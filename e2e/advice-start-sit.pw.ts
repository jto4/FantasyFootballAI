import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { adviceCatalog, seedAdvice } from './advice-fixture';

test('one-spot comparison works with unrelated missing kicker/defense estimates and survives reload', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(workspace.store);
    await workspace.store.update((state) => {
      const league = state.leagues[0]!;
      league.settings.roster_positions = ['QB', 'WR', 'RB', 'K', 'DST', 'BN'];
      league.teams[0]!.roster!.push(
        { ...adviceCatalog.get('w3')! },
        { id: 'dummy-kicker', name: 'Fictional Kicker', position: 'K', nflTeam: 'BUF' },
      );
      league.teams[0]!.rosterSize = 5;
    });
    const before = structuredClone(workspace.store.snapshot().settings);
    await page.goto(`${workspace.url}/#/advice?league=browser-league&mode=lineup`);
    await expect(page).toHaveTitle('Sunday Sidekick');
    await page.getByLabel('What do you want to check?').selectOption('compare');
    const picker = page.getByRole('group', { name: 'Players competing for one spot choices' });
    const analyze = page.getByRole('button', { name: 'Analyze my choices', exact: true });
    await expect(analyze).toBeDisabled();
    await picker.getByRole('checkbox', { name: /Blake Receiver/ }).check();
    await expect(analyze).toBeDisabled();
    await picker.getByRole('checkbox', { name: /Alex Quarterback/ }).check();
    await expect(
      page.getByText('Choose players who share a starting spot in your league', { exact: false }),
    ).toBeVisible();
    await expect(analyze).toBeDisabled();
    await picker.getByRole('checkbox', { name: /Alex Quarterback/ }).uncheck();
    await picker.getByRole('checkbox', { name: /Harper Receiver/ }).check();
    await expect(analyze).toBeEnabled();
    await analyze.click();
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(result).toContainText('Start for this spot: Harper Receiver');
    await expect(
      result.getByRole('region', { name: 'One starting spot comparison' }),
    ).toContainText('Shared spots: Wide receiver');
    await expect(result).toContainText('weekly estimate of 16 points');
    await expect(result).toContainText('weekly estimate of 22 points');
    await expect(
      result.getByRole('heading', { name: 'Supported starting lineup', exact: true }),
    ).toHaveCount(0);
    await expect(result).not.toContainText('More evidence needed');
    const title = result.getByRole('heading', {
      name: 'Compare the fictional choices before acting',
      exact: true,
    });
    const titleBox = await title.boundingBox();
    expect(titleBox!.y).toBeGreaterThanOrEqual(0);
    expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.screenshot({ path: info.outputPath('one-spot-comparison.png') });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.reload();
    await expect(result).toContainText('Start for this spot: Harper Receiver');
    expect(workspace.store.snapshot().adviceResults[0]!.startSit?.candidateIds).toEqual([
      'w1',
      'w3',
    ]);
    expect(workspace.store.snapshot().settings).toEqual(before);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('focused start/sit help is searchable and opens the matching advice mode', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await seedAdvice(workspace.store);
    await page.goto(`${workspace.url}/#/help`);
    await page.getByLabel('Find a help answer').fill('one starting spot');
    const article = page.locator('#help-advice-start-sit');
    await article.locator('summary').click();
    await expect(article).toContainText('Missing estimates for unrelated players do not block');
    await article.getByRole('button', { name: 'Compare start / sit', exact: true }).click();
    await expect(page).toHaveURL(/mode=lineup/);
    await expect(page.getByLabel('What do you want to check?')).toBeVisible();
  } finally {
    await workspace.close();
  }
});
