import { expect, test } from '@playwright/test';
import { footballStatKeys } from '@sidekick/core';
import { apiWorkspace } from './api-fixture';
import { adviceCatalog, automaticAdviceData, seedAdvice } from './advice-fixture';

for (const mode of ['waivers', 'trade'] as const)
  test(`${mode} shows a rookie public forecast without NFL history, saves the numbers and leaves settings alone`, async ({
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
      const catalog = new Map([...adviceCatalog].map(([id, player]) => [id, { ...player }]));
      catalog.get('w3')!.espnId = '12345';
      catalog.get('w2')!.espnId = '54321';
      const data = automaticAdviceData();
      data.players = data.players.filter((row) => row.name !== 'Harper Receiver');
      const source = 'espn-forecasts-2026-0';
      data.sources.push({
        id: source,
        name: 'Fictional ESPN weekly forecasts',
        status: 'available',
        retrievedAt: data.sources[0]!.retrievedAt!,
      });
      data.playerForecasts = [];
      for (const id of ['w3', 'w2'])
        for (let week = 1; week <= 18; week++) {
          const player = catalog.get(id)!;
          data.playerForecasts.push({
            espnId: player.espnId!,
            name: player.name,
            position: 'WR',
            team: player.nflTeam!,
            season: 2026,
            week,
            issuedWeek: 5,
            sourceId: source,
            stats: {
              ...Object.fromEntries(
                footballStatKeys
                  .filter((key) => !key.endsWith('first_downs'))
                  .map((key) => [key, 0]),
              ),
              receptions: id === 'w3' ? 5 : 4,
              receiving_yards: id === 'w3' ? 70 : 50,
              targets: id === 'w3' ? 8 : 6,
            },
          });
        }
      await workspace.store.update((state) => {
        state.playerProjections = [];
        if (mode === 'trade') {
          const team = state.leagues.find((league) => league.id === 'browser-league')!.teams[0]!;
          team.roster = team.roster!.map((player) =>
            player.id === 'w1' ? { ...catalog.get('w3')! } : player,
          );
        }
      });
      workspace.setAdviceCatalog(catalog);
      workspace.setAdviceFootballData(data);
      const before = workspace.store.settingsSnapshot();
      await page.goto(`${workspace.url}/#/advice?league=browser-league&mode=${mode}`);
      await expect(page).toHaveTitle('Sunday Sidekick');
      if (mode === 'trade') {
        await page
          .getByRole('spinbutton', { name: /Count remaining value through NFL week/ })
          .fill('17');
        await page.getByRole('checkbox', { name: /Harper Receiver/ }).check();
        await page.getByRole('checkbox', { name: /Ellis Receiver/ }).check();
      } else {
        await page.getByRole('searchbox', { name: 'Players to compare (optional)' }).fill('Harper');
        await page.getByRole('checkbox', { name: /Harper Receiver/ }).check();
      }
      await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
      const result = page.getByRole('article', { name: 'Advice result' });
      await expect(result).toBeVisible();
      if (!(await result.locator('.result-numbers').evaluate((el: HTMLDetailsElement) => el.open)))
        await result.getByText('Numbers & comparisons', { exact: true }).click();
      const details = result
        .locator('.advice-player-evidence > details')
        .filter({ has: page.locator('summary').filter({ hasText: 'Harper Receiver' }) });
      await details.locator('summary').click();
      await expect(details).toContainText('public weekly forecast · your league scoring');
      await expect(details).toContainText(
        mode === 'trade' ? 'Estimate: 144 remaining points' : 'Estimate: 12 weekly points',
      );
      await expect(details).toContainText('Projected receiving yards');
      await expect(details).toContainText('not the publisher’s last update');
      await details
        .getByRole('row')
        .filter({ hasText: 'Projected receiving yards' })
        .scrollIntoViewIfNeeded();
      expect(await result.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`public-${mode}-forecast.png`) });
      const saved = workspace.store.snapshot().adviceResults[0]!;
      const rookie = saved.players.find((player) => player.id === 'w3')!;
      expect(rookie.historicalPoints).toEqual([]);
      expect(rookie.projectionMethod).toBe('public-projection-v1');
      expect(rookie.projectedPoints).toBe(mode === 'trade' ? 144 : 12);
      expect(rookie.metrics.find((metric) => metric.id === 'w3:forecast-recorded')!.value).toBe(0);
      expect(rookie.metrics.find((metric) => metric.id === 'w3:forecast-games')!.value).toBe(
        mode === 'trade' ? 12 : 1,
      );
      expect(saved.assessment.verdict).toBe('lean');
      expect(saved.confidence.score).toBeLessThanOrEqual(69);
      expect(saved.sources.some((s) => s.id === source)).toBe(true);
      expect(workspace.adviceCalls).toHaveLength(2);
      expect(
        workspace.adviceCalls.every(
          (call) =>
            call.prompt.includes('public-projection-v1') && call.prompt.includes('forecast-future'),
        ),
      ).toBe(true);
      await page.reload();
      await expect(result).toBeVisible();
      if (!(await result.locator('.result-numbers').evaluate((el: HTMLDetailsElement) => el.open)))
        await result.getByText('Numbers & comparisons', { exact: true }).click();
      await details.locator('summary').click();
      await expect(details).toContainText('public weekly forecast · your league scoring');
      expect(workspace.adviceCalls).toHaveLength(2);
      expect(workspace.store.settingsSnapshot()).toEqual(before);
      expect(workspace.credentialWrites).toHaveLength(0);
      expect(workspace.sends).toHaveLength(0);
      expect(errors).toEqual([]);
    } finally {
      await workspace.close();
    }
  });

test('public forecast guidance is searchable and opens Advice', async ({ page }) => {
  const workspace = await apiWorkspace();
  try {
    await page.goto(`${workspace.url}/#/home`);
    await page.getByRole('button', { name: 'Search the app', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Search settings, pages, leagues, and reports' })
      .fill('ESPN public weekly forecasts');
    await page
      .getByRole('option')
      .filter({ hasText: 'Where do public player forecasts come from?' })
      .click();
    const article = page.locator('#help-advice-public-forecasts');
    await expect(article).toContainText('including rookies without NFL history');
    await article.getByRole('button', { name: 'Compare players in Advice', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Advice', exact: true })).toBeVisible();
    expect(workspace.adviceCalls).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});
