import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { FootballGame } from '@sidekick/core';
import { defenseSummaryUrl, parseOffensiveFumbleProof } from './defense-offense-proof.js';

interface Play {
  id: string;
  type: { id: string; text: string };
  text: string;
  homeScore: number;
  awayScore: number;
  scoringPlay: boolean;
  isTurnover: boolean;
  scoringType: { name: string };
  start: { down: number; team: { id: string } };
  end: { team: { id: string } };
  teamParticipants: [{ id: string; type: string }, { id: string; type: string }];
}
interface Summary {
  header: {
    id: string;
    league: { slug: string };
    season: { year: number; type: number };
    week: number;
    competitions: [
      {
        date: string;
        status: { type: { completed: boolean; state: string } };
        competitors: [
          { score: string; team: { abbreviation: string } },
          { score: string; team: { abbreviation: string } },
        ];
      },
    ];
  };
  scoringPlays: [
    { type: { id: string; text: string }; team: { id: string } },
    ...{ type: { id: string; text: string }; team: { id: string } }[],
  ];
  drives: { previous: { plays: Play[] }[] };
}
const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/defense-offense-games.json', import.meta.url), 'utf8'),
) as {
  game: FootballGame;
  summary: Summary;
  team: string;
}[];
function fixture() {
  return structuredClone(fixtures[0]!);
}

it('proves the five public offensive fumble touchdowns from structured possession, not the misleading return label', () => {
  for (const { game, summary, team } of fixtures) {
    expect(parseOffensiveFumbleProof(summary, game)).toEqual([
      { gameId: game.id, team, touchdowns: 1, sourceId: `dst-offense-${game.espnId}` },
    ]);
  }
  expect(
    fixtures.filter((f) => f.summary.scoringPlays[0].type.text === 'Fumble Return Touchdown'),
  ).toHaveLength(2);
});
it('rejects mismatched event, league, season, week, calendar, kickoff, teams, final status and final scores', () => {
  for (const mutate of [
    (s: Summary) => (s.header.id = '401000000'),
    (s: Summary) => (s.header.league.slug = 'nba'),
    (s: Summary) => (s.header.season.year = 2023),
    (s: Summary) => (s.header.season.type = 3),
    (s: Summary) => (s.header.week = 18),
    (s: Summary) => (s.header.competitions[0].date = '2024-09-16T20:05Z'),
    (s: Summary) => (s.header.competitions[0].competitors[0].team.abbreviation = 'BUF'),
    (s: Summary) => (s.header.competitions[0].competitors[0].score = '99'),
    (s: Summary) => (s.header.competitions[0].status.type.completed = false),
    (s: Summary) => (s.header.competitions[0].status.type.state = 'in'),
  ]) {
    const f = fixture();
    mutate(f.summary);
    expect(() => parseOffensiveFumbleProof(f.summary, f.game)).toThrow();
  }
  const f = fixture();
  f.game.kickoffAt = '2024-09-15T21:05Z';
  expect(() => parseOffensiveFumbleProof(f.summary, f.game)).toThrow();
});
it('keeps defensive returns, special teams, fourth-down ambiguity, missing plays and changing possession unresolved', () => {
  for (const mutate of [
    (p: Play) => (p.start.team.id = '14'),
    (p: Play) => (p.end.team.id = '14'),
    (p: Play) => (p.isTurnover = true),
    (p: Play) => (p.start.down = 4),
    (p: Play) => (p.start.down = 0),
    (p: Play) => (p.text = 'Punt fumble recovered for a touchdown.'),
    (p: Play) => (p.text = 'Kickoff fumble recovered for a touchdown.'),
    (p: Play) => (p.text = 'Blocked field goal returned for a touchdown.'),
    (p: Play) => (p.teamParticipants[0].type = 'specialTeams'),
  ]) {
    const f = fixture();
    mutate(f.summary.drives.previous[0]!.plays[0]!);
    expect(parseOffensiveFumbleProof(f.summary, f.game)).toEqual([]);
  }
  const f = fixture();
  f.summary.drives.previous = [];
  expect(parseOffensiveFumbleProof(f.summary, f.game)).toEqual([]);
});
it('rejects duplicate/conflicting score and play identities, malformed responses and arbitrary event URLs', () => {
  for (const mutate of [
    (s: Summary) => s.scoringPlays.push(s.scoringPlays[0]),
    (s: Summary) => s.drives.previous[0]!.plays.push(s.drives.previous[0]!.plays[0]!),
    (s: Summary) => (s.scoringPlays[0].team.id = '999'),
    (s: Summary) => (s.drives.previous[0]!.plays[0]!.homeScore = 0),
    (s: Summary) => (s.scoringPlays[0].type.text = 'Rushing Touchdown'),
    (s: Summary) => (s.drives.previous[0]!.plays[0]!.teamParticipants[1].id = '22'),
  ]) {
    const f = fixture();
    mutate(f.summary);
    expect(() => parseOffensiveFumbleProof(f.summary, f.game)).toThrow();
  }
  for (const value of [null, [], {}, { header: [] }])
    expect(() => parseOffensiveFumbleProof(value, fixture().game)).toThrow();
  for (const id of ['1', '401772747&host=example.test', 'https://example.test', '4017727470'])
    expect(() => defenseSummaryUrl(id)).toThrow();
});
