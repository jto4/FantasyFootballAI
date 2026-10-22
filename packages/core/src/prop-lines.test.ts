import { expect, it } from 'vitest';
import {
  closingLineValue,
  espnPropAthleteIds,
  fairAmericanOdds,
  isPropLine,
  noVigProbability,
  parseEspnPropBets,
  parseOddsApiLines,
  parseOddsApiProps,
} from './prop-lines.js';

const athlete = (id: string) => ({
  $ref: `http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/athletes/${id}?lang=en`,
});
const espnRow = (id: string, type: string, value: number) => ({
  athlete: athlete(id),
  type: { id: '1', name: type },
  current: { target: { value, displayValue: String(value) } },
});

it('reads ESPN prop lines, collapsing the duplicate over/under rows and skipping unknown players', () => {
  const items = [
    espnRow('11', 'Total Receiving Yards (incl. overtime)', 35.5),
    espnRow('11', 'Total Receiving Yards (incl. overtime)', 35.5),
    espnRow('11', 'Receiving Yards Milestones', 50),
    espnRow('22', 'Total Rushing Yards (incl. overtime)', 60.5),
    espnRow('33', 'Total Receptions (incl. overtime)', 4.5),
  ];
  expect(espnPropAthleteIds(items)).toEqual(['11', '22', '33']);
  const names = new Map([
    ['11', { name: 'Fictional Receiver' }],
    ['22', { name: 'Fictional Runner' }],
  ]);
  const lines = parseEspnPropBets(items, names, {
    gameId: 'game',
    sportsbook: 'Fictional Book',
    observedAt: '2026-10-21T12:00:00.000Z',
  });
  expect(lines.map((l) => [l.playerName, l.stat, l.line])).toEqual([
    ['Fictional Receiver', 'receiving_yards', 35.5],
    ['Fictional Runner', 'rushing_yards', 60.5],
  ]);
  expect(lines.every(isPropLine)).toBe(true);
  expect(lines[0]!.overOdds).toBeUndefined();
});

it('keeps an Odds API prop only when one book prices both sides', () => {
  const lines = parseOddsApiProps(
    {
      bookmakers: [
        {
          title: 'Book A',
          markets: [
            {
              key: 'player_reception_yds',
              outcomes: [
                { name: 'Over', description: 'Fictional Receiver', point: 35.5, price: -115 },
                { name: 'Under', description: 'Fictional Receiver', point: 35.5, price: -105 },
                { name: 'Over', description: 'Lonely Over', point: 10.5, price: -110 },
              ],
            },
            { key: 'player_anytime_td', outcomes: [] },
          ],
        },
      ],
    },
    { gameId: 'game', observedAt: '2026-10-21T12:00:00.000Z' },
  );
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ stat: 'receiving_yards', overOdds: -115, underOdds: -105 });
});

it('maps book prices to home, away, over and under for the matching game only', () => {
  const teams = {
    home: 'CHI',
    away: 'NE',
    homeName: 'Chicago Bears',
    awayName: 'New England Patriots',
  };
  const value = {
    home_team: 'Chicago Bears',
    away_team: 'New England Patriots',
    bookmakers: [
      {
        title: 'Book A',
        markets: [
          {
            key: 'spreads',
            outcomes: [
              { name: 'Chicago Bears', price: -110, point: -3 },
              { name: 'New England Patriots', price: -110, point: 3 },
            ],
          },
          { key: 'totals', outcomes: [{ name: 'Over', price: -105, point: 50.5 }] },
        ],
      },
    ],
  };
  const rows = parseOddsApiLines(value, teams, '2026-10-21T12:00:00.000Z');
  expect(rows.map((r) => [r.kind, r.side, r.line, r.americanOdds])).toEqual([
    ['spread', 'home', -3, -110],
    ['spread', 'away', 3, -110],
    ['total', 'over', 50.5, -105],
  ]);
  expect(parseOddsApiLines({ ...value, home_team: 'Other' }, teams, 'x')).toEqual([]);
});

it('removes the margin from a two-way price and measures closing line value', () => {
  expect(noVigProbability(-110, -110)).toBeCloseTo(0.5);
  expect(fairAmericanOdds(0.5)).toBe(-100);
  expect(fairAmericanOdds(0.6)).toBe(-150);
  expect(fairAmericanOdds(0.4)).toBe(150);
  // Took +120 (45.5% implied); the close was a fair 50%.
  expect(closingLineValue(120, { odds: -110, oppositeOdds: -110 })).toBeCloseTo(0.5 - 100 / 220);
});
