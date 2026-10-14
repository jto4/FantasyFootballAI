import { test, expect, type Page } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { seedAdvice } from './advice-fixture';

async function trade(page: Page, url: string, throughWeek = 18) {
  await page.goto(`${url}/#/advice?league=browser-league&mode=trade`);
  await page
    .getByRole('spinbutton', { name: /Count remaining value through NFL week/ })
    .fill(String(throughWeek));
  await expect(page).toHaveTitle('Sunday Sidekick');
  await page.getByRole('checkbox', { name: /Blake Receiver/ }).check();
  await page.getByRole('checkbox', { name: /Ellis Receiver/ }).check();
  await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Advice result' })).toBeVisible();
}
test('search explains remaining trade projections and links directly to Imports', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await seedAdvice(workspace.store);
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Search the app', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'What are you looking for?' })
      .getByRole('combobox')
      .fill('remaining season projections');
    await page
      .getByRole('option')
      .filter({ hasText: 'How are remaining-season trade points estimated?' })
      .click();
    const article = page.locator('#help-advice-trade-projections');
    await expect(article).toHaveAttribute('open', '');
    await expect(article).toContainText('fromWeek 5 and throughWeek 17');
    await article.getByRole('button', { name: 'Import projections', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Import player projections', exact: true }),
    ).toBeVisible();
    expect(workspace.adviceCalls).toHaveLength(0);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});
test('full-season values cannot produce a remaining trade gain or supported pick', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await seedAdvice(workspace.store);
    await workspace.store.update((state) => {
      state.playerProjections = state.playerProjections.filter((row) => !row.period);
    });
    await trade(page, workspace.url);
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(
      result.getByRole('heading', { name: 'More evidence is needed before choosing', exact: true }),
    ).toBeVisible();
    await result.locator('summary').filter({ hasText: 'Data gaps & limitations' }).click();
    await expect(result).toContainText('Full-season points include already-played production');
    expect(
      workspace.store
        .snapshot()
        .adviceResults![0]!.metrics.some((metric) => metric.id === 'trade-gain'),
    ).toBe(false);
    const saved = workspace.store.snapshot().adviceResults![0]!;
    expect(saved.assessment.verdict).toBe('insufficient');
    expect(saved.assessment.recommendedPlayerIds).toEqual([]);
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});
test('CSV import declares remaining weeks and the saved trade shows future value despite opposite full-season totals', async ({
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
      state.playerProjections = state.playerProjections.filter((row) => !row.period);
      for (const row of state.playerProjections) {
        if (row.week !== undefined) continue;
        if (row.playerId === 'w1') row.projectedPoints = 600;
        if (row.playerId === 'w2') row.projectedPoints = 300;
      }
    });
    await page.goto(`${workspace.url}/#/imports`);
    await page
      .getByRole('textbox', { name: 'PROJECTION SOURCE', exact: true })
      .fill('Fictional remaining forecast');
    await page.getByLabel('PROJECTION CSV', { exact: true }).setInputFiles({
      name: 'remaining.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'player,playerId,position,projectedPoints,season,fromWeek,throughWeek\nAlex Quarterback,q1,QB,200,2026,5,17\nBlake Receiver,w1,WR,80,2026,5,17\nCasey Runner,r1,RB,120,2026,5,17\nEllis Receiver,w2,WR,150,2026,5,17',
      ),
    });
    await page.getByRole('checkbox', { name: /These projected points match this league/ }).check();
    await page.getByRole('button', { name: 'Import projections', exact: false }).click();
    const source = page.locator('.memory-help').filter({ hasText: 'Fictional remaining forecast' });
    await expect(source).toContainText('Projection periods: 2026, weeks 5–17');
    await source.scrollIntoViewIfNeeded();
    expect(await page.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('remaining-import.png') });
    await trade(page, workspace.url, 17);
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(result).toBeVisible();
    await result.getByText('Numbers & comparisons', { exact: true }).click();
    await expect(result).toContainText('400 estimated remaining points');
    await expect(result).toContainText('470 estimated remaining points');
    await expect(result).toContainText('Remaining starting-slot estimate change');
    const saved = workspace.store.snapshot().adviceResults![0]!;
    expect(saved.request.throughWeek).toBe(17);
    expect(saved.metrics.find((metric) => metric.id === 'trade-gain')!.value).toBe(70);
    expect(
      saved.players.every(
        (player) =>
          player.projectionPeriod?.fromWeek === 5 &&
          player.projectionPeriod.throughWeek === 17 &&
          player.projectionScope === 'remaining-season',
      ),
    ).toBe(true);
    await result
      .getByRole('heading', { name: 'Before the trade', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('remaining-trade.png') });
    await page.reload();
    await expect(result).toContainText('470 estimated remaining points');
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.sends).toHaveLength(0);
    expect(workspace.credentialWrites).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});
