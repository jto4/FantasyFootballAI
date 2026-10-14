import { expect, test } from '@playwright/test';
import { footballStatKeys } from '@sidekick/core';
import { apiWorkspace } from './api-fixture';
import { adviceCatalog, adviceData, seedAdvice } from './advice-fixture';

function rookieData() {
  const catalog = new Map([...adviceCatalog].map(([id, p]) => [id, { ...p }]));
  catalog.get('w3')!.gsisId = '00-0040999';
  const data = adviceData();
  const date = data.sources[0]!.retrievedAt!;
  data.players = data.players.filter((p) => p.name !== 'Harper Receiver');
  data.draftPicks = [
    {
      gsisId: '00-0040999',
      pfrId: 'HarpRe00',
      name: 'Harper Receiver',
      position: 'WR',
      season: 2026,
      round: 1,
      pick: 20,
      draftTeam: 'ATL',
      college: 'Fictional College',
    },
  ];
  for (const id of ['nfl-draft-picks', 'stats-2024', 'stats-2025'])
    data.sources.push({
      id,
      name: `Fictional ${id}`,
      status: 'available',
      retrievedAt: date,
      url: 'https://example.test/rookies',
    });
  for (const season of [2024, 2025]) {
    for (const week of [1, 2, 3, 4])
      data.games.push({
        id: `rookie-${season}-${week}`,
        season,
        week,
        seasonType: 'REG',
        date: `${season}-09-${10 + week}`,
        home: 'BUF',
        away: 'MIA',
        homeScore: 20,
        awayScore: 10,
      });
    for (let i = 0; i < 4; i++) {
      const index = (season - 2024) * 4 + i,
        id = `00-00401${String(index).padStart(2, '0')}`;
      data.draftPicks.push({
        gsisId: id,
        pfrId: `CompRe${index}0`,
        name: `Comparable Receiver ${index}`,
        position: 'WR',
        season,
        round: 1,
        pick: 10 + i,
        draftTeam: 'BUF',
      });
      for (const week of [1, 2, 3, 4])
        data.players.push({
          playerId: id,
          name: `Comparable Receiver ${index}`,
          position: 'WR',
          team: 'BUF',
          opponent: 'MIA',
          gameId: `rookie-${season}-${week}`,
          season,
          week,
          seasonType: 'REG',
          stats: {
            ...Object.fromEntries(footballStatKeys.map((k) => [k, 0])),
            receptions: 2,
            receiving_yards: 50 + index * 10,
          },
        });
    }
  }
  return { data, catalog };
}

test('rookie draft facts and comparable outcomes remain separate from imported points through save and reload', async ({
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
    const { data, catalog } = rookieData();
    workspace.setAdviceCatalog(catalog);
    workspace.setAdviceFootballData(data);
    const before = workspace.store.settingsSnapshot();
    await page.goto(`${workspace.url}/#/advice?league=browser-league&mode=draft-plan`);
    await expect(page).toHaveTitle('Sunday Sidekick');
    await page.getByRole('searchbox', { name: 'Players to compare (optional)' }).fill('Harper');
    await page.getByRole('checkbox', { name: /Harper Receiver/ }).check();
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(result).toBeVisible();
    if (!(await result.locator('.result-numbers').evaluate((el: HTMLDetailsElement) => el.open)))
      await result.getByText('Numbers & comparisons', { exact: true }).click();
    const details = result
      .locator('.advice-player-evidence > details')
      .filter({ has: page.locator('summary').filter({ hasText: 'Harper Receiver' }) });
    await details.locator('summary').click();
    const background = details.getByRole('region', {
      name: 'Harper Receiver NFL draft background',
    });
    await expect(background).toContainText(
      'NFL draft: 2026 · Round 1 · Overall pick 20 · Fictional College',
    );
    await expect(details).toContainText('Estimate: 460 full-season points');
    await expect(
      details.getByRole('row').filter({ hasText: 'NFL draft year' }).getByRole('cell').first(),
    ).toHaveText('Value: 2026');
    await expect(
      details.getByRole('row').filter({ hasText: 'Comparable rookie scoring average' }),
    ).toContainText('10.5');
    await expect(details).toContainText('selection favors players who earned appearances');
    await background.scrollIntoViewIfNeeded();
    expect(await result.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('rookie-evidence.png') });
    const saved = workspace.store.snapshot().adviceResults[0]!;
    const rookie = saved.players.find((p) => p.id === 'w3')!;
    expect(rookie.projectedPoints).toBe(460);
    expect(rookie.historicalPoints).toEqual([]);
    expect(rookie.draftProfile?.pick).toBe(20);
    expect(rookie.team).toBe('BUF');
    expect(saved.sources.some((s) => s.id === 'nfl-draft-picks')).toBe(true);
    expect(workspace.adviceCalls).toHaveLength(2);
    await page.reload();
    await expect(result).toBeVisible();
    if (!(await result.locator('.result-numbers').evaluate((el: HTMLDetailsElement) => el.open)))
      await result.getByText('Numbers & comparisons', { exact: true }).click();
    await details.locator('summary').click();
    await expect(background).toContainText('Overall pick 20');
    expect(workspace.store.settingsSnapshot()).toEqual(before);
    expect(workspace.sends).toHaveLength(0);
    expect(workspace.credentialWrites).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('rookie guidance is searchable and opens projection imports', async ({ page }) => {
  const workspace = await apiWorkspace();
  try {
    await page.goto(`${workspace.url}/#/home`);
    await page.getByRole('button', { name: 'Search the app', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Search settings, pages, leagues, and reports' })
      .fill('rookie college NFL draft');
    await page
      .getByRole('option')
      .filter({ hasText: 'Can Advice compare rookies without NFL history?' })
      .click();
    const article = page.locator('#help-advice-rookies');
    await expect(article).toContainText('not this rookie’s forecast');
    await article.getByRole('button', { name: 'Add rookie projections', exact: true }).click();
    await expect(page).toHaveURL(/#\/imports/);
    await expect(
      page.getByRole('heading', { name: 'Import player projections', exact: true }),
    ).toBeVisible();
    expect(workspace.adviceCalls).toHaveLength(0);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});

test('a selected rookie without a projection keeps draft facts and explains the missing comparison', async ({
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
      state.playerProjections = state.playerProjections.filter((p) => p.playerId !== 'w3');
    });
    const { data, catalog } = rookieData();
    workspace.setAdviceCatalog(catalog);
    workspace.setAdviceFootballData(data);
    const before = workspace.store.settingsSnapshot();
    await page.goto(`${workspace.url}/#/advice?league=browser-league&mode=draft-plan`);
    await page.getByRole('searchbox', { name: 'Players to compare (optional)' }).fill('Harper');
    await page.getByRole('checkbox', { name: /Harper Receiver/ }).check();
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(result).toBeVisible();
    await result.getByText('Numbers & comparisons', { exact: true }).click();
    await expect(result).toContainText('More evidence is needed before choosing');
    const details = result
      .locator('.advice-player-evidence > details')
      .filter({ has: page.locator('summary').filter({ hasText: 'Harper Receiver' }) });
    await details.locator('summary').click();
    await expect(
      details.getByRole('region', { name: 'Harper Receiver NFL draft background' }),
    ).toContainText('Overall pick 20');
    await expect(details).not.toContainText('Estimate:');
    await expect(details).toContainText(
      'No uniquely matched, completed prior regular-season games',
    );
    await expect(
      details.getByRole('row').filter({ hasText: 'Comparable rookie scoring average' }),
    ).toContainText('10.5');
    expect(await result.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('rookie-missing-forecast.png') });
    const saved = workspace.store.snapshot().adviceResults[0]!;
    expect(saved.assessment.verdict).toBe('insufficient');
    expect(saved.assessment.recommendedPlayerIds).toEqual([]);
    const rookie = saved.players.find((p) => p.id === 'w3')!;
    expect(rookie.projectedPoints).toBeUndefined();
    expect(rookie.draftProfile?.pick).toBe(20);
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.store.settingsSnapshot()).toEqual(before);
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});
