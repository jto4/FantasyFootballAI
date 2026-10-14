import { expect, test } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { automaticAdviceData, seedAdvice, adviceData } from './advice-fixture';

test('a game that ceases to be upcoming shows an actionable error without generating or saving advice', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await seedAdvice(workspace.store);
    const data = adviceData();
    const game = data.games.find((g) => g.id === 'upcoming')!;
    game.date = '2026-10-07';
    game.kickoffAt = '2026-10-07T13:00:00Z';
    workspace.setAdviceFootballData(data);
    await page.goto(`${workspace.url}/#/advice?mode=betting`);
    await page.getByRole('combobox', { name: 'Bet type', exact: true }).selectOption('moneyline');
    await page.getByRole('combobox', { name: 'NFL game', exact: true }).selectOption(game.id);
    await page.getByLabel('American odds', { exact: true }).fill('-110');
    game.kickoffAt = '2026-10-07T11:59:00Z';
    workspace.setAdviceFootballData(data);
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Choose another game and check its current odds',
    );
    await expect(page.getByRole('article', { name: 'Advice result' })).toHaveCount(0);
    expect(workspace.adviceCalls).toHaveLength(0);
    expect(workspace.store.snapshot().adviceResults).toEqual([]);
    expect(workspace.sends).toHaveLength(0);
    expect(workspace.credentialWrites).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});

test('search explains automatic forecasts and opens Advice directly', async ({ page }) => {
  const workspace = await apiWorkspace();
  try {
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Search the app', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'What are you looking for?' })
      .getByRole('combobox')
      .fill('automatic draft forecast');
    await page
      .getByRole('option')
      .filter({ hasText: 'Can I get draft and trade estimates without importing a file?' })
      .click();
    const article = page.locator('#help-advice-automatic-projections');
    await expect(article).toHaveAttribute('open', '');
    await expect(article).toContainText('keeps a simple scoring baseline');
    await article.getByRole('button', { name: 'Open Advice', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Advice', exact: true })).toBeVisible();
    expect(workspace.adviceCalls).toHaveLength(0);
    expect(workspace.credentialWrites).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});

for (const mode of ['trade', 'draft-plan', 'draft-review'] as const)
  test(`${mode} uses automatic numerical evidence in both model passes and saved history without imported forecasts`, async ({
    page,
  }, info) => {
    const workspace = await apiWorkspace();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    try {
      if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
      await seedAdvice(workspace.store);
      await workspace.store.update((state) => {
        state.playerProjections = [];
      });
      const settings = workspace.store.settingsSnapshot();
      workspace.setAdviceFootballData(automaticAdviceData());
      await page.goto(`${workspace.url}/#/advice?league=browser-league&mode=${mode}`);
      await expect(page).toHaveTitle('Sunday Sidekick');
      await expect(page.getByRole('heading', { name: 'Advice', exact: true })).toBeVisible();
      if (mode === 'trade') {
        await expect(page.getByText(/We estimate remaining points/)).toBeVisible();
        await page
          .getByRole('spinbutton', { name: /Count remaining value through NFL week/ })
          .fill('17');
        await page.getByRole('checkbox', { name: /Blake Receiver/ }).check();
        await page.getByRole('checkbox', { name: /Ellis Receiver/ }).check();
      } else if (mode === 'draft-plan') {
        await page.getByRole('checkbox', { name: /Harper Receiver/ }).check();
      }
      await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
      const result = page.getByRole('article', { name: 'Advice result' });
      await expect(result).toBeVisible();
      if (!(await result.locator('.result-numbers').evaluate((el: HTMLDetailsElement) => el.open)))
        await result.getByText('Numbers & comparisons', { exact: true }).click();
      const saved = workspace.store.snapshot().adviceResults![0]!;
      expect(
        saved.players.every(
          (p) => p.projectedPoints !== undefined && p.projectionMethod?.startsWith('rolling-'),
        ),
      ).toBe(true);
      expect(saved.assessment.verdict).toBe('lean');
      expect(saved.confidence.score).toBeLessThanOrEqual(69);
      for (const player of saved.players) {
        const value = (suffix: string) =>
          player.metrics.find((m) => m.id === `${player.id}:forecast-${suffix}`)!.value;
        expect(player.projectedPoints).toBeCloseTo(
          value('baseline') +
            value('form') +
            value('workload') +
            value('opponent') +
            value('recorded'),
        );
        expect(value('lower')).toBeLessThanOrEqual(player.projectedPoints!);
        expect(value('upper')).toBeGreaterThanOrEqual(player.projectedPoints!);
        expect(value('test-weeks')).toBeGreaterThanOrEqual(8);
        expect(value('games')).toBe(mode === 'trade' ? 12 : 13);
        expect(value('recorded')).toBe(mode === 'trade' ? 0 : value('recorded'));
        if (mode !== 'trade') expect(value('recorded')).toBeGreaterThan(0);
        expect(player.projectionSourceIds).not.toEqual(
          expect.arrayContaining([expect.stringMatching(/^projection:/)]),
        );
      }
      for (const call of workspace.adviceCalls) {
        expect(call.prompt).toContain('forecast-lower');
        expect(call.prompt).toContain('forecast-baseline-mae');
        expect(call.system).toContain('Historical residual ranges do not quantify future injury');
      }
      expect(workspace.adviceCalls).toHaveLength(2);
      if (mode === 'trade') {
        const detail = result
          .locator('.advice-player-evidence > details')
          .filter({ has: page.locator('summary').filter({ hasText: 'Blake Receiver' }) });
        await detail.locator('summary').click();
        await expect(detail).toContainText('automatic');
        await expect(detail).toContainText('Scheduled future games');
        await expect(detail).toContainText('Forecast mean absolute error');
        await expect(detail).toContainText('Workload adjustment');
        await detail
          .getByRole('rowheader', { name: /^Automatic remaining estimate/ })
          .scrollIntoViewIfNeeded();
        expect(await result.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath('automatic-trade-evidence.png') });
      }
      await page.reload();
      await expect(result).toBeVisible();
      if (!(await result.locator('.result-numbers').evaluate((el: HTMLDetailsElement) => el.open)))
        await result.getByText('Numbers & comparisons', { exact: true }).click();
      await expect(result).toContainText('Automatic season estimates assume continued role');
      expect(workspace.store.snapshot().adviceResults![0]!.id).toBe(saved.id);
      expect(workspace.store.snapshot().playerProjections).toEqual([]);
      expect(workspace.store.settingsSnapshot()).toEqual(settings);
      expect(workspace.credentialWrites).toHaveLength(0);
      expect(workspace.sends).toHaveLength(0);
      expect(errors).toEqual([]);
    } finally {
      await workspace.close();
    }
  });
