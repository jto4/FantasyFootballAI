import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';

test('historical public standings keep fractional precision and clearly identify their season', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    const source = JSON.parse(
      await readFile(
        new URL(
          '../packages/integrations/src/fixtures/sleeper-public-sample.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await workspace.store.update((state) => {
      const league = state.leagues[0]!;
      league.name = league.displayName = 'Sanitized 2018 public archive';
      league.season = Number(source.league.season);
      league.teamCount = source.rosters.length;
      league.settings = { seasonStatus: 'complete' };
      league.lastSyncedAt = source.provenance.capturedAt;
      league.teams = source.rosters.map(
        (row: {
          roster_id: number;
          settings: { wins: number; losses: number; fpts: number; fpts_decimal: number };
        }) => ({
          id: String(row.roster_id),
          name: `Team ${row.roster_id}`,
          wins: row.settings.wins,
          losses: row.settings.losses,
          pointsFor: row.settings.fpts + row.settings.fpts_decimal / 100,
        }),
      );
    });
    await page.goto(`${workspace.url}/#/reports?league=browser-league`);
    await page.getByRole('button', { name: 'League charts', exact: true }).click();
    const charts = page.getByRole('region', { name: 'League at a glance' });
    await expect(charts).toContainText('2018 season');
    await expect(charts.getByRole('img', { name: /Season points for/ })).toHaveAccessibleName(
      /Team 1 1776.06/,
    );
    await charts.getByRole('button', { name: 'Show all 12 teams', exact: true }).click();
    await expect(charts.getByRole('img', { name: /Season points for/ })).toHaveAccessibleName(
      /Team 6 1899.78/,
    );
    await charts.getByRole('button', { name: 'Wins', exact: true }).click();
    await expect(charts.getByRole('img', { name: /Recorded wins/ })).toHaveAccessibleName(
      /Team 6 11;/,
    );
    await charts.getByText('View chart data', { exact: true }).click();
    await expect(
      charts.getByRole('row', { name: 'Team 1 7 6 1776.06', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('public-standings-precision.png') });
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});
