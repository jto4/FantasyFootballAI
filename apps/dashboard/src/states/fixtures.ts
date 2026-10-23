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
export function stubApi() {
  window.fetch = async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input), location.origin);
    const league = url.searchParams.get('league');
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
