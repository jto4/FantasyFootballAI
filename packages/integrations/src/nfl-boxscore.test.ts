import { expect, it } from 'vitest';
import { parseNflBoxScore, PublicNflBoxScores } from './nfl-boxscore.js';

const athlete = (id: string, displayName: string, stats: string[]) => ({
  athlete: { id, displayName },
  stats,
});
const summary = {
  header: {
    competitions: [
      {
        status: { type: { state: 'in' } },
        competitors: [
          { homeAway: 'home', team: { abbreviation: 'CHI' }, score: '23' },
          { homeAway: 'away', team: { abbreviation: 'NE' }, score: '7' },
        ],
      },
    ],
  },
  boxscore: {
    teams: [
      {
        team: { abbreviation: 'NE' },
        statistics: [
          { name: 'totalYards', displayValue: '250' },
          { name: 'sacksYardsLost', displayValue: '4-21' },
          { name: 'interceptions', displayValue: '2' },
          { name: 'fumblesLost', displayValue: '1' },
        ],
      },
      { team: { abbreviation: 'CHI' }, statistics: [{ name: 'totalYards', displayValue: '330' }] },
    ],
    players: [
      {
        team: { abbreviation: 'CHI' },
        statistics: [
          {
            name: 'passing',
            keys: [
              'completions/passingAttempts',
              'passingYards',
              'passingTouchdowns',
              'interceptions',
            ],
            athletes: [athlete('100', 'Caleb Williams', ['20/30', '250', '1', '0'])],
          },
          {
            name: 'receiving',
            keys: ['receptions', 'receivingYards', 'receivingTouchdowns', 'receivingTargets'],
            athletes: [athlete('200', 'Rome Odunze', ['5', '80', '1', '7'])],
          },
          {
            name: 'kicking',
            keys: ['fieldGoalsMade/fieldGoalAttempts', 'extraPointsMade/extraPointAttempts'],
            athletes: [athlete('300', 'Cairo Santos', ['2/3', '1/1'])],
          },
          { name: 'rushing', keys: ['rushingAttempts'], athletes: [athlete('bad id', 'X', ['1'])] },
        ],
      },
    ],
  },
  drives: {
    previous: [
      {
        team: { abbreviation: 'CHI' },
        plays: [
          { type: { text: 'Field Goal Good' }, text: 'C.Santos 43 yard field goal is GOOD' },
          { type: { text: 'Field Goal Missed' }, text: 'C.Santos 53 yard field goal is No Good' },
          { type: { text: 'Field Goal Good' }, text: 'C.Santos 61 yard field goal is GOOD' },
        ],
      },
      {
        team: { abbreviation: 'NE' },
        plays: [{ type: { text: 'Blocked Punt' }, text: 'blocked' }],
      },
    ],
  },
  scoringPlays: [
    {
      type: { text: 'Passing Touchdown' },
      team: { abbreviation: 'CHI' },
      text: 'Rome Odunze 20 Yd pass from Caleb Williams (Two-Point Pass Conversion, Caleb Williams pass to Rome Odunze)',
      homeScore: 8,
      awayScore: 0,
    },
    {
      type: { text: 'Interception Return Touchdown' },
      team: { abbreviation: 'CHI' },
      homeScore: 15,
      awayScore: 0,
      text: 'pick six (Two-Point Conversion Failed... no) ',
    },
    {
      type: { text: 'Rushing Touchdown' },
      team: { abbreviation: 'NE' },
      homeScore: 15,
      awayScore: 7,
      text: 'run (Kick)',
    },
    {
      type: { text: 'Field Goal Good' },
      team: { abbreviation: 'CHI' },
      homeScore: 18,
      awayScore: 7,
      text: 'kick',
    },
    {
      type: { text: 'Field Goal Good' },
      team: { abbreviation: 'CHI' },
      homeScore: 21,
      awayScore: 7,
      text: 'kick',
    },
    {
      type: { text: 'Safety' },
      team: { abbreviation: 'CHI' },
      homeScore: 23,
      awayScore: 7,
      text: 'safety',
    },
  ],
};

it('builds player lines, kick distances, two-point credit and D/ST stats from a summary', () => {
  const box = parseNflBoxScore(summary, '401873010');
  expect(box.state).toBe('in');
  expect(box.scores).toEqual({ CHI: 23, NE: 7 });
  expect(box.players['100']!.stats).toMatchObject({
    completions: 20,
    attempts: 30,
    passing_yards: 250,
    passing_tds: 1,
    passing_2pt_conversions: 1,
    rushing_yards: 0,
  });
  expect(box.players['200']!.stats).toMatchObject({ receptions: 5, receiving_2pt_conversions: 1 });
  expect(box.players['300']).toMatchObject({
    madeFieldGoalDistances: [43, 61],
    blockedFieldGoalDistances: [],
    stats: {
      fg_made: 2,
      fg_missed: 1,
      fg_made_40_49: 1,
      fg_made_60_: 1,
      fg_missed_50_59: 1,
      pat_made: 1,
    },
  });
  expect(box.players['bad id']).toBeUndefined();
  expect(box.defenses.CHI).toMatchObject({
    dst_points_allowed: 7,
    dst_yards_allowed: 250,
    dst_sacks: 4,
    dst_interceptions: 2,
    dst_fumble_recoveries: 1,
    dst_blocked_kicks: 1,
    dst_interception_return_tds: 1,
    dst_safeties: 1,
  });
  expect(box.notes).toEqual([]);
});

it('leaves kick distances out and notes it when two kickers share the kicks', () => {
  const twoKickers = structuredClone(summary);
  twoKickers.boxscore.players[0]!.statistics[2]!.athletes.push(
    athlete('301', 'Backup Kicker', ['0/0', '0/0']),
  );
  const box = parseNflBoxScore(twoKickers, '401873010');
  expect(box.players['300']!.madeFieldGoalDistances).toBeUndefined();
  expect(box.notes).toEqual(['CHI field goal distances could not be matched to one kicker.']);
});

it('caches live games briefly and rejects bad ids before fetching', async () => {
  let calls = 0;
  let now = 0;
  const boxes = new PublicNflBoxScores(
    async () => {
      calls++;
      return new Response(JSON.stringify(summary));
    },
    () => now,
  );
  await boxes.get('401873010');
  await boxes.get('401873010');
  expect(calls).toBe(1);
  now = 31_000;
  await boxes.get('401873010');
  expect(calls).toBe(2);
  await expect(boxes.get('../x')).rejects.toThrow('Invalid ESPN game id.');
});
