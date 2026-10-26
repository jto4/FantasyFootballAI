import { expect, it } from 'vitest';
import type { LeagueConnection } from '@sidekick/core';
import { sundayRows } from './SundayPage';

const league = (id: string, roster: { id: string; name: string; position: string }[]) =>
  ({
    id,
    displayName: `League ${id}`,
    platform: 'sleeper',
    teams: [{ id: 't', name: 'Mine', roster }],
  }) as unknown as LeagueConnection;

it('joins the same player across leagues and flags where he starts in one and sits in another', () => {
  const rows = sundayRows([
    {
      league: league('a', [
        { id: '1', name: 'Fictional Back Jr.', position: 'RB' },
        { id: '2', name: 'Fictional Receiver', position: 'WR' },
      ]),
      teamId: 't',
      live: {
        matchup: { you: { starters: [{ id: '1' }, { id: '2' }] } },
      } as never,
    },
    {
      league: league('b', [{ id: 'x', name: 'Fictional Back', position: 'RB' }]),
      teamId: 't',
      briefing: {
        matchup: { you: { starters: [] } },
        availability: [{ id: 'x', name: 'Fictional Back', status: 'Questionable' }],
      } as never,
    },
  ]);
  expect(rows[0]).toMatchObject({
    name: 'Fictional Back Jr.',
    starting: ['League a'],
    benched: ['League b'],
    status: 'Questionable',
  });
  expect(rows.map((r) => r.name)).toEqual(['Fictional Back Jr.', 'Fictional Receiver']);
});
