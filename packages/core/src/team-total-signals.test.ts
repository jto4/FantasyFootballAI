import { expect, it } from 'vitest';
import {
  prepareTeamTotalSignals,
  validateTeamTotalStats,
  type TeamTotalStats,
} from './team-total-signals.js';
import type { FootballGame } from './advice-types.js';

function fixture() {
  const games: FootballGame[] = [],
    rows: TeamTotalStats[] = [];
  for (let week = 1; week <= 8; week++) {
    const pairs =
      week % 2
        ? [
            ['BUF', 'MIA'],
            ['KC', 'NE'],
          ]
        : [
            ['BUF', 'NE'],
            ['KC', 'MIA'],
          ];
    for (const [home, away] of pairs) {
      const g: FootballGame = {
        id: `2025_${String(week).padStart(2, '0')}_${away}_${home}`,
        season: 2025,
        week,
        seasonType: 'REG',
        date: new Date(Date.UTC(2025, 8, 1 + 7 * week)).toISOString().slice(0, 10),
        home: home!,
        away: away!,
        homeScore: 24,
        awayScore: 20,
      };
      games.push(g);
      for (const [team, opponent] of [
        [home, away],
        [away, home],
      ]) {
        rows.push({
          season: 2025,
          week,
          gameId: g.id,
          team: team!,
          opponent: opponent!,
          attempts: 35,
          sacks: 2,
          carries: 28,
          passingEpa: team === 'BUF' ? 20 : 0,
          rushingEpa: team === 'BUF' ? 3 : -2,
          explosivePlays: 8,
          firstDowns: 20,
        });
      }
    }
  }
  return { games, rows };
}
it('joins exact reciprocal team/game identities and withholds absent or ambiguous evidence', () => {
  const { games, rows } = fixture(),
    target = games.at(-1)!;
  const good = prepareTeamTotalSignals(games, rows, 120);
  expect(good.joinedRows).toBe(rows.length);
  expect(good.features(target).supported).toBe(true);
  expect(good.features({ ...target, home: 'SEA' }).supported).toBe(false);
  const partial = prepareTeamTotalSignals(games, rows.slice(1), 120);
  expect(partial.rejectedJoinRows).toBe(1);
  expect(prepareTeamTotalSignals([...games, games[0]!], rows, 120).rejectedJoinRows).toBe(2);
  const bad = games.map((g, i) => (i === 0 ? { ...g, home: 'KC' } : g));
  expect(prepareTeamTotalSignals(bad, rows, 120).rejectedJoinRows).toBe(2);
  expect(() => validateTeamTotalStats([...rows, rows[0]!])).toThrow('duplicate');
});
it('target, same-week and future results/stats cannot change earlier matchup features', () => {
  const { games, rows } = fixture(),
    target = games.find((g) => g.week === 6)!;
  const expected = prepareTeamTotalSignals(games, rows, 120).features(target);
  const changedGames = games.map((g) =>
    g.week >= target.week ? { ...g, homeScore: 99, awayScore: 0 } : g,
  );
  const changedRows = rows.map((r) =>
    r.week >= target.week ? { ...r, passingEpa: 100, rushingEpa: -100, attempts: 90 } : r,
  );
  expect(prepareTeamTotalSignals(changedGames, changedRows, 120).features(target)).toEqual(
    expected,
  );
  expect(
    prepareTeamTotalSignals(
      games.filter((g) => g.week < 6),
      rows.filter((r) => r.week < 6),
      120,
    ).features(target),
  ).toEqual(expected);
  const changedPrior = rows.map((r) =>
    r.week < 6 && r.team === 'BUF' ? { ...r, passingEpa: -50 } : r,
  );
  expect(prepareTeamTotalSignals(games, changedPrior, 120).features(target).x).not.toEqual(
    expected.x,
  );
});
it('shrinks thin data and respects the publication lag, with rates distinct from total EPA', () => {
  const { games, rows } = fixture(),
    last = games[0]!;
  const next = { ...last, week: 2, date: '2025-09-09' };
  expect(prepareTeamTotalSignals([last], rows.slice(0, 2), 120).features(next).supported).toBe(
    false,
  );
  expect(
    prepareTeamTotalSignals(games, rows, 120).features({
      ...games.at(-1)!,
      home: 'BUF',
      away: 'MIA',
    }).x[0],
  ).toBeGreaterThan(0);
  for (const patch of [
    { attempts: NaN },
    { sacks: -1 },
    { carries: 0 },
    { passingEpa: Infinity },
    { explosivePlays: 150 },
    { team: 'XXX' },
  ])
    expect(() => validateTeamTotalStats([{ ...rows[0]!, ...patch }])).toThrow();
});

it('joins current franchise statistics to historical relocation identities without changing production teams', () => {
  for (const [old, current] of [
    ['OAK', 'LV'],
    ['SD', 'LAC'],
    ['STL', 'LA'],
  ] as const) {
    const game: FootballGame = {
      id: `2015_01_BUF_${old}`,
      season: 2015,
      week: 1,
      seasonType: 'REG',
      date: '2015-09-13',
      home: old,
      away: 'BUF',
      homeScore: 20,
      awayScore: 24,
    };
    const base = fixture().rows[0]!;
    const rows = [
      { ...base, season: 2015, week: 1, gameId: game.id, team: current, opponent: 'BUF' },
      { ...base, season: 2015, week: 1, gameId: game.id, team: 'BUF', opponent: current },
    ];
    expect(prepareTeamTotalSignals([game], rows, 120).joinedRows).toBe(2);
    expect(game.home).toBe(old);
  }
});
