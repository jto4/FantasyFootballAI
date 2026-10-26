import { describe, expect, it } from 'vitest';
import {
  buildDynastyContext,
  compareDynastyTrade,
  expectedAbove,
  keeperAdvice,
  leagueFormat,
  pickLabel,
  pickValue,
  rookieBoard,
  taxiAdvice,
  type PlayerBio,
} from './dynasty.js';
import { dynastySettings } from './dynasty-settings.js';
import type { PlayerGameStats } from './advice-types.js';
import type { LeagueConnection, RosterPlayer } from './domain-types.js';

const zero = {
  passing_yards: 0,
  passing_tds: 0,
  passing_interceptions: 0,
  passing_2pt_conversions: 0,
  rushing_yards: 0,
  rushing_tds: 0,
  rushing_2pt_conversions: 0,
  receptions: 0,
  receiving_yards: 0,
  receiving_tds: 0,
  receiving_2pt_conversions: 0,
  rushing_fumbles_lost: 0,
  receiving_fumbles_lost: 0,
  sack_fumbles_lost: 0,
};
function games(id: string, season: number, count: number, yards: number): PlayerGameStats[] {
  return Array.from({ length: count }, (_, i) => ({
    playerId: id,
    name: id,
    position: 'WR',
    team: 'KC',
    opponent: 'LV',
    gameId: `${season}_${i}_${id}`,
    season,
    week: i + 1,
    seasonType: 'REG',
    stats: { ...zero, receptions: yards / 14, receiving_yards: yards, receiving_tds: 0.4 },
  }));
}
const bio = (gsisId: string, birthDate: string, extra: Partial<PlayerBio> = {}): PlayerBio => ({
  gsisId,
  name: gsisId,
  position: 'WR',
  birthDate,
  ...extra,
});

// Twelve teams, two WR starters each plus a flex: 36 receivers start.
const players: RosterPlayer[] = [
  { id: 'young', name: 'Young Star', position: 'WR', gsisId: '00-0000001' },
  { id: 'old', name: 'Old Star', position: 'WR', gsisId: '00-0000002' },
  { id: 'rookie', name: 'Top Rookie', position: 'WR', gsisId: '00-0000003' },
  { id: 'retired', name: 'Retired', position: 'WR', gsisId: '00-0000004' },
  ...Array.from({ length: 60 }, (_, i) => ({
    id: `depth${i}`,
    name: `Depth ${i}`,
    position: 'WR',
    gsisId: `00-01${String(i).padStart(5, '0')}`,
  })),
];
const rows = [
  ...games('00-0000001', 2025, 17, 90),
  ...games('00-0000001', 2026, 7, 90),
  ...games('00-0000002', 2025, 17, 90),
  ...games('00-0000002', 2026, 7, 90),
  ...games('00-0000003', 2026, 7, 15),
  ...players
    .slice(4)
    .flatMap((p, i) => [
      ...games(p.gsisId!, 2025, 17, 75 - i),
      ...games(p.gsisId!, 2026, 7, 75 - i),
    ]),
];
const bios = new Map<string, PlayerBio>([
  ['00-0000001', bio('00-0000001', '2002-01-01', { rookieSeason: 2023, draftPick: 10 })],
  ['00-0000002', bio('00-0000002', '1994-01-01', { rookieSeason: 2016, draftPick: 10 })],
  ['00-0000003', bio('00-0000003', '2004-03-01', { rookieSeason: 2026, draftPick: 5 })],
  ['00-0000004', bio('00-0000004', '1989-01-01', { rookieSeason: 2011 })],
  ...players
    .slice(4)
    .map((p) => [p.gsisId!, bio(p.gsisId!, '1998-06-01', { rookieSeason: 2020 })] as const),
]);
const roster = (ids: string[]) => players.filter((p) => ids.includes(p.id));
const league = {
  id: 'dyn',
  platform: 'sleeper',
  name: 'Dynasty',
  displayName: 'Dynasty',
  teamCount: 12,
  scoring: { rec: 0.5, rec_yd: 0.1, rec_td: 6 },
  settings: {
    roster_positions: ['QB', 'WR', 'WR', 'FLEX', 'BN', 'BN', 'TAXI'],
    leagueFormat: 'dynasty',
  },
  teams: [
    { id: '1', name: 'Mine', roster: roster(['young', 'rookie', 'depth50', 'depth51']) },
    { id: '2', name: 'Theirs', roster: roster(['old', 'depth1']) },
  ],
  connectedAt: '2026-10-01T00:00:00.000Z',
} as unknown as LeagueConnection;
const context = buildDynastyContext({
  league,
  players,
  data: { players: rows },
  bios: { byGsis: bios, byEspn: new Map() },
  settings: dynastySettings,
  season: 2026,
  week: 8,
});

describe('league format', () => {
  it('uses the owner choice before the detected format', () => {
    expect(leagueFormat(league)).toBe('dynasty');
    expect(leagueFormat(league, { leagueFormats: { dyn: 'keeper' } })).toBe('keeper');
    expect(leagueFormat({ id: 'x', settings: {} })).toBe('redraft');
    expect(leagueFormat({ id: 'x', settings: { leagueFormat: 'other' } })).toBe('redraft');
  });
});

describe('dynasty values', () => {
  it('values youth over age at equal production and prices out retired players', () => {
    const young = context.values.get('young')!;
    const old = context.values.get('old')!;
    expect(young.seasons[0]).toBeCloseTo(old.seasons[0], 0);
    expect(young.value).toBeGreaterThan(old.value * 1.3);
    // Later seasons fall off faster for the 32-year-old.
    expect(old.seasons[3] / old.seasons[1]).toBeLessThan(young.seasons[3] / young.seasons[1]);
    expect(context.values.get('retired')!.value).toBe(0);
  });
  it('blends a rookie’s draft slot with his first games', () => {
    const rookie = context.values.get('rookie')!;
    expect(rookie.basis).toBe('blend');
    expect(rookie.value).toBeGreaterThan(0);
    // Slot 5 expects more than 15-yard games, so he is valued above his own pace next season.
    const pace = ((15 / 14) * 0.5 + 1.5 + 0.4 * 6) * 17;
    expect(rookie.seasons[1]).toBeGreaterThan(pace);
  });
  it('sets replacement from league starters', () => {
    // 36 receivers start; the 37th-best projection is the line.
    const sorted = [...context.values.values()].map((v) => v.seasons[1]).sort((a, b) => b - a);
    expect(context.replacement.WR[1]).toBe(sorted[36]);
  });
  it('prices upside near replacement above a point estimate', () => {
    const line = 100;
    expect(expectedAbove(90, dynastySettings.age.WR['1'].outcomes, line)).toBeGreaterThan(0);
    expect(expectedAbove(300, dynastySettings.age.WR['1'].outcomes, line)).toBeGreaterThan(150);
  });
});

describe('picks', () => {
  it('values earlier and sooner picks more', () => {
    const early = pickValue(context, dynastySettings, { season: 2027, round: 1, tier: 'early' });
    const late = pickValue(context, dynastySettings, { season: 2027, round: 1, tier: 'late' });
    const second = pickValue(context, dynastySettings, { season: 2027, round: 2, slot: 1 });
    const later = pickValue(context, dynastySettings, { season: 2028, round: 1, tier: 'early' });
    expect(early.value).toBeGreaterThan(late.value);
    expect(late.value).toBeGreaterThan(second.value);
    expect(later.value).toBeLessThan(early.value);
    expect(second.overall).toBe(13);
    expect(pickLabel(13, 12)).toBe('2.01');
  });
  it('lists rookies with the pick each is worth', () => {
    const board = rookieBoard(context, dynastySettings, {
      rookieSeason: 2026,
      rosteredBy: new Map([['rookie', 'Mine']]),
    });
    expect(board.map((r) => r.id)).toEqual(['rookie']);
    expect(board[0]!.rosteredBy).toBe('Mine');
    expect(board[0]!.worthPick).toMatch(/^\d\.\d\d$|Round 5\+/);
  });
});

describe('dynasty trades', () => {
  const ids = ['young', 'rookie', 'depth50', 'depth51'];
  it('charges a two-for-one for the player released to make room', () => {
    const trade = compareDynastyTrade(context, dynastySettings, {
      give: { playerIds: ['young'], picks: [] },
      receive: { playerIds: ['old', 'depth1'], picks: [] },
      roster: ids,
      rosterLimit: 4,
    });
    expect(trade.released).toHaveLength(1);
    expect(trade.released[0]!.id).toBe('depth51');
    expect(trade.net).toBeCloseTo(trade.receive.value - trade.give.value - trade.releaseCost, 0);
  });
  it('compares players with picks', () => {
    const trade = compareDynastyTrade(context, dynastySettings, {
      give: { playerIds: [], picks: [{ season: 2027, round: 1, tier: 'early' }] },
      receive: { playerIds: ['old'], picks: [] },
      roster: ids,
    });
    expect(trade.give.picks[0]!.label).toBe('2027 1.03');
    expect(trade.released).toHaveLength(1);
    expect(['gain', 'loss', 'even']).toContain(trade.verdict);
  });
});

describe('taxi and keepers', () => {
  it('suggests stashing an eligible rookie who is not helping now', () => {
    expect(context.values.get('rookie')!.aboveReplacement[0]).toBe(0);
    const advice = taxiAdvice(context, {
      roster: roster(['young', 'rookie']),
      slots: 2,
      years: 1,
    });
    expect(advice.moveToTaxi.map((p) => p.id)).toEqual(['rookie']);
    const promoted = taxiAdvice(context, {
      roster: [{ ...players[0]!, rosterPosition: 'TAXI' }],
      slots: 2,
      years: 5,
    });
    expect(promoted.activate.map((p) => p.id)).toEqual(['young']);
  });
  it('ranks keepers by value over their draft-round cost', () => {
    const advice = keeperAdvice(context, {
      roster: roster(['young', 'old', 'depth50']),
      keepers: 1,
      draftRounds: new Map([
        ['young', 1],
        ['old', 9],
      ]),
    });
    const old = advice.ranked.find((r) => r.id === 'old')!;
    expect(old.cost).toBeLessThanOrEqual(advice.ranked.find((r) => r.id === 'young')!.cost!);
    expect(advice.suggested).toHaveLength(1);
    expect(advice.ranked.find((r) => r.id === 'depth50')!.cost).toBeUndefined();
  });
});
