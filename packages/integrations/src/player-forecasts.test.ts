import { expect, it } from 'vitest';
import {
  PublicPlayerForecasts,
  parsePublicPlayerForecasts,
  publicPlayerForecastFilter,
  publicPlayerForecastUrl,
} from './player-forecasts.js';

const source = 'espn-forecasts-2026-0';
function fixture(id = 12345) {
  return {
    seasonId: 2026,
    scoringPeriodId: 5,
    settings: {
      scoringSettings: {
        scoringItems: Object.entries({
          3: 0.04,
          4: 4,
          20: -2,
          24: 0.1,
          25: 6,
          42: 0.1,
          43: 6,
          53: 1,
          72: -2,
        }).map(([key, points]) => ({
          statId: Number(key),
          points,
          pointsOverrides: {},
          isReverseItem: false,
        })),
      },
    },
    players: [
      {
        id,
        player: {
          id,
          active: true,
          fullName: 'Fictional Rookie',
          defaultPositionId: 3,
          proTeamId: 2,
          stats: [
            {
              seasonId: 2026,
              statSourceId: 1,
              statSplitTypeId: 0,
              scoringPeriodId: 0,
              stats: { 42: 800 } as Record<string, number>,
              appliedTotal: 80,
            },
            {
              id: '1120265',
              externalId: '20265',
              seasonId: 2026,
              statSourceId: 1,
              statSplitTypeId: 1,
              scoringPeriodId: 5,
              stats: { 42: 65.5, 53: 4.5 } as Record<string, number>,
              appliedTotal: 11.05,
            },
          ],
        },
      },
    ],
  };
}
it('uses fixed keyless weekly pages and scores reconciled fractional expectations separately from aggregates', () => {
  const url = publicPlayerForecastUrl(2026),
    filter = JSON.parse(publicPlayerForecastFilter(2026, 100));
  expect(url).toContain('/leaguedefaults/3?');
  expect(filter.players.filterStatsForExternalIds.value).toContain(202618);
  expect(filter.players.limit).toBe(100);
  for (const [season, offset] of [
    [2020, 0],
    [2026, 501],
  ])
    expect(() => publicPlayerForecastFilter(season!, offset!)).toThrow();
  const rows = parsePublicPlayerForecasts(fixture(), 2026, source);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    espnId: '12345',
    team: 'BUF',
    position: 'WR',
    week: 5,
    issuedWeek: 5,
    sourceId: source,
    stats: { receptions: 4.5, receiving_yards: 65.5, rushing_yards: 0 },
  });
  expect(rows[0]!.stats.receiving_first_downs).toBeUndefined();
});
it('rejects wrong scope, scoring, identities, duplicate weeks, formula mismatches and fumble inconsistencies', () => {
  for (const change of [
    (x: ReturnType<typeof fixture>) => {
      x.seasonId = 2025;
    },
    (x: ReturnType<typeof fixture>) => {
      x.scoringPeriodId = 19;
    },
    (x: ReturnType<typeof fixture>) => {
      x.players[0]!.id++;
    },
    (x: ReturnType<typeof fixture>) => {
      x.players.push(x.players[0]!);
    },
    (x: ReturnType<typeof fixture>) => {
      x.settings.scoringSettings.scoringItems[0]!.points = 99;
    },
    (x: ReturnType<typeof fixture>) => {
      x.players[0]!.player.stats.push(x.players[0]!.player.stats[1]!);
    },
    (x: ReturnType<typeof fixture>) => {
      x.players[0]!.player.stats[1]!.externalId = '20266';
    },
    (x: ReturnType<typeof fixture>) => {
      x.players[0]!.player.stats[1]!.appliedTotal++;
    },
    (x: ReturnType<typeof fixture>) => {
      x.players[0]!.player.stats[1]!.statSourceId = 0;
    },
  ]) {
    const value = fixture();
    change(value);
    expect(() => parsePublicPlayerForecasts(value, 2026, source)).toThrow();
  }
  const fumbles = fixture();
  Object.assign(fumbles.players[0]!.player.stats[1]!.stats, { 72: 1 });
  fumbles.players[0]!.player.stats[1]!.appliedTotal -= 2;
  expect(() => parsePublicPlayerForecasts(fumbles, 2026, source)).toThrow('reconcile');
});
it('uses position overrides in the complete checksum and leaves empty forecasts missing', () => {
  const value = fixture();
  Object.assign(
    value.settings.scoringSettings.scoringItems.find((r) => r.statId === 53)!.pointsOverrides,
    { 3: 2 },
  );
  value.players[0]!.player.stats[1]!.appliedTotal += 4.5;
  expect(parsePublicPlayerForecasts(value, 2026, source)).toHaveLength(1);
  value.players[0]!.player.stats[1]!.stats = {};
  value.players[0]!.player.stats[1]!.appliedTotal = 0;
  expect(parsePublicPlayerForecasts(value, 2026, source)).toEqual([]);
});
it('coalesces, bounds concurrency, caches, backs off and retains original dates during a partial outage', async () => {
  let now = Date.parse('2026-10-07T12:00:00Z'),
    fail = false,
    active = 0,
    maximum = 0;
  const calls: RequestInit[] = [];
  const reader = new PublicPlayerForecasts(
    async (_url, init) => {
      calls.push(init!);
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      const offset = JSON.parse(String(new Headers(init?.headers).get('x-fantasy-filter'))).players
        .offset;
      return fail && offset === 0
        ? new Response('private-error', { status: 503 })
        : Response.json(fixture(12345 + offset));
    },
    () => now,
  );
  const [first, concurrent] = await Promise.all([reader.get(2026), reader.get(2026)]);
  expect(concurrent).toBe(first);
  expect(calls).toHaveLength(5);
  expect(maximum).toBeLessThanOrEqual(3);
  expect(first.playerForecasts).toHaveLength(5);
  expect(
    calls.every(
      (init) =>
        init.signal &&
        !new Headers(init.headers).has('authorization') &&
        !new Headers(init.headers).has('cookie'),
    ),
  ).toBe(true);
  await reader.get(2026);
  expect(calls).toHaveLength(5);
  now += 7 * 3600000;
  fail = true;
  const stale = await reader.get(2026);
  expect(stale.playerForecasts).toEqual(first.playerForecasts);
  expect(stale.sources[0]!.retrievedAt).toBe(first.sources[0]!.retrievedAt);
  expect(stale.sources[1]!.retrievedAt).not.toBe(first.sources[1]!.retrievedAt);
  expect(JSON.stringify(stale)).not.toContain('private-error');
  await reader.get(2026);
  expect(calls).toHaveLength(10);
  now += 300001;
  fail = false;
  expect((await reader.get(2026)).warnings).toEqual([]);
  expect(calls).toHaveLength(15);
});
it('withholds duplicate pagination and oversized responses without unbounded reads', async () => {
  const duplicated = await new PublicPlayerForecasts(async () => Response.json(fixture())).get(
    2026,
  );
  expect(duplicated.playerForecasts).toEqual([]);
  expect(duplicated.warnings.join(' ')).toContain('repeated');
  const tooLarge = await new PublicPlayerForecasts(
    async () => new Response('error-data', { headers: { 'content-length': '6000001' } }),
  ).get(2026);
  expect(tooLarge.sources.every((source) => source.status === 'unavailable')).toBe(true);
  expect(tooLarge.playerForecasts).toEqual([]);
  expect(tooLarge.warnings).toHaveLength(1);
});

it('keeps signed derived projection fields separate while rejecting negative modeled event counts', () => {
  const value = fixture();
  Object.assign(value.players[0]!.player.stats[1]!.stats, {
    213: -0.012,
    37: -0.000000239,
    38: -0.00000000814,
  });
  const result = parsePublicPlayerForecasts(value, 2026, source);
  expect(result[0]!.stats.receptions).toBe(4.5);
  expect(Object.keys(result[0]!.stats)).not.toContain('213');
  value.players[0]!.player.stats[1]!.stats['53'] = -1;
  expect(() => parsePublicPlayerForecasts(value, 2026, source)).toThrow('event count');
});
