import { expect, it } from 'vitest';
import { loadTeamTotalSignals, parseTeamTotalSignals } from './team-total-signals.js';
const headers = [
  'season',
  'week',
  'season_type',
  'game_id',
  'team',
  'opponent_team',
  'attempts',
  'sacks_suffered',
  'carries',
  'passing_epa',
  'rushing_epa',
  'passing_20',
  'rushing_20',
  'passing_first_downs',
  'rushing_first_downs',
];
function csv(patch: Record<string, string> = {}) {
  const row = {
    season: '2025',
    week: '1',
    season_type: 'REG',
    game_id: '2025_01_BUF_MIA',
    team: 'BUF',
    opponent_team: 'MIA',
    attempts: '35',
    sacks_suffered: '2',
    carries: '28',
    passing_epa: '10',
    rushing_epa: '-2',
    passing_20: '4',
    rushing_20: '1',
    passing_first_downs: '15',
    rushing_first_downs: '7',
    ...patch,
  };
  return headers.join(',') + '\n' + headers.map((k) => row[k as keyof typeof row]).join(',') + '\n';
}
it('parses one offensive unit without double-counting receiving EPA; missing measures stay missing', () => {
  expect(parseTeamTotalSignals(csv(), 2025)[0]).toMatchObject({
    team: 'BUF',
    opponent: 'MIA',
    passingEpa: 10,
    rushingEpa: -2,
    explosivePlays: 5,
    firstDowns: 22,
  });
  for (const patch of [
    { passing_epa: '' },
    { attempts: 'NaN' },
    { sacks_suffered: '-1' },
    { team: 'XXX' },
    { season: '2024' },
    { season_type: 'OTHER' },
    { passing_20: '-1', rushing_20: '6' },
    { game_id: '2025_02_BUF_MIA' },
  ])
    expect(() => parseTeamTotalSignals(csv(patch), 2025)).toThrow();
  expect(parseTeamTotalSignals(csv({ season_type: 'POST' }), 2025)).toEqual([]);
  expect(() => parseTeamTotalSignals(csv() + csv().split('\n')[1] + '\n', 2025)).toThrow(
    'duplicate',
  );
  expect(() => parseTeamTotalSignals(csv().replace('rushing_epa', 'other'), 2025)).toThrow();
});
it('uses a fixed URL, deadline and byte limit, and cancels failed responses', async () => {
  const loaded = await loadTeamTotalSignals(2025, async (url, init) => {
    expect(String(url)).toBe(
      'https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2025.csv',
    );
    expect(init?.signal).toBeDefined();
    return new Response(csv());
  });
  expect(loaded.rows).toHaveLength(1);
  await expect(
    loadTeamTotalSignals(
      2025,
      async () => new Response('x', { headers: { 'content-length': '1000001' } }),
    ),
  ).rejects.toThrow('size limit');
  await expect(
    loadTeamTotalSignals(2025, async () => new Response('x', { status: 503 })),
  ).rejects.toThrow('503');
  await expect(
    loadTeamTotalSignals(2100, async () => {
      throw new Error('must not fetch');
    }),
  ).rejects.toThrow('season');
});
