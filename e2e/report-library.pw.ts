import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';

test('default report plan is reviewable, league-scoped and draft-only', async ({ page }, info) => {
  const workspace = await apiWorkspace();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const before = workspace.store.settingsSnapshot();
    await page.goto(`${workspace.url}/#/reports?league=browser-league`);
    await expect(page).toHaveTitle(/Sunday Sidekick/);
    const library = page.getByRole('region', { name: 'Default report library' });
    await expect(
      library.getByRole('heading', { name: 'Power rankings', exact: true }),
    ).toBeVisible();
    await expect(library.getByRole('heading', { name: 'Draft review', exact: true })).toBeHidden();
    await library.getByRole('button', { name: 'Set up weekly drafts' }).click();
    const dialog = page.getByRole('dialog', { name: 'A week of league reports' });
    await expect(dialog).toContainText('Tuesday · Power rankings');
    await expect(dialog).toContainText('Wednesday · Matchup preview');
    await expect(dialog).toContainText('replaces the time, league scope, and delivery policy');
    expect(workspace.store.settingsSnapshot()).toEqual(before);
    await dialog.getByRole('button', { name: 'Enable weekly drafts', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(library).toContainText('Weekly drafts enabled for Real API League');
    const after = workspace.store.settingsSnapshot();
    for (const kind of ['power-rankings', 'matchup-preview']) {
      expect(after.actions.find((a) => a.kind === kind)).toMatchObject({
        enabled: true,
        channel: 'dashboard',
        mode: 'draft',
        leagueIds: ['browser-league'],
        schedule: {
          enabled: true,
          frequency: 'weekly',
          time: '09:00',
          weekday: kind === 'power-rankings' ? 2 : 3,
        },
      });
    }
    expect(
      after.actions.filter((a) => !['power-rankings', 'matchup-preview'].includes(a.kind)),
    ).toEqual(
      before.actions.filter((a) => !['power-rankings', 'matchup-preview'].includes(a.kind)),
    );
    expect(after.emailRecipient).toBe(before.emailRecipient);
    expect(workspace.generations()).toBe(0);
    expect(workspace.sends).toHaveLength(0);
    await library.getByText('Draft & offseason reports', { exact: true }).click();
    await library.getByRole('button', { name: 'Auto-generate draft review', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Schedule draft review' });
    await expect(editor).toContainText('The report library filled in a proposed schedule');
    await expect(editor.getByRole('combobox', { name: /frequency/i })).toHaveValue('once');
    await page.screenshot({ path: info.outputPath('report-automation.png') });
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await workspace.close();
  }
});

test('charts use recorded league values and saved reports keep their original evidence', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await workspace.store.update((state) => {
      const league = state.leagues[0]!;
      league.matchups = [
        {
          week: 2,
          teams: [
            { teamId: '1', points: 999 },
            { teamId: '2', points: 888 },
          ],
        },
        {
          week: 3,
          teams: [
            { teamId: '1', points: 0 },
            { teamId: '2', points: 52.3 },
          ],
        },
      ];
    });
    await page.goto(`${workspace.url}/#/reports?league=browser-league`);
    await page.getByRole('button', { name: 'League charts', exact: true }).click();
    const chart = page.getByRole('region', { name: 'League at a glance' });
    await expect(chart.getByRole('img', { name: /Season points for:/ })).toHaveAccessibleName(
      'Season points for: Team One 220.00; Team Two 180.00',
    );
    await expect(chart.getByRole('img', { name: /Week 3 matchup/ })).toHaveAccessibleName(
      'Week 3 matchup 1: Team One 0.00; Team Two 52.30',
    );
    await chart.getByRole('button', { name: 'Wins', exact: true }).click();
    await expect(chart.getByRole('img', { name: /Recorded wins:/ })).toHaveAccessibleName(
      'Recorded wins: Team One 2; Team Two 1',
    );
    await chart.getByText('View chart data', { exact: true }).click();
    await expect(chart.getByRole('table')).toContainText('220.00');
    await page.screenshot({ path: info.outputPath('league-charts.png') });
    await page
      .getByRole('navigation', { name: 'Reports workspace' })
      .getByRole('button', { name: 'Reports & drafts', exact: true })
      .click();
    await page.getByRole('button', { name: 'Create power rankings', exact: true }).click();
    const composer = page.getByRole('dialog', { name: 'Create a report' });
    await composer.getByRole('button', { name: 'Create draft', exact: true }).click();
    await expect.poll(() => workspace.store.snapshot().reports.length).toBe(1);
    const report = workspace.store.snapshot().reports[0]!;
    expect(report.evidence?.visuals?.teams[0]!.pointsFor).toBe(220);
    await workspace.store.update((state) => {
      state.leagues[0]!.teams[0]!.pointsFor = 9999;
    });
    await page.goto(`${workspace.url}/#/reports?league=browser-league&report=${report.id}`);
    const review = page.getByRole('dialog', { name: 'Review report' });
    await expect(review).toBeVisible();
    await review.getByText('Explore the report’s chart snapshot', { exact: true }).click();
    const frozen = review.getByRole('region', { name: 'Report data snapshot' });
    await expect(frozen.getByRole('img', { name: /Season points for:/ })).toHaveAccessibleName(
      'Season points for: Team One 220.00; Team Two 180.00',
    );
    await expect(frozen).toContainText('stays fixed when your league refreshes');
    await page.screenshot({ path: info.outputPath('report-chart-snapshot.png') });
    await review.getByRole('button', { name: 'Close report review' }).click();
    await page.getByRole('button', { name: 'League charts', exact: true }).click();
    await expect(chart.getByRole('img', { name: /Season points for:/ })).toHaveAccessibleName(
      'Season points for: Team One 9999.00; Team Two 180.00',
    );
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await workspace.close();
  }
});

test('incomplete scores stay unavailable and schedule conflicts do not overwrite another window', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await workspace.store.update((state) => {
      delete state.leagues[0]!.teams[1]!.pointsFor;
      state.leagues[0]!.matchups = [
        { week: 3, teams: [{ teamId: '1', points: 20 }, { teamId: '2' }] },
      ];
    });
    await page.goto(`${workspace.url}/#/reports?league=browser-league`);
    await page.getByRole('button', { name: 'League charts', exact: true }).click();
    const chart = page.getByRole('region', { name: 'League at a glance' });
    await expect(chart).toContainText('A complete points-for total for every team is needed');
    await expect(chart).toContainText('Score unavailable');
    await expect(chart.getByRole('img')).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Reports workspace' })
      .getByRole('button', { name: 'Reports & drafts', exact: true })
      .click();
    await page.getByRole('button', { name: 'Set up weekly drafts' }).click();
    await workspace.store.update((state) => {
      state.settings.sectionRevisions = {
        ...state.settings.sectionRevisions,
        schedules: (state.settings.sectionRevisions?.schedules ?? 0) + 1,
      };
      state.settings.actions.find((action) => action.kind === 'power-rankings')!.schedule.time =
        '13:45';
    });
    await page.getByRole('button', { name: 'Enable weekly drafts', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Couldn’t enable this plan');
    expect(
      workspace.store.settingsSnapshot().actions.find((a) => a.kind === 'power-rankings')!.schedule
        .time,
    ).toBe('13:45');
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});

test('larger leagues stay compact and charts remain readable in black mode at narrow widths', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 780 });
    await workspace.store.update((state) => {
      const league = state.leagues[0]!;
      league.teamCount = 12;
      league.teams = Array.from({ length: 12 }, (_, index) => ({
        id: String(index),
        name: `Fictional Team ${index + 1} with a long football name`,
        wins: index % 4,
        losses: 3 - (index % 4),
        pointsFor: index === 0 ? -2 : index * 22,
      }));
      league.matchups = Array.from({ length: 6 }, (_, index) => ({
        week: 3,
        teams: [
          { teamId: String(index * 2), points: index * 25 },
          { teamId: String(index * 2 + 1), points: index * 12.5 },
        ],
      }));
    });
    await page.goto(`${workspace.url}/#/reports?league=browser-league`);
    await page.getByRole('button', { name: 'League charts', exact: true }).click();
    const chart = page.getByRole('region', { name: 'League at a glance' });
    await expect(chart.locator('.visual-panel').first().locator('.chart-row')).toHaveCount(6);
    await expect(chart.locator('.matchup-visual')).toHaveCount(3);
    await chart.getByRole('button', { name: 'Show all 12 teams', exact: true }).click();
    await expect(chart.locator('.visual-panel').first().locator('.chart-row')).toHaveCount(12);
    await expect(chart.locator('.matchup-visual')).toHaveCount(3);
    await expect(chart.getByRole('img', { name: /Season points for/ })).toHaveAccessibleName(
      /Fictional Team 1 with a long football name -2.00/,
    );
    await chart.getByRole('button', { name: 'Show all 6 matchups', exact: true }).click();
    await expect(chart.locator('.matchup-visual')).toHaveCount(6);
    await chart.getByRole('button', { name: 'Show top six', exact: true }).click();
    await chart.getByRole('button', { name: 'Show fewer matchups', exact: true }).click();
    if (info.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Storage & desktop', exact: true }).click();
      await page.getByRole('radio', { name: 'Dark', exact: true }).check();
      await page.getByRole('button', { name: 'Reports', exact: true }).click();
      await page.getByRole('button', { name: 'League charts', exact: true }).click();
    } else {
      await page.getByRole('switch', { name: 'Dark mode', exact: true }).click();
    }
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
      ),
    ).toBe('#000000');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('league-charts-dark.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});
