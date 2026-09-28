import { afterEach, describe, expect, it, vi } from 'vitest';
import { EspnConnector, SleeperConnector, YahooConnector } from './platforms.js';
import { boundedDisplayName, boundedLabel, boundedId } from './platforms/shared.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('bounded platform display names', () => {
  it('limits remote names and rejects control characters with a safe fallback', () => {
    expect(boundedDisplayName(` ${'League'.repeat(30)} `, 'Fallback')).toHaveLength(120);
    expect(boundedDisplayName('League\r\nBcc: attacker@example.com', 'Fallback')).toBe('Fallback');
    expect(boundedDisplayName('   ', 'Safe fallback')).toBe('Safe fallback');
    expect(boundedLabel(' Ada '.repeat(40))).toHaveLength(120);
    expect(boundedLabel('Ada\nBcc: attacker@example.com')).toBeUndefined();
    expect(boundedId('team\r\nowner', 40)).toBeUndefined();
  });
});

describe('Sleeper league connector', () => {
  it('bounds manager labels and rejects oversized roster metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/league/unsafe'))
          return json({ name: 'League', season: 2026, total_rosters: 1 });
        if (url.endsWith('/league/unsafe/rosters'))
          return json([{ roster_id: 1, owner_id: 'owner' }]);
        if (url.endsWith('/league/unsafe/users'))
          return json([{ user_id: 'owner', display_name: 'Manager\r\nInjected: true' }]);
        if (url.endsWith('/players/nfl'))
          return json({
            'player-1': { full_name: 'Quarterback One', position: 'QB', team: 'BUF' },
            'player-2': { full_name: 'Receiver Two', position: 'WR', team: 'NYJ' },
          });
        if (url.endsWith('/state/nfl')) return json({ season: 2026, display_week: 0 });
        throw new Error(`Unexpected Sleeper request: ${url}`);
      }),
    );

    const league = await new SleeperConnector().fetchLeague('unsafe');
    expect(league.teams[0]).toMatchObject({ name: 'Team 1', owner: 'Manager' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/league/oversized'))
          return json({ name: 'League', season: 2026, total_rosters: 33 });
        if (url.endsWith('/league/oversized/rosters')) return json(Array(33).fill({}));
        if (url.endsWith('/league/oversized/users')) return json([]);
        throw new Error(`Unexpected Sleeper request: ${url}`);
      }),
    );
    await expect(new SleeperConnector().fetchLeague('oversized')).rejects.toThrow(
      'oversized roster or manager data',
    );
  });

  it('normalizes a public league, fractional scoring, rosters, and active matchup starters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/league/league-1'))
          return json({
            name: 'Sunday League',
            season: '2026',
            status: 'in_season',
            total_rosters: 2,
            draft_id: 'draft-1',
            roster_positions: ['QB', 'RB', 'WR', 'FLEX', 'SUPER_FLEX'],
            scoring_settings: { pass_td: 4, rec: 0.5 },
            settings: { playoff_week_start: 15, private_cookie: 'must-not-enter-report-context' },
          });
        if (url.endsWith('/league/league-1/rosters'))
          return json([
            {
              roster_id: 1,
              owner_id: 'owner-1',
              players: ['player-1'],
              settings: { wins: 3, losses: 1, fpts: 401, fpts_decimal: 25 },
            },
            {
              roster_id: 2,
              owner_id: 'owner-2',
              players: ['player-2'],
              settings: { wins: 2, losses: 2, fpts: 390, fpts_decimal: 5 },
            },
          ]);
        if (url.endsWith('/league/league-1/users'))
          return json([
            { user_id: 'owner-1', display_name: 'Ada' },
            { user_id: 'owner-2', display_name: 'Linus' },
          ]);
        if (url.endsWith('/players/nfl'))
          return json({
            'player-1': { full_name: 'Quarterback One', position: 'QB', team: 'BUF' },
            'player-2': { full_name: 'Receiver Two', position: 'WR', team: 'NYJ' },
          });
        if (url.endsWith('/state/nfl')) return json({ season: 2026, display_week: 4 });
        if (url.endsWith('/league/league-1/matchups/4'))
          return json([
            {
              matchup_id: 7,
              roster_id: 1,
              points: 101.25,
              players: ['player-1'],
              starters: ['player-1', ''],
            },
            {
              matchup_id: 7,
              roster_id: 2,
              points: 98.5,
              players: ['player-2'],
              starters: ['player-2'],
            },
          ]);
        if (url.endsWith('/draft/draft-1'))
          return json({ league_id: 'league-1', season: '2026', status: 'complete' });
        if (url.endsWith('/draft/draft-1/picks'))
          return json([{ player_id: 'player-1', roster_id: 1, round: 1, pick_no: 1 }]);
        throw new Error(`Unexpected Sleeper request: ${url}`);
      }),
    );

    const league = await new SleeperConnector().fetchLeague('league-1');

    expect(league).toMatchObject({
      platform: 'sleeper',
      name: 'Sunday League',
      season: 2026,
      teamCount: 2,
      scoring: expect.objectContaining({ pass_td: 4, rec: 0.5 }),
      settings: expect.objectContaining({
        seasonStatus: 'in_season',
        roster_positions: expect.arrayContaining(['SUPER_FLEX']),
      }),
      teams: [
        expect.objectContaining({ id: '1', owner: 'Ada', pointsFor: 401.25, rosterSize: 1 }),
        expect.objectContaining({ id: '2', owner: 'Linus', pointsFor: 390.05, rosterSize: 1 }),
      ],
      matchups: [
        {
          week: 4,
          teams: expect.arrayContaining([expect.objectContaining({ starters: ['player-1', ''] })]),
        },
      ],
      draft: expect.objectContaining({
        status: 'complete',
        picks: [expect.objectContaining({ pickNumber: 1, playerName: 'Quarterback One' })],
      }),
    });
    expect(league.settings).not.toHaveProperty('private_cookie');
  });

  it('fails clearly when league access is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: 'not found' }, 404)),
    );
    await expect(new SleeperConnector().fetchLeague('private-or-invalid')).rejects.toThrow(
      'Provider request failed (404)',
    );
  });
});

describe('Yahoo league connector', () => {
  it('requires OAuth and normalizes H2H league settings and standings', async () => {
    await expect(new YahooConnector().fetchLeague('123')).rejects.toThrow(
      'owner-authorized OAuth access token',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/league/nfl.l.123;out=settings,standings'))
          return json({
            fantasy_content: {
              league: [
                {
                  league_key: 'nfl.l.123',
                  name: 'Yahoo H2H',
                  season: '2026',
                  num_teams: 2,
                  current_week: 5,
                  start_week: 1,
                  end_week: 18,
                  scoring_type: 'head',
                },
                {
                  settings: {
                    scoring_type: 'head',
                    private_cookie: 'must-not-enter-report-context',
                    playoff_start_week: 16,
                    roster_positions: ['QB', 'RB', 'WR', 'W/R/T', 'BN'],
                    stat_categories: {
                      stats: [{ stat: { stat_id: 0, display_name: 'Passing TD' } }],
                    },
                    stat_modifiers: { stats: [{ stat: { stat_id: 0, value: '4' } }] },
                  },
                  standings: {
                    teams: {
                      0: {
                        team: [
                          { team_key: 'nfl.l.123.t.1', team_id: '1', name: 'Team One' },
                          {
                            team_standings: {
                              outcome: { wins: '4', losses: '1' },
                              points_for: '501.75',
                            },
                          },
                          { managers: [{ manager: { nickname: 'Ada' } }] },
                        ],
                      },
                      1: {
                        team: [
                          { team_key: 'nfl.l.123.t.2', team_id: '2', name: 'Team Two' },
                          {
                            team_standings: {
                              outcome: { wins: '3', losses: '2' },
                              points_for: '477.5',
                            },
                          },
                          { managers: [{ manager: { nickname: 'Linus' } }] },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          });
        if (url.includes('/league/nfl.l.123/teams/roster;week=5'))
          return json({
            fantasy_content: {
              league: [
                {
                  teams: {
                    0: {
                      team: [
                        { team_key: 'nfl.l.123.t.1', team_id: '1', name: 'Team One' },
                        {
                          roster: {
                            players: {
                              0: {
                                player: [
                                  { player_key: 'nfl.p.1', name: { full: 'Quarterback One' } },
                                  { selected_position: [{ position: 'QB' }] },
                                  { primary_position: [{ position: 'QB' }] },
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
          });
        return json({ error: 'optional data unavailable' }, 404);
      }),
    );

    const league = await new YahooConnector('oauth-test-token').fetchLeague('123');
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.map(([input]) => String(input)).join('\n')).toContain('/teams/roster;week=5');

    expect(league).toMatchObject({
      platform: 'yahoo',
      name: 'Yahoo H2H',
      season: 2026,
      teamCount: 2,
      scoring: expect.objectContaining({ 'Passing TD': 4 }),
      settings: expect.objectContaining({
        scoringType: 'head',
        currentWeek: 5,
        playoffStartWeek: 16,
      }),
      teams: [
        expect.objectContaining({
          id: '1',
          owner: 'Ada',
          wins: 4,
          pointsFor: 501.75,
          roster: [
            expect.objectContaining({
              id: 'nfl.p.1',
              name: 'Quarterback One',
              rosterPosition: 'QB',
            }),
          ],
        }),
        expect.objectContaining({ id: '2', owner: 'Linus', losses: 2, pointsFor: 477.5 }),
      ],
    });
    expect(league.settings).not.toHaveProperty('private_cookie');
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.some(([input]) => String(input).includes('/teams/roster;week=5'))).toBe(true);
    for (const [, init] of calls) {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer oauth-test-token');
    }
  });

  it('does not use out-of-range Yahoo week values for matchup or roster requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/league/nfl.l.456;out=settings,standings'))
          return json({
            fantasy_content: {
              league: [
                {
                  league_key: 'nfl.l.456',
                  name: 'Bounded week league',
                  season: '2026',
                  num_teams: 2,
                  current_week: 9999,
                },
                { settings: { scoring_type: 'head' }, standings: { teams: [] } },
              ],
            },
          });
        return json({ error: 'optional resource unavailable' }, 404);
      }),
    );

    const league = await new YahooConnector('oauth-test-token').fetchLeague('456');
    const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(league.settings).not.toHaveProperty('currentWeek');
    expect(urls.some((url) => url.includes('/scoreboard;week='))).toBe(false);
    expect(urls.some((url) => url.includes('/teams/roster;week='))).toBe(false);
  });

  it('explains expired or rejected credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: 'unauthorized' }, 401)),
    );
    await expect(new YahooConnector('expired-token').fetchLeague('123')).rejects.toThrow(
      'Reconnect Yahoo from Settings',
    );
  });
});

describe('ESPN league connector', () => {
  it('uses the owner session and normalizes an offensive-player flex league', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, ...(init ? { init } : {}) });
        if (url.includes('view=mTeam'))
          return json({
            id: 77,
            seasonId: 2026,
            name: 'ESPN OP flex',
            status: { currentMatchupPeriod: 3, isExpired: false },
            settings: {
              name: 'ESPN OP flex',
              rosterSettings: {
                lineupSlotCounts: {
                  '0': 1,
                  '2': 2,
                  '4': 2,
                  '20': 6,
                  '21': 1,
                  '23': 1,
                  '24': 1,
                },
              },
              scheduleSettings: { matchupPeriodCount: 14, playoffTeamCount: 4 },
              scoringSettings: {
                scoringType: 'H2H_POINTS',
                scoringItems: [
                  { statId: 1, points: 6 },
                  { statId: 3, points: 0.5 },
                ],
              },
              customLeagueMessage: 'Do not share credentials with anyone.',
            },
            teams: [
              {
                id: 1,
                name: 'First Team',
                location: 'Ada',
                record: { overall: { wins: 2, losses: 1, pointsFor: 350.5 } },
              },
              {
                id: 2,
                name: 'Second Team',
                location: 'Linus',
                record: { overall: { wins: 1, losses: 2, pointsFor: 311 } },
              },
            ],
            schedule: [
              {
                matchupPeriodId: 3,
                home: { teamId: 1, totalPointsLive: 120.5 },
                away: { teamId: 2, totalPoints: 114 },
              },
            ],
          });
        if (url.includes('view=mRoster'))
          return json({
            teams: [
              {
                id: 1,
                roster: {
                  entries: [
                    {
                      playerId: 42,
                      lineupSlotId: 0,
                      playerPoolEntry: {
                        player: {
                          fullName: 'Quarterback One',
                          defaultPositionId: 1,
                          injuryStatus: 'ACTIVE',
                        },
                      },
                    },
                  ],
                },
              },
            ],
          });
        throw new Error(`Unexpected ESPN request: ${url}`);
      }),
    );

    const league = await new EspnConnector('espn_s2=owner-session; SWID={owner}', 2026).fetchLeague(
      '77',
    );

    expect(league).toMatchObject({
      platform: 'espn',
      id: '77',
      season: 2026,
      teamCount: 2,
      scoring: { '1': 6, '3': 0.5 },
      settings: expect.objectContaining({
        currentWeek: 3,
        seasonComplete: false,
        scoringType: 'H2H_POINTS',
        playoffStartWeek: 15,
        playoffStartWeekSource: 'derived',
        roster_positions: expect.arrayContaining(['QB', 'RB', 'WR', 'FLEX', 'OP', 'BENCH', 'IR']),
      }),
      teams: [
        expect.objectContaining({
          id: '1',
          pointsFor: 350.5,
          roster: [expect.objectContaining({ id: '42', position: 'QB', rosterPosition: 'QB' })],
        }),
        expect.objectContaining({ id: '2', pointsFor: 311 }),
      ],
      matchups: [
        {
          week: 3,
          teams: [
            expect.objectContaining({ points: 120.5 }),
            expect.objectContaining({ points: 114 }),
          ],
        },
      ],
    });
    expect(league.settings).not.toHaveProperty('customLeagueMessage');
    expect(league.settings).not.toHaveProperty('scheduleSettings');
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(new Headers(request.init?.headers).get('cookie')).toContain('espn_s2=owner-session');
    }
  });

  it('does not send a session cookie for public access and rejects invalid seasons before requests', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      json({ teams: [] }, 200),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(new EspnConnector(undefined, 1999).fetchLeague('77')).rejects.toThrow(
      'between 2000 and 2099',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(new EspnConnector(undefined, 2026).fetchLeague('77')).rejects.toThrow(
      'Private leagues need an owner-authorized session',
    );
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('cookie')).toBeNull();
  });

  it('ignores out-of-range ESPN matchup weeks before requesting supplemental data', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('view=mTeam'))
          return json({
            id: 77,
            seasonId: 2026,
            name: 'Bounded week league',
            status: { currentMatchupPeriod: 9999 },
            settings: {
              scoringSettings: { scoringType: 'H2H_POINTS', scoringItems: [] },
            },
            teams: [
              { id: 1, name: 'One' },
              { id: 2, name: 'Two' },
            ],
            schedule: [{ matchupPeriodId: 9999, home: { teamId: 1 }, away: { teamId: 2 } }],
          });
        if (url.includes('view=mRoster')) return json({ teams: [] });
        throw new Error(`Unexpected ESPN request: ${url}`);
      }),
    );

    const league = await new EspnConnector(undefined, 2026).fetchLeague('77');
    const supplementalUrl = urls.find((url) => url.includes('view=mRoster'));
    expect(league.settings).not.toHaveProperty('currentWeek');
    expect(league.matchups).toBeUndefined();
    expect(supplementalUrl).toContain('scoringPeriodId=1');
    expect(supplementalUrl).not.toContain('scoringPeriodId=9999');
  });

  it('withholds unsupported roster slots and does not infer playoffs for a non-H2H format', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('view=mTeam'))
          return json({
            id: 88,
            seasonId: 2026,
            name: 'Rotisserie League',
            teams: [
              { id: 1, name: 'One' },
              { id: 2, name: 'Two' },
            ],
            settings: {
              rosterSettings: { lineupSlotCounts: { '0': 1, '99': 1 } },
              scheduleSettings: { matchupPeriodCount: 14, playoffTeamCount: 4 },
              scoringSettings: { scoringType: 'ROTISSERIE', scoringItems: [] },
            },
          });
        if (url.includes('view=mRoster'))
          return json({
            teams: [
              {
                id: 1,
                roster: {
                  entries: [
                    {
                      playerId: 44,
                      lineupSlotId: 99,
                      playerPoolEntry: {
                        player: { fullName: 'Unmapped Player', defaultPositionId: 2 },
                      },
                    },
                  ],
                },
              },
            ],
          });
        throw new Error(`Unexpected ESPN request: ${url}`);
      }),
    );

    const league = await new EspnConnector(undefined, 2026).fetchLeague('88');

    expect(league.settings.scoringType).toBe('ROTISSERIE');
    expect(league.settings).not.toHaveProperty('roster_positions');
    expect(league.settings).not.toHaveProperty('playoffStartWeek');
    expect(league.teams[0]?.roster?.[0]).toMatchObject({
      id: '44',
      name: 'Unmapped Player',
      position: 'RB',
    });
    expect(league.teams[0]?.roster?.[0]).not.toHaveProperty('rosterPosition');
  });
});
