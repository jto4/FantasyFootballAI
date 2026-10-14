import { expect, it } from 'vitest';
import { parseDatedGameInjuries } from './game-injuries.js';
import { buildPregameAvailability } from './game-availability.js';
import type { FootballGame } from '@sidekick/core';
const game: FootballGame = {
  id: 'game',
  season: 2026,
  week: 5,
  seasonType: 'REG',
  date: '2026-10-12',
  kickoffAt: '2026-10-13T00:15:00Z',
  espnId: '401872994',
  home: 'LA',
  away: 'BUF',
};
const at = '2026-10-12T10:00:00Z';
function payload() {
  return {
    header: {
      id: game.espnId,
      uid: `s:20~l:28~e:${game.espnId}`,
      season: { year: 2026, type: 2 },
      timeValid: true,
      competitions: [
        {
          id: game.espnId,
          date: game.kickoffAt,
          competitors: [
            { id: '14', homeAway: 'home', team: { abbreviation: 'LAR' } },
            { id: '2', homeAway: 'away', team: { abbreviation: 'BUF' } },
          ],
          status: { type: { state: 'pre', completed: false } },
        },
      ],
    },
    injuries: [
      {
        team: { id: '14', abbreviation: 'LAR' },
        injuries: [
          {
            date: '2026-10-11T12:00Z',
            status: 'Out',
            athlete: { id: '123', fullName: 'Recorded QB', position: { abbreviation: 'QB' } },
          },
          {
            date: '2026-10-11T12:00Z',
            status: 'Injured Reserve',
            athlete: { id: '124', fullName: 'IR defender', position: { abbreviation: 'DE' } },
          },
        ],
      },
    ],
  };
}
it('accepts dated pregame publisher labels with team/event identity, excludes IR and matches unique QB names when publisher GSIS is absent', () => {
  const rows = parseDatedGameInjuries(payload(), game, at);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.updatedAt).toBe('2026-10-11T12:00:00.000Z');
  const previous = {
    ...game,
    id: 'earlier',
    week: 4,
    date: '2026-10-04',
    homeScore: 24,
    awayScore: 17,
    homeQuarterbackId: '00-0000001',
    homeQuarterbackName: 'Recorded QB',
  };
  expect(buildPregameAvailability(game, [previous], rows, [], at).home.quarterbackOut).toBe(true);
});
it('rejects changed event/team identities, started games, duplicate teams and future/undated entries', () => {
  const p = payload();
  p.header.competitions[0]!.status.type.state = 'in';
  expect(() => parseDatedGameInjuries(p, game, at)).toThrow();
  const wrong = payload();
  wrong.injuries[0]!.team.id = '99';
  expect(() => parseDatedGameInjuries(wrong, game, at)).toThrow();
  const future = payload();
  future.injuries[0]!.injuries[0]!.date = '2026-10-13T01:00Z';
  expect(parseDatedGameInjuries(future, game, at)).toEqual([]);
  const duplicate = payload();
  duplicate.injuries.push(duplicate.injuries[0]!);
  expect(() => parseDatedGameInjuries(duplicate, game, at)).toThrow();
});
