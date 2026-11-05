import { describe, expect, it } from 'vitest';
import { EspnMoveClient, espnLineupRequest, espnMemberId } from './espn-moves.js';

const swid = '{ABCDEF12-3456-7890-ABCD-EF1234567890}';
const cookie = `espn_s2=secret; SWID=${swid}`;
const request = espnLineupRequest({
  teamId: '10',
  week: 9,
  items: [
    { id: '123', from: 'BENCH', to: 'FLEX' },
    { id: '-16016', from: 'DST', to: 'BENCH' },
  ],
})!;

describe('espn lineup requests', () => {
  it('uses the slot ids for each spot', () => {
    expect(request).toEqual({
      isLeagueManager: false,
      teamId: 10,
      scoringPeriodId: 9,
      executionType: 'EXECUTE',
      type: 'ROSTER',
      items: [
        { playerId: 123, type: 'LINEUP', fromLineupSlotId: 20, toLineupSlotId: 23 },
        { playerId: -16016, type: 'LINEUP', fromLineupSlotId: 16, toLineupSlotId: 20 },
      ],
    });
  });

  it('builds nothing when a part can’t be stated exactly', () => {
    const build = (id: string, to: string) =>
      espnLineupRequest({ teamId: '10', week: 9, items: [{ id, from: 'BENCH', to }] });
    expect(build('abc', 'QB')).toBeUndefined();
    expect(build('1', 'OP')).toBeUndefined();
    expect(espnLineupRequest({ teamId: '10', week: 9, items: [] })).toBeUndefined();
  });

  it('finds the member in the session', () => {
    expect(espnMemberId(cookie)).toBe(swid);
    expect(espnMemberId('espn_s2=secret')).toBeUndefined();
  });
});

describe('EspnMoveClient', () => {
  const client = (answer: () => Response | Promise<Response>) => {
    const calls: { url: string; init: RequestInit }[] = [];
    return {
      calls,
      espn: new EspnMoveClient(cookie, (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return answer();
      }) as typeof fetch),
    };
  };

  it('sends once to ESPN’s write host with the member added', async () => {
    const { espn, calls } = client(() => new Response('{}'));
    expect(await espn.submit('599', 2026, request)).toEqual({ outcome: 'sent' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      'https://lm-api-writes.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/599/transactions/',
    );
    expect(JSON.parse(String(calls[0]!.init.body)).memberId).toBe(swid);
  });

  it('separates refused, signed out and unknown results', async () => {
    const outcome = async (answer: () => Response | Promise<Response>) => {
      const { espn, calls } = client(answer);
      const result = await espn.submit('599', 2026, request);
      expect(calls).toHaveLength(1);
      return result;
    };
    expect(
      await outcome(() => new Response('{"messages":["Player is locked"]}', { status: 409 })),
    ).toEqual({ outcome: 'rejected', reason: 'Player is locked' });
    expect(await outcome(() => new Response('', { status: 403 }))).toEqual({
      outcome: 'signed-out',
    });
    expect(await outcome(() => new Response('', { status: 503 }))).toEqual({
      outcome: 'uncertain',
    });
    expect(
      await outcome(() => {
        throw new Error('timed out');
      }),
    ).toEqual({ outcome: 'uncertain' });
  });

  it('confirms ownership against the team’s owners', async () => {
    const teams = (owners: string[]) =>
      new Response(JSON.stringify({ teams: [{ id: 10, owners }] }));
    expect(await client(() => teams([swid.toLowerCase()])).espn.ownsTeam('599', 2026, '10')).toBe(
      true,
    );
    expect(await client(() => teams(['{OTHER}'])).espn.ownsTeam('599', 2026, '10')).toBe(false);
    expect(await client(() => teams([swid])).espn.ownsTeam('599', 2026, '11')).toBe(false);
  });
});
