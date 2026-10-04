import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectorFor } from './index.js';
import { EspnConnector, SleeperPlayerCatalog, YahooConnector } from './index.js';
import { LocalCLIProvider, OpenAICompatibleProvider } from './ai.js';
import { ResendChannel, TwilioChannel } from './channels.js';

describe('connector selection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('provides an adapter for each planned fantasy platform', () => {
    expect(
      ['sleeper', 'espn', 'yahoo'].map(
        (platform) => connectorFor(platform as 'sleeper' | 'espn' | 'yahoo').platform,
      ),
    ).toEqual(['sleeper', 'espn', 'yahoo']);
  });

  it('does not attempt Yahoo access without an authorized token', async () => {
    await expect(connectorFor('yahoo').fetchLeague('123')).rejects.toThrow(/OAuth access token/);
  });

  it('reports expired Yahoo tokens without exposing token contents', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    await expect(new YahooConnector('sensitive-token').fetchLeague('123')).rejects.toThrow(
      'Yahoo rejected the access token (401). Reconnect Yahoo from Settings.',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a Yahoo rate-limited read after the server retry window', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fantasy_content: {
              league: [
                { league_key: 'nfl.l.123', name: 'Sunday Crew', season: '2026', num_teams: '0' },
                { settings: [{ scoring_type: 'head', roster_positions: [] }], standings: [] },
              ],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetch);

    const league = await new YahooConnector('authorized-token').fetchLeague('123');

    expect(league.name).toBe('Sunday Crew');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('normalizes Yahoo league metadata, scoring, standings, and owners', async () => {
    const yahooResponse = {
      fantasy_content: {
        league: [
          {
            league_key: 'nfl.l.123',
            name: 'Sunday Crew',
            season: '2026',
            num_teams: '2',
            current_week: '3',
            start_week: null,
            is_finished: '0',
          },
          {
            settings: [
              {
                scoring_type: 'head',
                draft_type: 'live',
                draft_time: '1787268600',
                playoff_start_week: '15',
                roster_positions: [{ roster_position: { position: 'QB', count: '1' } }],
                stat_categories: [
                  {
                    stats: {
                      stat: [
                        { stat_id: '4', name: 'Passing Yards' },
                        { stat_id: '5', name: 'Interceptions' },
                      ],
                    },
                  },
                ],
                stat_modifiers: [
                  {
                    stats: {
                      stat: [
                        { stat_id: '4', value: '0.04' },
                        { stat_id: '5', value: null },
                      ],
                    },
                  },
                ],
              },
            ],
            standings: [
              {
                teams: {
                  0: {
                    team: [
                      [
                        {
                          team_key: 'nfl.l.123.t.1',
                          team_id: '1',
                          name: 'Fourth and Long',
                          managers: [{ manager: { nickname: 'Commissioner' } }],
                        },
                      ],
                      {
                        team_standings: {
                          outcome: { wins: '2', losses: '1' },
                          points_for: '340.5',
                        },
                      },
                    ],
                  },
                  1: {
                    team: [
                      [{ team_key: 'nfl.l.123.t.2', team_id: '2', name: 'Null Points' }],
                      {
                        team_standings: {
                          outcome: { wins: null, losses: '', points_for: null },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    };
    const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(yahooResponse), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetch);

    const league = await new YahooConnector('authorized-token').fetchLeague('123');

    expect(league).toMatchObject({
      platform: 'yahoo',
      name: 'Sunday Crew',
      draftScheduledAt: '2026-08-20T23:30:00.000Z',
      teamCount: 2,
      scoring: { 'Passing Yards': 0.04 },
      settings: {
        scoringType: 'head',
        draftType: 'live',
        currentWeek: 3,
        playoffStartWeek: 15,
        seasonComplete: false,
      },
      teams: [
        {
          id: '1',
          name: 'Fourth and Long',
          owner: 'Commissioner',
          wins: 2,
          losses: 1,
          pointsFor: 340.5,
        },
        { id: '2', name: 'Null Points', wins: undefined, losses: undefined, pointsFor: undefined },
      ],
    });
    expect(league.settings.startWeek).toBeUndefined();
    expect(league.scoring).toEqual({ 'Passing Yards': 0.04 });
    expect(league.teams[1]?.wins).toBeUndefined();
    expect(league.teams[1]?.losses).toBeUndefined();
    expect(league.teams[1]?.pointsFor).toBeUndefined();
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/league/nfl.l.123;out=settings,standings?format=json');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer authorized-token');
  });

  it('loads Yahoo current-week scoreboard matchups into normalized team ids and scores', async () => {
    const responses: Record<string, unknown> = {
      '/league/nfl.l.123;out=settings,standings': {
        fantasy_content: {
          league: [
            { league_key: 'nfl.l.123', name: 'Sunday Crew', season: '2026', current_week: '4' },
            {
              settings: [{ scoring_type: 'head', roster_positions: [] }],
              standings: [
                {
                  teams: {
                    0: { team: [[{ team_id: '1', team_key: 'nfl.l.123.t.1', name: 'A' }]] },
                  },
                },
              ],
            },
          ],
        },
      },
      '/league/nfl.l.123/scoreboard;week=4': {
        fantasy_content: {
          league: [
            { league_key: 'nfl.l.123' },
            {
              scoreboard: {
                0: {
                  week: '4',
                  matchups: {
                    0: {
                      matchup: [
                        { week: '4', status: 'midevent' },
                        {
                          teams: {
                            0: {
                              team: [
                                [{ team_id: '1', team_key: 'nfl.l.123.t.1', name: 'A' }],
                                { team_points: { total: '120.75' } },
                              ],
                            },
                            1: {
                              team: [
                                [{ team_id: '2', team_key: 'nfl.l.123.t.2', name: 'B' }],
                                { team_points: { total: '99.5' } },
                              ],
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
      },
    };
    const fetch = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      const body = responses[url.pathname.replace('/fantasy/v2', '')];
      return Promise.resolve(
        new Response(body === undefined ? null : JSON.stringify(body), {
          status: body === undefined ? 404 : 200,
        }),
      );
    });
    vi.stubGlobal('fetch', fetch);

    const league = await new YahooConnector('authorized-token').fetchLeague('123');

    expect(league.matchups).toEqual([
      {
        week: 4,
        teams: [
          { teamId: '1', points: 120.75 },
          { teamId: '2', points: 99.5 },
        ],
      },
    ]);
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes('/league/nfl.l.123/scoreboard;week=4')),
    ).toBe(true);
  });

  it('normalizes Yahoo team rosters and league draft results when available', async () => {
    const responses: Record<string, unknown> = {
      '/league/nfl.l.123;out=settings,standings': {
        fantasy_content: {
          league: [
            { league_key: 'nfl.l.123', name: 'Sunday Crew', season: '2026', num_teams: '1' },
            {
              settings: [{ scoring_type: 'head', roster_positions: [] }],
              standings: [
                {
                  teams: {
                    0: {
                      team: [
                        [{ team_key: 'nfl.l.123.t.1', team_id: '1', name: 'Fourth and Long' }],
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      '/league/nfl.l.123/teams/roster': {
        fantasy_content: {
          league: [
            {
              teams: {
                0: {
                  team: [
                    [{ team_key: 'nfl.l.123.t.1', team_id: '1', name: 'Fourth and Long' }],
                    {
                      roster: {
                        players: {
                          0: {
                            player: [
                              [
                                {
                                  player_key: 'nfl.p.55',
                                  player_id: '55',
                                  name: { full: 'Avery Runner' },
                                  display_position: 'RB',
                                  editorial_team_abbr: 'BUF',
                                },
                              ],
                              { selected_position: { position: 'RB' } },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
      '/league/nfl.l.123/draftresults': {
        fantasy_content: {
          league: [
            {
              draft_results: {
                draft_result: [
                  { pick: '1', round: '1', team_key: 'nfl.l.123.t.1', player_key: 'nfl.p.55' },
                ],
              },
            },
          ],
        },
      },
    };
    const fetch = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      const body = responses[url.pathname.replace('/fantasy/v2', '')];
      return Promise.resolve(
        new Response(body === undefined ? null : JSON.stringify(body), {
          status: body === undefined ? 404 : 200,
        }),
      );
    });
    vi.stubGlobal('fetch', fetch);

    const league = await new YahooConnector('authorized-token').fetchLeague('123');

    expect(league.teams[0]).toMatchObject({
      rosterPlayerIds: ['nfl.p.55'],
      rosterSize: 1,
      roster: [
        {
          id: 'nfl.p.55',
          name: 'Avery Runner',
          position: 'RB',
          rosterPosition: 'RB',
          nflTeam: 'BUF',
        },
      ],
    });
    expect(league.draft?.picks).toEqual([
      { playerId: 'nfl.p.55', teamId: '1', round: 1, pickNumber: 1 },
    ]);
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [, init] of fetch.mock.calls as [string, RequestInit][]) {
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer authorized-token');
    }
  });

  it('loads current Sleeper matchups and normalizes roster ids and scores', async () => {
    const responses: Record<string, unknown> = {
      '/league/league-1': {
        name: 'Sleeper Test',
        season: '2026',
        status: 'in_season',
        total_rosters: 2,
        draft_id: 'draft-1',
        scoring_settings: { rec: 1 },
        settings: { playoff_teams: 4, playoff_week_start: 15 },
        roster_positions: ['QB', 'RB'],
      },
      '/league/league-1/rosters': [
        {
          roster_id: 1,
          owner_id: 'manager-1',
          settings: { wins: 2, losses: 1, fpts: 340, fpts_decimal: 50 },
          players: ['p1'],
        },
        {
          roster_id: 2,
          owner_id: 'manager-2',
          settings: { wins: 1, losses: 2, fpts: 298 },
          players: ['p2'],
        },
      ],
      '/league/league-1/users': [
        { user_id: 'manager-1', display_name: 'First Manager' },
        { user_id: 'manager-2', display_name: 'Second Manager' },
      ],
      '/state/nfl': { season: '2026', display_week: 3 },
      '/league/league-1/matchups/3': [
        {
          matchup_id: 7,
          roster_id: 1,
          points: 104.5,
          players: ['p1', 'p3'],
          starters: ['p1', null],
        },
        { matchup_id: 7, roster_id: 2, points: 98, players: ['p2'], starters: ['p2'] },
      ],
      '/players/nfl': {
        p1: {
          first_name: 'Avery',
          last_name: 'Runner',
          position: 'RB',
          team: 'BUF',
          status: 'Active',
        },
        p2: { full_name: 'Blake Catcher', position: 'WR', team: 'KC' },
      },
      '/draft/draft-1': {
        league_id: 'league-1',
        season: '2026',
        status: 'complete',
        start_time: Date.parse('2026-08-20T23:30:00.000Z'),
      },
      '/draft/draft-1/picks': [
        {
          player_id: 'p1',
          roster_id: '1',
          round: 1,
          pick_no: 1,
          draft_slot: 1,
          metadata: { position: 'RB', team: 'BUF' },
        },
      ],
    };
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const route = url.pathname.replace('/v1', '');
      const body = responses[route];
      return Promise.resolve(
        new Response(body === undefined ? null : JSON.stringify(body), {
          status: body === undefined ? 404 : 200,
        }),
      );
    });
    vi.stubGlobal('fetch', fetch);

    const league = await connectorFor('sleeper').fetchLeague('league-1');

    expect(league.settings).toMatchObject({
      playoff_teams: 4,
      playoff_week_start: 15,
      seasonStatus: 'in_season',
      roster_positions: ['QB', 'RB'],
      currentWeek: 3,
    });
    expect(league.teams[0]).toMatchObject({
      pointsFor: 340.5,
      rosterPlayerIds: ['p1'],
      roster: [
        { id: 'p1', name: 'Avery Runner', position: 'RB', nflTeam: 'BUF', status: 'Active' },
      ],
    });
    expect(league.teams[1]?.pointsFor).toBe(298);
    expect(league.draft).toMatchObject({
      id: 'draft-1',
      status: 'complete',
      season: 2026,
      scheduledAt: '2026-08-20T23:30:00.000Z',
      picks: [
        {
          playerId: 'p1',
          playerName: 'Avery Runner',
          teamId: '1',
          round: 1,
          pickNumber: 1,
          draftSlot: 1,
          position: 'RB',
          nflTeam: 'BUF',
        },
      ],
    });
    expect(league.matchups).toEqual([
      {
        week: 3,
        teams: [
          { teamId: '1', points: 104.5, playerIds: ['p1', 'p3'], starters: ['p1', ''] },
          { teamId: '2', points: 98, playerIds: ['p2'], starters: ['p2'] },
        ],
      },
    ]);
    expect(league.settings).toMatchObject({
      currentWeek: 3,
      playoff_week_start: 15,
      seasonStatus: 'in_season',
    });
    expect(fetch).toHaveBeenCalledTimes(8);
  });

  it('keeps Sleeper draft start metadata available before any picks are made', async () => {
    const startTime = Date.parse('2026-08-20T23:30:00.000Z');
    const responses: Record<string, unknown> = {
      '/league/pre-draft': {
        name: 'Pre-draft league',
        season: '2026',
        total_rosters: 2,
        draft_id: 'draft-early',
        scoring_settings: {},
        settings: {},
        roster_positions: ['QB'],
      },
      '/league/pre-draft/rosters': [],
      '/league/pre-draft/users': [],
      '/state/nfl': { season: '2026', display_week: 1 },
      '/league/pre-draft/matchups/1': [],
      '/players/nfl': {},
      '/draft/draft-early': {
        league_id: 'pre-draft',
        season: '2026',
        status: 'pre_draft',
        start_time: startTime,
      },
      '/draft/draft-early/picks': [],
    };
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const route = new URL(String(input)).pathname.replace('/v1', '');
      const body = responses[route];
      return Promise.resolve(
        new Response(body === undefined ? null : JSON.stringify(body), {
          status: body === undefined ? 404 : 200,
        }),
      );
    });
    vi.stubGlobal('fetch', fetch);

    const league = await connectorFor('sleeper').fetchLeague('pre-draft');

    expect(league.draft).toEqual({
      id: 'draft-early',
      status: 'pre_draft',
      season: 2026,
      scheduledAt: '2026-08-20T23:30:00.000Z',
      picks: [],
    });
  });

  it('coalesces Sleeper player catalog downloads and refreshes no more than daily', async () => {
    let now = 0;
    const catalog = new SleeperPlayerCatalog(() => now);
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ p1: { full_name: 'Avery Runner', position: 'RB' } }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetch);

    const [first, concurrent] = await Promise.all([catalog.get(), catalog.get()]);
    expect(first).toBe(concurrent);
    await catalog.get();
    expect(fetch).toHaveBeenCalledTimes(1);
    now += 24 * 60 * 60 * 1_000;
    await catalog.get();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('accepts current-sized Sleeper player catalogs above the old response cap', async () => {
    const catalog = new SleeperPlayerCatalog();
    const body = JSON.stringify(
      Object.fromEntries(
        Array.from({ length: 10_000 }, (_, index) => [
          `player-${index}`,
          {
            full_name: `Player ${index}`,
            position: 'WR',
            metadata: 'x'.repeat(700),
          },
        ]),
      ),
    );
    expect(Buffer.byteLength(body)).toBeGreaterThan(6_000_000);
    expect(Buffer.byteLength(body)).toBeLessThan(20_000_000);
    const fetch = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    const players = await catalog.get();

    expect(players.size).toBe(10_000);
    expect(players.get('player-8123')).toMatchObject({
      id: 'player-8123',
      name: 'Player 8123',
      position: 'WR',
    });
  });

  it('keeps the last good Sleeper player catalog when its daily refresh fails', async () => {
    let now = 0;
    const catalog = new SleeperPlayerCatalog(() => now);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ p1: { full_name: 'Avery Runner' } }), { status: 200 }),
      )
      .mockRejectedValueOnce(new Error('temporary network failure'));
    vi.stubGlobal('fetch', fetch);

    const original = await catalog.get();
    now += 24 * 60 * 60 * 1_000;
    expect(await catalog.get()).toBe(original);
    expect((await catalog.get()).get('p1')?.name).toBe('Avery Runner');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('loads the owner-authorized ESPN current-week matchups and ignores other weeks', async () => {
    const espnResponse = {
      seasonId: 2026,
      settings: {
        name: 'ESPN Crew',
        draftSettings: { date: '2026-08-20T23:30:00.000Z' },
        scoringSettings: {
          scoringType: 'H2H_POINTS',
          scoringItems: [
            { statId: 53, points: 1 },
            { statId: 54, points: null },
            { statId: 55, points: '' },
          ],
        },
        scheduleSettings: { matchupPeriodCount: 14, playoffTeamCount: 6 },
      },
      status: { currentMatchupPeriod: 3 },
      teams: [
        {
          id: 1,
          name: 'North',
          record: { overall: { wins: 2, losses: 1 } },
          roster: {
            entries: [
              {
                playerId: 100,
                lineupSlotId: 0,
                playerPoolEntry: {
                  player: {
                    id: 100,
                    fullName: 'Avery Quarterback',
                    defaultPositionId: 1,
                    injuryStatus: 'ACTIVE',
                  },
                },
              },
            ],
          },
        },
        { id: 2, name: 'South', record: { overall: { wins: 1, losses: 2 } } },
      ],
      draftDetail: {
        drafted: true,
        picks: [
          { playerId: 100, teamId: 1, overallPickNumber: 1, roundId: 1, roundPickNumber: 1 },
          { playerId: 200, teamId: 2, overallPickNumber: 2, roundId: 1, roundPickNumber: 2 },
        ],
      },
      schedule: [
        {
          matchupPeriodId: 3,
          home: { teamId: 1, totalPointsLive: 108.25 },
          away: { teamId: 2, totalPoints: 97.5 },
        },
        {
          matchupPeriodId: 2,
          home: { teamId: 1, totalPoints: 80 },
          away: { teamId: 2, totalPoints: 70 },
        },
      ],
    };
    const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(espnResponse), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetch);

    const league = await new EspnConnector('owner-authorized-cookie', 2026).fetchLeague('12345');

    expect(league).toMatchObject({
      platform: 'espn',
      displayName: 'ESPN Crew',
      season: 2026,
      draftScheduledAt: '2026-08-20T23:30:00.000Z',
      settings: {
        currentWeek: 3,
        playoffStartWeek: 15,
        playoffStartWeekSource: 'derived',
      },
      teams: [
        {
          id: '1',
          rosterPlayerIds: ['100'],
          roster: [
            {
              id: '100',
              name: 'Avery Quarterback',
              position: 'QB',
              rosterPosition: 'QB',
              status: 'ACTIVE',
            },
          ],
        },
        { id: '2' },
      ],
      draft: {
        status: 'complete',
        season: 2026,
        picks: [
          {
            playerId: '100',
            playerName: 'Avery Quarterback',
            teamId: '1',
            round: 1,
            pickNumber: 1,
            draftSlot: 1,
            position: 'QB',
          },
          { playerId: '200', teamId: '2', round: 1, pickNumber: 2, draftSlot: 2 },
        ],
      },
      matchups: [
        {
          week: 3,
          teams: [
            { teamId: '1', points: 108.25 },
            { teamId: '2', points: 97.5 },
          ],
        },
      ],
    });
    expect(league.scoring).toEqual({ '53': 1 });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/seasons/2026/');
    expect(url).toContain('view=mMatchupScore');
    expect(new Headers(init.headers).get('cookie')).toBe('owner-authorized-cookie');
    const supplementalCall = fetch.mock.calls.find(([candidate]) =>
      String(candidate).includes('view=mRoster'),
    );
    expect(String(supplementalCall?.[0])).toContain('view=mDraftDetail');
    expect(String(supplementalCall?.[0])).toContain('scoringPeriodId=3');
    expect(new Headers(supplementalCall?.[1]?.headers).get('cookie')).toBe(
      'owner-authorized-cookie',
    );
  });

  it('ignores ESPN draft dates that are not timezone-qualified ISO timestamps', async () => {
    const response = {
      seasonId: 2026,
      settings: { name: 'ESPN crew', draftSettings: { date: '2026-08-20T23:30:00' } },
      teams: [{ id: 1, name: 'Team One' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(response), { status: 200 }))),
    );

    const league = await new EspnConnector().fetchLeague('12345');

    expect(league.draftScheduledAt).toBeUndefined();
  });

  it('rejects an invalid ESPN season before making a network request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(new EspnConnector(undefined, 2100).fetchLeague('12345')).rejects.toThrow(
      /season between 2000 and 2099/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the owner-selected season for ESPN league and supplemental requests', async () => {
    const fetch = vi.fn((_input: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          JSON.stringify({ seasonId: 2024, teams: [{ id: 1, name: 'Team One' }], status: {} }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetch);

    const league = await new EspnConnector(undefined, 2024).fetchLeague('12345');

    expect(league.season).toBe(2024);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url] of fetch.mock.calls) expect(String(url)).toContain('/seasons/2024/');
  });
});

describe('provider adapters', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends only the configured prompt to the OpenAI-compatible endpoint', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'A sharp, sourced take.' } }] }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const provider = new OpenAICompatibleProvider(
      'secret-test-key',
      'model-x',
      'https://example.test/v1',
    );
    await expect(
      provider.generate({ system: 'system prompt', prompt: 'league data' }),
    ).resolves.toBe('A sharp, sourced take.');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/v1/chat/completions');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer secret-test-key');
    expect(JSON.parse(String(init.body)).messages[1].content).toBe('league data');
  });

  it('passes local AI requests over stdin without invoking a shell', async () => {
    const command =
      "let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>process.stdout.write(input.includes('connection test')?'OK':'missing prompt'));";
    const provider = new LocalCLIProvider(process.execPath, ['-e', command]);
    await expect(
      provider.generate({ system: 'system instruction', prompt: 'connection test' }),
    ).resolves.toBe('OK');
  });

  it('sends Resend email through its API and returns the message id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 })),
    );
    await expect(
      new ResendChannel('key', 'league@example.test').send({
        to: 'user@example.test',
        subject: 'Week 1',
        body: 'Hello',
      }),
    ).resolves.toEqual({ providerMessageId: 'email-1' });
  });

  it('sends Twilio SMS and returns the message id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: 'sms-1' }), { status: 200 })),
    );
    await expect(
      new TwilioChannel('AC123', 'secret', '+15550001111').send({
        to: '+15550002222',
        body: 'Hello',
      }),
    ).resolves.toEqual({ providerMessageId: 'sms-1' });
  });
});
