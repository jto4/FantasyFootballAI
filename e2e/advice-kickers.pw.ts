import { test, expect } from '@playwright/test';
import { footballStatKeys } from '@sidekick/core';
import { apiWorkspace } from './api-fixture';
import { adviceData, seedAdvice } from './advice-fixture';

test('kicker start/sit uses automatic league scores, shows both alternatives and persists', async ({
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
    const kickers = [
      { id: 'k1', gsisId: 'gsis-k1', name: 'Morgan Kicker', position: 'K', nflTeam: 'BUF' },
      { id: 'k2', gsisId: 'gsis-k2', name: 'Nico Kicker', position: 'K', nflTeam: 'MIA' },
    ];
    await workspace.store.update((state) => {
      const league = state.leagues[0]!;
      league.settings.roster_positions = ['QB', 'WR', 'RB', 'K', 'DST', 'BN'];
      Object.assign(league.scoring, {
        fgm_40_49: 4,
        xpm: 1,
        fgmiss: -1,
        fgmiss_30_39: -1,
        xpmiss: -1,
      });
      league.teams[0]!.roster!.push(...kickers);
      league.teams[0]!.rosterSize = league.teams[0]!.roster!.length;
    });
    const data = adviceData();
    for (const game of data.games.filter((game) => game.homeScore !== undefined))
      for (const [index, player] of kickers.entries()) {
        const made = index === 0 ? 3 : 2;
        data.players.push({
          playerId: player.gsisId,
          name: player.name,
          position: 'K',
          team: player.nflTeam,
          opponent: player.nflTeam === 'BUF' ? 'MIA' : 'BUF',
          gameId: game.id,
          season: game.season,
          week: game.week,
          seasonType: 'REG',
          madeFieldGoalDistances: Array.from({ length: made }, () => 43),
          blockedFieldGoalDistances: [36],
          stats: {
            ...Object.fromEntries(footballStatKeys.map((key) => [key, 0])),
            fg_made: made,
            fg_att: made + 1,
            fg_made_40_49: made,
            fg_made_distance: made * 43,
            fg_blocked: 1,
            pat_made: 2,
            pat_att: 3,
            pat_blocked: 1,
          },
        });
      }
    workspace.setAdviceFootballData(data);
    const settings = workspace.store.settingsSnapshot();
    await page.goto(`${workspace.url}/#/advice?league=browser-league&mode=lineup`);
    await expect(page).toHaveTitle('Sunday Sidekick');
    await page.getByLabel('What do you want to check?').selectOption('compare');
    const picker = page.getByRole('group', { name: 'Players competing for one spot choices' });
    await picker.getByRole('checkbox', { name: /Morgan Kicker/ }).check();
    await picker.getByRole('checkbox', { name: /Nico Kicker/ }).check();
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(result).toContainText('Start for this spot: Morgan Kicker');
    await expect(result).toContainText('Shared spots: Kicker');
    await expect(result).toContainText('weekly estimate of 11 points');
    await expect(result).toContainText('weekly estimate of 7 points');
    await page.screenshot({ path: info.outputPath('kicker-comparison.png') });
    await result
      .getByText(/This alternative has a weekly estimate of 11 points/)
      .first()
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('kicker-numbers.png') });
    const saved = workspace.store.snapshot().adviceResults[0]!;
    expect(saved.players.map((p) => p.projectionMethod)).toEqual([
      'historical-baseline',
      'historical-baseline',
    ]);
    expect(saved.players.map((p) => p.projectedPoints).sort((a, b) => a! - b!)).toEqual([7, 11]);
    expect(
      saved.players.every((p) => p.warnings.some((warning) => warning.includes('weather'))),
    ).toBe(true);
    await page.reload();
    await expect(result).toContainText('Start for this spot: Morgan Kicker');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(workspace.store.settingsSnapshot()).toEqual(settings);
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('kicker help is searchable and opens the actual lineup page', async ({ page }, info) => {
  const workspace = await apiWorkspace();
  try {
    await seedAdvice(workspace.store);
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Search the app', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Search settings, pages, leagues, and reports' })
      .fill('kicker');
    await page
      .getByRole('option')
      .filter({ hasText: 'Can I compare kickers using my league’s scoring?' })
      .click();
    await expect(page).toHaveURL(/answer=advice-kickers/);
    const article = page.locator('#help-advice-kickers');
    await expect(article).toContainText('missed kicks including blocks');
    await expect(article).toContainText('See the team-defense help answer');
    await article.getByRole('button', { name: 'Compare kickers' }).click();
    await expect(page).toHaveURL(/mode=lineup/);
    await expect(page.getByLabel('What do you want to check?')).toBeVisible();
    await page.screenshot({ path: info.outputPath('kicker-help-destination.png') });
  } finally {
    await workspace.close();
  }
});
