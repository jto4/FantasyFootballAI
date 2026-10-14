import { expect, it } from 'vitest';
import type {
  FootballDataSnapshot,
  LeagueConnection,
  NFLDraftProfile,
  PlayerGameStats,
  RosterPlayer,
} from './index.js';
import { buildPlayerEvidence, isNFLDraftProfile } from './index.js';

const asOf = '2026-10-09T12:00:00Z';
const player: RosterPlayer = {
  id: 'sleeper-rookie',
  gsisId: '00-0040999',
  name: 'Fictional Rookie',
  position: 'WR',
  nflTeam: 'BUF',
};
const league: LeagueConnection = {
  id: 'test',
  platform: 'sleeper',
  name: 'Test',
  displayName: 'Test',
  teamCount: 1,
  connectedAt: asOf,
  settings: {},
  teams: [],
  scoring: { rec_yd: 0.1 },
};
const draft: NFLDraftProfile = {
  gsisId: player.gsisId!,
  pfrId: 'FictRo00',
  name: player.name,
  position: 'WR',
  season: 2026,
  round: 1,
  pick: 20,
  draftTeam: 'ATL',
  college: 'Fictional College',
};
function fixture(): FootballDataSnapshot {
  const players: PlayerGameStats[] = [];
  const drafts = [structuredClone(draft)];
  for (let i = 0; i < 8; i++) {
    const season = i < 4 ? 2024 : 2025;
    const id = `00-00401${String(i).padStart(2, '0')}`;
    drafts.push({
      ...draft,
      gsisId: id,
      pfrId: `CompRe${i}0`,
      name: `Comparable Receiver ${i}`,
      season,
    });
    for (let week = 1; week <= 4; week++)
      players.push({
        playerId: id,
        name: `Comparable Receiver ${i}`,
        position: 'WR',
        team: 'BUF',
        opponent: 'MIA',
        gameId: `${season}:${week}`,
        season,
        week,
        seasonType: 'REG',
        stats: { receiving_yards: (i + 1) * 10 },
      });
  }
  return {
    season: 2026,
    players,
    market: [],
    warnings: [],
    draftPicks: drafts,
    sources: ['nfl-draft-picks', 'games', 'stats-2024', 'stats-2025'].map((id) => ({
      id,
      name: id,
      status: 'available',
      retrievedAt: asOf,
    })),
    games: [2024, 2025].flatMap((season) =>
      [1, 2, 3, 4].map((week) => ({
        id: `${season}:${week}`,
        season,
        week,
        seasonType: 'REG',
        date: `${season}-09-${10 + week}`,
        home: 'BUF',
        away: 'MIA',
        homeScore: 20,
        awayScore: 10,
      })),
    ),
  };
}
function evidence(data = fixture(), who = player) {
  return buildPlayerEvidence({
    league,
    players: [who],
    projections: [],
    data,
    season: 2026,
    week: 5,
    scope: 'season',
    asOf,
  })[0]!;
}
it('adds stable draft facts and equal-player earlier-class cohort numbers without inventing rookie projections or current ownership', () => {
  const row = evidence();
  expect(row.draftProfile).toEqual({ ...draft, sourceId: 'nfl-draft-picks' });
  expect(row.team).toBe('BUF'); // Drafted by ATL does not change the current roster team.
  const get = (suffix: string) => row.metrics.find((m) => m.id.endsWith(':' + suffix))!.value;
  expect(get('nfl-draft-pick')).toBe(20);
  expect(get('rookie-comparable-sample')).toBe(8);
  expect(get('rookie-comparable-classes')).toBe(2);
  expect(get('rookie-comparable-mean')).toBe(4.5);
  expect(get('rookie-comparable-lower')).toBe(2);
  expect(get('rookie-comparable-upper')).toBe(6);
  expect(row.projectedPoints).toBeUndefined();
  expect(row.historicalPoints).toEqual([]);
  expect(row.warnings.join(' ')).toContain('selection favors');
  expect(row.metrics.find((m) => m.id.endsWith(':rookie-comparable-mean'))!.sourceIds).toEqual([
    'nfl-draft-picks',
    'games',
    'stats-2024',
    'stats-2025',
  ]);
});
it('never falls back from conflicting explicit GSIS identity, ambiguous names, stale/future source dates or pre-draft dates', () => {
  expect(evidence(fixture(), { ...player, gsisId: '00-0040000' }).draftProfile).toBeUndefined();
  const ambiguous = fixture();
  ambiguous.draftPicks!.push({ ...draft, gsisId: '00-0040888', pfrId: 'OtheRo00' });
  const noId = { ...player };
  delete noId.gsisId;
  expect(evidence(fixture(), noId).draftProfile).toEqual({ ...draft, sourceId: 'nfl-draft-picks' });
  expect(evidence(ambiguous, noId).draftProfile).toBeUndefined();
  for (const time of ['2026-09-01T12:00:00Z', '2026-10-10T12:00:00Z']) {
    const data = fixture();
    data.sources[0]!.retrievedAt = time;
    expect(evidence(data).draftProfile).toBeUndefined();
  }
  const data = fixture();
  data.sources.forEach((s) => (s.retrievedAt = '2026-04-01T12:00:00Z'));
  expect(
    buildPlayerEvidence({
      league,
      players: [player],
      projections: [],
      data,
      season: 2026,
      week: 1,
      scope: 'season',
      asOf: '2026-04-01T12:00:00Z',
    })[0]!.draftProfile,
  ).toBeUndefined();
});
it('withholds thin/one-class, duplicate-game, unsupported-scoring, stale and wrong-position cohort summaries', () => {
  for (const mutate of [
    (d: FootballDataSnapshot) => d.players.splice(0, 4),
    (d: FootballDataSnapshot) => (d.players = d.players.filter((p) => p.season === 2025)),
    (d: FootballDataSnapshot) => d.games.push(d.games[0]!),
    (d: FootballDataSnapshot) => d.players.forEach((p) => (p.position = 'TE')),
    (d: FootballDataSnapshot) => (d.sources[2]!.retrievedAt = '2026-09-01T12:00:00Z'),
  ]) {
    const data = fixture();
    mutate(data);
    expect(evidence(data).metrics.some((m) => m.id.endsWith(':rookie-comparable-mean'))).toBe(
      false,
    );
  }
  expect(
    buildPlayerEvidence({
      league: { ...league, scoring: { unknown: 1 } },
      players: [player],
      projections: [],
      data: fixture(),
      season: 2026,
      week: 5,
      scope: 'season',
      asOf,
    })[0]!.metrics.some((m) => m.id.endsWith(':rookie-comparable-mean')),
  ).toBe(false);
});
it('keeps a matching scoring-confirmed import ahead of descriptive rookie outcomes and preserves closed saved-profile schemas', () => {
  const row = buildPlayerEvidence({
    league,
    players: [player],
    projections: [
      {
        id: 'import-rookie',
        leagueId: league.id,
        playerId: player.id,
        playerName: player.name,
        projectedPoints: 200,
        scoringMatched: true,
        importedAt: asOf,
        sourceName: 'Fictional projection',
      },
    ],
    data: fixture(),
    season: 2026,
    week: 5,
    scope: 'season',
    asOf,
  })[0]!;
  expect(row.projectedPoints).toBe(200);
  expect(row.projectionMethod).toBe('imported');
  expect(isNFLDraftProfile(row.draftProfile)).toBe(true);
  for (const patch of [
    { car_av: 999 },
    { sourceId: 'other' },
    { pick: -1 },
    { round: 8 },
    { gsisId: 'private-token' },
  ])
    expect(isNFLDraftProfile({ ...row.draftProfile, ...patch })).toBe(false);
});
