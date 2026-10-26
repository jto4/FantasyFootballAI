import type { WeeklyBriefing } from '../ui/weekly-briefing';

/** Fictional data only. */
export const briefingFixture: WeeklyBriefing = {
  week: 8,
  coverage: { known: 9, total: 9, alreadyPlayed: 0 },
  lineup: {
    complete: true,
    points: 112.4,
    changes: [
      {
        slot: 'FLEX',
        start: { id: 'p9', name: 'Fictional Flex Back', points: 7.8 },
        bench: { id: 'p3', name: 'Fictional Receiver Two', points: 0 },
      },
    ],
  },
  availability: [],
  waivers: [],
  notes: [],
  matchup: {
    week: 8,
    winProbability: 0.634,
    you: {
      teamId: 'team',
      name: 'Fictional Ones',
      projected: 112.4,
      starters: [
        {
          id: 'p1',
          name: 'Fictional Quarterback',
          position: 'QB',
          estimate: 18.2,
          range: { low: 7.6, high: 29.4 },
        },
        {
          id: 'p2',
          name: 'Fictional Back',
          position: 'RB',
          estimate: 13.1,
          playChance: 0.68,
          range: { low: 4.7, high: 23.9 },
        },
        {
          id: 'p3',
          name: 'Fictional Receiver',
          position: 'WR',
          estimate: 16.4,
          range: { low: 6.1, high: 27.8 },
        },
        {
          id: 'p4',
          name: 'Fictional Tight End',
          position: 'TE',
          estimate: 9.2,
          range: { low: 2.8, high: 18.1 },
        },
        {
          id: 'p5',
          name: 'Fictional D/ST',
          position: 'DST',
          estimate: 7.5,
          range: { low: 0.4, high: 16.9 },
        },
      ],
    },
    opponent: {
      teamId: 'other',
      name: 'Fictional Twos',
      projected: 104.9,
      starters: [
        {
          id: 'o1',
          name: 'Other Quarterback',
          position: 'QB',
          estimate: 16.8,
          range: { low: 6.9, high: 27.4 },
        },
        {
          id: 'o2',
          name: 'Other Back',
          position: 'RB',
          estimate: 11.9,
          range: { low: 3.9, high: 22.0 },
        },
        {
          id: 'o3',
          name: 'Other Receiver',
          position: 'WR',
          estimate: 14.0,
          range: { low: 5.0, high: 24.6 },
        },
        {
          id: 'o4',
          name: 'Other Tight End',
          position: 'TE',
          estimate: 8.1,
          range: { low: 2.2, high: 16.7 },
        },
        {
          id: 'o5',
          name: 'Other D/ST',
          position: 'DST',
          estimate: 6.6,
          range: { low: -0.5, high: 15.8 },
        },
      ],
    },
  },
};

export const alertsFixture = {
  leagueId: 'alert',
  teamId: 'team',
  leagueName: 'Fictional League',
  week: 8,
  alerts: [
    {
      playerId: 'p3',
      name: 'Fictional Receiver Two',
      reason: 'inactive',
      kickoffAt: '2026-11-01T17:00:00.000Z',
      replacement: { id: 'p9', name: 'Fictional Flex Back', estimate: 7.8 },
    },
  ],
  nextKickoffAt: '2026-11-01T17:00:00.000Z',
};

/** Answers the gallery's API calls by league id: pending, failed, an alert or all clear. */
const value = (
  id: string,
  name: string,
  position: string,
  age: number,
  above: [number, number, number, number],
  basis = 'production',
) => ({
  id,
  name,
  position,
  nflTeam: 'SEA',
  age,
  seasons: above.map((v) => v + 80),
  aboveReplacement: above,
  value: Math.round(above[0] + above[1] * 0.85 + above[2] * 0.7225 + above[3] * 0.614),
  basis,
});
const rookie = (
  id: string,
  name: string,
  position: string,
  pick: number,
  v: number,
  worth: string,
) => ({
  id,
  name,
  position,
  nflTeam: 'KC',
  nflDraftPick: pick,
  value: v,
  basis: 'blend',
  worthPick: worth,
});
export const dynastyFixture = {
  league: {
    id: 'dynasty',
    name: 'Fictional Dynasty League',
    format: 'dynasty',
    detectedFormat: 'dynasty',
    teams: 12,
    season: 2026,
    remainingGames: 10.4,
  },
  team: {
    id: 'team',
    name: 'Fictional Ones',
    value: 1840,
    thisSeason: 412,
    averageAge: 25.4,
    nowRank: 3,
    longRank: 1,
    outlook: 'contender',
  },
  teams: [],
  roster: [
    value('r1', 'Fictional Young Receiver', 'WR', 24.5, [122, 219, 210, 161]),
    value('r2', 'Fictional Veteran Back', 'RB', 29.6, [96, 62, 31, 12]),
    value('r3', 'Fictional Rookie Back', 'RB', 21.3, [30, 120, 145, 153], 'blend'),
    {
      ...value('r4', 'Fictional Taxi End', 'TE', 22.1, [0, 12, 24, 31], 'blend'),
      rosterPosition: 'TAXI',
    },
  ],
  rookies: {
    season: 2027,
    board: [
      rookie('k1', 'Fictional First Back', 'RB', 4, 330, '1.01'),
      {
        ...rookie('k2', 'Fictional Fast Receiver', 'WR', 9, 221, '1.03'),
        rosteredBy: 'Fictional Twos',
      },
      rookie('k3', 'Fictional Big End', 'TE', 30, 81, '2.01'),
    ],
    plan: {
      slot: 10,
      need: ['TE'],
      rounds: [
        {
          round: 1,
          pick: '1.10',
          pickValue: 96,
          target: rookie('k1', 'Fictional First Back', 'RB', 4, 330, '1.01'),
          alternatives: [],
        },
        {
          round: 2,
          pick: '2.10',
          pickValue: 37,
          target: rookie('k3', 'Fictional Big End', 'TE', 30, 81, '2.01'),
          alternatives: [],
        },
        { round: 3, pick: '3.10', pickValue: 14, alternatives: [] },
        { round: 4, pick: '4.10', pickValue: 6, alternatives: [] },
      ],
    },
  },
  picks: [
    {
      season: 2027,
      rounds: [1, 2, 3, 4].map((round) => ({
        round,
        early: 210 / round ** 1.6,
        mid: 130 / round ** 1.6,
        late: 90 / round ** 1.6,
      })),
    },
  ],
  taxi: { slots: 3, used: 1, moveToTaxi: [], activate: [] },
  warnings: [],
};

export function stubApi() {
  window.fetch = async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input), location.origin);
    const league = url.searchParams.get('league');
    if (url.pathname === '/api/live')
      return new Response(
        JSON.stringify({
          leagueName: 'Fictional League',
          week: 8,
          imported: true,
          gamesAvailable: true,
          matchupWeek: 8,
          matchup: {
            you: {
              teamId: 'team',
              name: 'Fictional Ones',
              points: 99.2,
              projectedFinal: 99.2,
              starters: [],
              yetToPlay: 0,
              playing: 0,
            },
            opponent: {
              teamId: 'other',
              name: 'Fictional Twos',
              points: 97.4,
              projectedFinal: 109.4,
              starters: [],
              yetToPlay: 1,
              playing: 0,
            },
            winChance: 0.12,
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    if (url.pathname === '/api/dynasty')
      return new Response(JSON.stringify(dynastyFixture), {
        headers: { 'content-type': 'application/json' },
      });
    if (url.pathname === '/api/advice/watchlist')
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'w1',
              name: 'Fictional Sleeper',
              position: 'WR',
              nflTeam: 'SEA',
              rosteredBy: 'Free agent',
              projected: 9.4,
              range: { low: 2.9, high: 17.8 },
            },
            {
              id: 'w2',
              name: 'Fictional Starter',
              position: 'RB',
              nflTeam: 'LA',
              rosteredBy: 'Fictional Twos',
              projected: 14.2,
              range: { low: 5.1, high: 25.3 },
            },
            {
              id: 'w3',
              name: 'Fictional Injured',
              position: 'TE',
              nflTeam: 'KC',
              rosteredBy: 'Free agent',
              status: 'Out',
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    if (url.pathname === '/api/alerts') {
      if (league === 'pending') return new Promise<Response>(() => undefined);
      if (league === 'failed')
        return new Response(
          JSON.stringify({ error: 'Alerts are unavailable.', code: 'upstream_unavailable' }),
          {
            status: 502,
            headers: {
              'content-type': 'application/json',
              'x-sidekick-request-id': '3f2a9c1e-1111-4222-8333-944455556666',
            },
          },
        );
      const body = league === 'alert' ? alertsFixture : { ...alertsFixture, alerts: [] };
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Not stubbed in the gallery.' }), { status: 404 });
  };
}

/** Mid-week: saved league scores are stale (6.3 to 0), so the card must show Live's numbers. */
export const underwayBriefingFixture: WeeklyBriefing = {
  ...briefingFixture,
  matchup: {
    ...briefingFixture.matchup!,
    you: {
      ...briefingFixture.matchup!.you,
      points: 6.3,
      starters: briefingFixture.matchup!.you.starters.map(({ estimate: _e, range: _r, ...p }) => ({
        ...p,
        started: true as const,
      })),
    },
    opponent: { ...briefingFixture.matchup!.opponent, points: 0 },
  },
};
