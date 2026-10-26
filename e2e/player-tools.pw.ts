import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { adviceCatalog, seedAdvice } from './advice-fixture';

test('start/sit compares players, and a name opens the player card where he can be watched', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Desktop-first tools.');
  const workspace = await apiWorkspace();
  try {
    await seedAdvice(workspace.store);
    await workspace.store.update((state) => {
      state.leagues[0]!.teams[0]!.roster!.push({ ...adviceCatalog.get('w3')! });
      state.leagues[0]!.teams[0]!.rosterSize = 4;
    });
    // The API alone: a card for one player, and a two-player comparison.
    const card = (await (
      await fetch(`${workspace.url}/api/players/card?league=browser-league&team=1&player=w1`)
    ).json()) as { name: string; rosteredBy: string; recent: number[] };
    expect(card).toMatchObject({ name: 'Blake Receiver', rosteredBy: 'You' });
    const bad = await fetch(`${workspace.url}/api/players/compare`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ league: 'browser-league', team: '1', players: ['w1'] }),
    });
    expect(bad.status).toBe(400);

    await page.addInitScript(() =>
      localStorage.setItem('sidekick.teamSelection.v1', JSON.stringify({ 'browser-league': '1' })),
    );
    await page.goto(`${workspace.url}/#/compare?league=browser-league`);
    await expect(page.getByRole('heading', { name: 'Compare players', exact: true })).toBeVisible();
    const picker = page.getByRole('group', { name: /Players choices/ });
    await picker.getByRole('checkbox', { name: /Blake Receiver/ }).check();
    await picker.getByRole('checkbox', { name: /Harper Receiver/ }).check();
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    const result = page.getByRole('region', { name: 'Comparison' });
    await expect(result).toContainText('Start');
    await expect(result.getByRole('article')).toHaveCount(2);

    await result.getByRole('button', { name: 'Harper Receiver', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Harper Receiver' });
    await expect(drawer).toContainText('Recent games');
    await drawer.getByRole('button', { name: 'Watch', exact: true }).click();
    await expect(drawer.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible();
    expect(workspace.store.settingsSnapshot().preferences?.watchlist).toEqual([
      { leagueId: 'browser-league', playerId: 'w3', name: 'Harper Receiver' },
    ]);
  } finally {
    await workspace.close();
  }
});
