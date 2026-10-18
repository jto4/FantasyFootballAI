import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
const raw = {
  id: 123,
  seasonId: 2026,
  settings: {
    name: 'Browser League',
    scoringSettings: { scoringItems: [{ statId: 53, points: 0.5 }] },
  },
  status: { currentMatchupPeriod: 6 },
  teams: [
    {
      id: 1,
      name: 'My snapshot team',
      roster: {
        entries: [
          {
            playerId: 10,
            lineupSlotId: 0,
            playerPoolEntry: {
              player: {
                fullName: 'Example Quarterback',
                defaultPositionId: 1,
                injuryStatus: 'ACTIVE',
              },
            },
          },
        ],
      },
    },
  ],
};
test('ESPN browser import is reachable, explicit about manual updates and does not request credentials', async ({
  page,
}, info) => {
  const w = await apiWorkspace(false);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  try {
    await page.goto(`${w.url}/#/desk`);
    await page.getByRole('button', { name: 'Connect my league', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Fantasy platform').selectOption('espn');
    await dialog.getByLabel('LEAGUE ID OR URL', { exact: true }).fill('123');
    await dialog.getByRole('spinbutton', { name: /ESPN SEASON/ }).fill('2026');
    await dialog.getByText('Use my signed-in browser instead', { exact: true }).click();
    await expect(dialog).toContainText('manual snapshot');
    await dialog.getByLabel('ESPN JSON snapshot').setInputFiles({
      name: 'league.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(raw)),
    });
    await dialog.getByRole('button', { name: 'Import league snapshot', exact: true }).click();
    await page.getByRole('button', { name: 'Close guided setup', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Active league' })).toHaveValue('123');
    expect(w.store.snapshot().leagues[0]?.connectionMode).toBe('snapshot');
    expect(w.store.snapshot().leagues[0]?.lastSyncedAt).toBeUndefined();
    expect(w.credentialWrites).toEqual([]);
    expect(w.sends).toEqual([]);
    await expect(page.getByText(/Provider update time is unverified/).first()).toBeVisible();
    await page.screenshot({ path: info.outputPath('imported-browser-league.png'), fullPage: true });
    await page.getByRole('button', { name: 'Import updated roster', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await w.close();
  }
});

test('authorized real ESPN import preserves roster identities and verified weekly forecasts', async ({
  page,
}, info) => {
  test.skip(
    !process.env.SIDEKICK_ESPN_SNAPSHOT_FILE,
    'Set an owner-authorized browser snapshot outside the repository.',
  );
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(process.env.SIDEKICK_ESPN_SNAPSHOT_FILE!);
  const raw = JSON.parse(source.toString('utf8'));
  const w = await apiWorkspace(false);
  try {
    const response = await fetch(
      `${w.url}/api/leagues/import/espn?league=${raw.id}&season=${raw.seasonId}`,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: source },
    );
    expect(response.status).toBe(201);
    const saved = w.store.snapshot(),
      league = saved.leagues[0]!;
    expect(league.name).toBe(raw.settings.name);
    expect(league.teams).toHaveLength(raw.teams.length);
    expect(league.teams.flatMap((t) => t.roster ?? [])).toHaveLength(
      raw.teams.reduce(
        (n: number, t: { roster: { entries: unknown[] } }) => n + t.roster.entries.length,
        0,
      ),
    );
    const teamId = String(process.env.SIDEKICK_ESPN_TEAM_ID ?? raw.teams[0].id);
    const sourceTeam = raw.teams.find((t: { id: number }) => String(t.id) === teamId);
    expect(
      league.matchups?.flatMap((m) => m.teams).find((t) => t.teamId === teamId)?.starters,
    ).toHaveLength(
      sourceTeam.roster.entries.filter(
        (e: { lineupSlotId: number }) => ![20, 21].includes(e.lineupSlotId),
      ).length,
    );
    expect(saved.playerProjections.length).toBeGreaterThan(0);
    for (const projection of saved.playerProjections) {
      const entry = raw.teams
        .flatMap((t: { roster: { entries: unknown[] } }) => t.roster.entries)
        .find((e: { playerId: number }) => String(e.playerId) === projection.playerId);
      const forecast = entry.playerPoolEntry.player.stats.find(
        (s: { statSourceId: number; statSplitTypeId: number; scoringPeriodId: number }) =>
          s.statSourceId === 1 &&
          s.statSplitTypeId === 1 &&
          s.scoringPeriodId === league.settings.currentWeek,
      );
      expect(projection.projectedPoints).toBeCloseTo(
        Object.values(forecast.appliedStats).reduce<number>((sum, value) => sum + Number(value), 0),
        7,
      );
    }
    w.store.close();
    await w.store.load();
    expect(w.store.snapshot().playerProjections).toEqual(saved.playerProjections);
    await page.goto(`${w.url}/#/desk?league=${raw.id}`);
    await expect(page.getByRole('combobox', { name: 'Active league' })).toHaveValue(String(raw.id));
    await page.getByRole('combobox', { name: 'Your team', exact: true }).selectOption(teamId);
    await expect(page.getByText('Imported browser snapshot', { exact: false })).toBeVisible();
    await page.screenshot({ path: info.outputPath('real-afton-home.png'), fullPage: true });
    await page.getByRole('button', { name: 'Reports', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Set up weekly drafts', exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole('note').filter({ hasText: 'manual browser snapshot' }),
    ).toBeVisible();
    expect(w.credentialWrites).toEqual([]);
    expect(w.sends).toEqual([]);
  } finally {
    await w.close();
  }
});
