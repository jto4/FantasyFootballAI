import { afterEach, expect, it, vi } from 'vitest';
import { SleeperConnector } from './platforms.js';
afterEach(() => vi.unstubAllGlobals());
it('keeps commissioner decimal and zero score overrides instead of the calculated matchup totals', async () => {
  let override: number | null = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      const path = new URL(String(input)).pathname;
      const value = path.endsWith('/rosters')
        ? [{ roster_id: 1 }, { roster_id: 2 }]
        : path.endsWith('/users') || path.endsWith('/drafts')
          ? []
          : path.endsWith('/state/nfl')
            ? { season: 2026, week: 6 }
            : path.endsWith('/matchups/6')
              ? [
                  { roster_id: 1, matchup_id: 1, points: 101.25, custom_points: override },
                  { roster_id: 2, matchup_id: 1, points: 98.5, custom_points: 98.55 },
                ]
              : path.endsWith('/players/nfl')
                ? { '1': { full_name: 'Test player' } }
                : { name: 'Test', season: 2026, total_rosters: 2 };
      return new Response(JSON.stringify(value), {
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  const first = await new SleeperConnector().fetchLeague('test');
  expect(first.matchups?.[0]?.teams.map((side) => side.points)).toEqual([0, 98.55]);
  override = null;
  const next = await new SleeperConnector().fetchLeague('test');
  expect(next.matchups?.[0]?.teams.map((side) => side.points)).toEqual([101.25, 98.55]);
});
