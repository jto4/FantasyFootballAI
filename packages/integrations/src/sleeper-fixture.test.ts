import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { SleeperConnector } from './platforms.js';
afterEach(() => vi.unstubAllGlobals());
it('normalizes captured, sanitized public league scoring, roster records, and draft ordering', async () => {
  const fixture = JSON.parse(
    await readFile(new URL('./fixtures/sleeper-public-sample.json', import.meta.url), 'utf8'),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      const path = new URL(String(input)).pathname;
      const value = path.endsWith('/rosters')
        ? fixture.rosters
        : path.endsWith('/users')
          ? fixture.users
          : path.endsWith('/picks')
            ? fixture.picks
            : path.includes('/draft/')
              ? fixture.draft
              : path.endsWith('/players/nfl')
                ? { '4046': { full_name: 'Patrick Mahomes', position: 'QB', team: 'KC' } }
                : path.endsWith('/state/nfl')
                  ? { season: 2026, display_week: 4 }
                  : fixture.league;
      return new Response(JSON.stringify(value), {
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  const league = await new SleeperConnector().fetchLeague(fixture.league.league_id);
  expect(league.season).toBe(2018);
  expect(league.teamCount).toBe(12);
  expect(league.teams).toHaveLength(12);
  expect(league.scoring.rec).toBe(fixture.league.scoring_settings.rec);
  expect(league.teams[0]?.name).toBe('Manager 1');
  expect(league.teams[0]?.pointsFor).toBe(
    fixture.rosters[0].settings.fpts + fixture.rosters[0].settings.fpts_decimal / 100,
  );
  expect(league.draft?.picks).toHaveLength(180);
  expect(league.draft?.picks[0]?.pickNumber).toBe(1);
  expect(league.settings.currentWeek).toBeUndefined();
  // The capture preserves domain semantics but deliberately omits account identities.
  expect(
    fixture.rosters.every((row: { owner_id: string }) => /^anonymous-\d+$/.test(row.owner_id)),
  ).toBe(true);
  expect(JSON.stringify(fixture)).not.toMatch(/"(?:username|avatar|co_owners|picked_by)"/);
});
