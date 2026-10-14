import { footballStatKeys } from '@sidekick/core';
import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { adviceData, seedAdvice } from './advice-fixture';

test('defense comparison joins team identities, shows league-scored numbers and saves with source closure', async ({
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
      const league = state.leagues[0]!;
      league.settings.roster_positions = ['QB', 'WR', 'RB', 'K', 'DEF', 'BN'];
      Object.assign(league.scoring, {
        sack: 1,
        int: 2,
        fum_rec: 2,
        def_td: 6,
        def_st_td: 6,
        safe: 2,
        blk_kick: 2,
        pts_allow_7_13: 4,
        pts_allow_14_20: 1,
      });
      league.teams[0]!.roster!.push(
        { id: 'BUF', name: 'Buffalo Team Defense', position: 'DEF', nflTeam: 'BUF' },
        { id: 'MIA', name: 'Miami Team Defense', position: 'DEF', nflTeam: 'MIA' },
      );
      league.teams[0]!.rosterSize = league.teams[0]!.roster!.length;
    });
    const data = adviceData();
    const date = data.sources[0]!.retrievedAt!;
    for (const game of data.games.filter((g) => g.homeScore !== undefined)) {
      const source = `dst-${game.season}-${game.week}`;
      data.sources.push({
        id: source,
        name: 'Fictional published D/ST week',
        status: 'available',
        retrievedAt: date,
        url: 'https://example.test/defense',
      });
      for (const [i, team] of ['BUF', 'MIA'].entries())
        data.players.push({
          playerId: `dst:${team}`,
          name: `${team} team defense`,
          position: 'DST',
          team,
          opponent: team === 'BUF' ? 'MIA' : 'BUF',
          gameId: game.id,
          season: game.season,
          week: game.week,
          seasonType: 'REG',
          sourceIds: [source],
          stats: {
            dst_sacks: i === 0 ? 4 : 3,
            dst_interceptions: 1,
            dst_fumble_recoveries: 0,
            dst_touchdowns: 0,
            dst_special_teams_touchdowns: 0,
            dst_safeties: 0,
            dst_blocked_kicks: 0,
            dst_points_allowed: i === 0 ? 13 : 20,
            dst_yards_allowed: i === 0 ? 254 : 330,
          },
        });
    }
    workspace.setAdviceFootballData(data);
    const settings = workspace.store.settingsSnapshot();
    await page.goto(`${workspace.url}/#/advice?league=browser-league&mode=lineup`);
    await expect(page).toHaveTitle('Sunday Sidekick');
    await page.getByLabel('What do you want to check?').selectOption('compare');
    const picker = page.getByRole('group', { name: 'Players competing for one spot choices' });
    await picker.getByRole('checkbox', { name: /Buffalo Team Defense/ }).check();
    await picker.getByRole('checkbox', { name: /Miami Team Defense/ }).check();
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(result).toContainText('Start for this spot: Buffalo Team Defense');
    await expect(result).toContainText('Shared spots: Team defense');
    await expect(result).toContainText('weekly estimate of 10 points');
    await expect(result).toContainText('weekly estimate of 6 points');
    await page.screenshot({ path: info.outputPath('defense-comparison.png') });
    const firstNumber = result.getByText(/weekly estimate of 10 points/);
    await firstNumber.evaluate((el) =>
      window.scrollTo({
        top: window.scrollY + el.getBoundingClientRect().top - 180,
        behavior: 'instant',
      }),
    );
    await expect(firstNumber).toBeInViewport();
    await page.screenshot({ path: info.outputPath('defense-numbers.png') });
    const saved = workspace.store.snapshot().adviceResults[0]!;
    expect(saved.players.map((p) => p.position)).toEqual(['DST', 'DST']);
    expect(saved.players.every((p) => p.projectionMethod === 'historical-baseline')).toBe(true);
    expect(saved.players.every((p) => p.metrics.some((m) => m.id.endsWith(':dst_sacks')))).toBe(
      true,
    );
    expect(saved.sources.some((s) => s.id.startsWith('dst-'))).toBe(true);
    await page.reload();
    await expect(result).toContainText('Start for this spot: Buffalo Team Defense');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    // The complete lineup now includes both formerly missing non-offensive slots.
    await workspace.store.update((state) => {
      const league = state.leagues[0]!;
      Object.assign(league.scoring, { fgm_40_49: 4, xpm: 1 });
      league.teams[0]!.roster!.push({
        id: 'k1',
        gsisId: 'gsis-k1',
        name: 'Fictional Kicker',
        position: 'K',
        nflTeam: 'BUF',
      });
      league.teams[0]!.rosterSize = league.teams[0]!.roster!.length;
    });
    for (const game of data.games.filter((g) => g.homeScore !== undefined))
      data.players.push({
        playerId: 'gsis-k1',
        name: 'Fictional Kicker',
        position: 'K',
        team: 'BUF',
        opponent: 'MIA',
        gameId: game.id,
        season: game.season,
        week: game.week,
        seasonType: 'REG',
        stats: {
          ...Object.fromEntries(footballStatKeys.map((k) => [k, 0])),
          fg_made_40_49: 2,
          pat_made: 2,
        },
      });
    workspace.setAdviceFootballData(data);
    await page.goto(`${workspace.url}/#/advice?league=browser-league&mode=lineup`);
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    await expect(
      result.getByRole('heading', { name: 'Supported starting lineup', exact: true }),
    ).toBeVisible();
    await expect(result).toContainText('Fictional Kicker');
    await expect(result).toContainText('Buffalo Team Defense');
    const full = workspace.store.snapshot().adviceResults[0]!;
    expect(full.lineup!.complete).toBe(true);
    expect(full.lineup!.assignments).toHaveLength(5);
    expect(full.lineup!.assignments.some((a) => a.playerId === 'BUF')).toBe(true);
    expect(full.lineup!.assignments.some((a) => a.playerId === 'k1')).toBe(true);
    expect(workspace.store.settingsSnapshot()).toEqual(settings);
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});
test('defense help is linked from smart search to the actual lineup workflow', async ({ page }) => {
  const workspace = await apiWorkspace();
  try {
    await seedAdvice(workspace.store);
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Search the app', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Search settings, pages, leagues, and reports' })
      .fill('team defense');
    await page
      .getByRole('option')
      .filter({ hasText: 'Can I compare team defenses and special teams?' })
      .click();
    await expect(page).toHaveURL(/answer=advice-defense/);
    const article = page.locator('#help-advice-defense');
    await expect(article).toContainText('conversion afterward still counts');
    await article.getByRole('button', { name: 'Compare defenses' }).click();
    await expect(page).toHaveURL(/mode=lineup/);
    await expect(page.getByLabel('What do you want to check?')).toBeVisible();
  } finally {
    await workspace.close();
  }
});
