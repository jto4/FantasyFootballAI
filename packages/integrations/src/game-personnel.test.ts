import { expect, it } from 'vitest';
import {
  addPregamePersonnel,
  parsePersonnelPerformance,
  parsePersonnelSnaps,
  preparePersonnelEvidence,
  type PersonnelPerformance,
  type PersonnelSnaps,
} from './game-personnel.js';
import type { FootballGame } from '@sidekick/core';
const prior: FootballGame = {
  id: '2025_04_KC_BUF',
  season: 2025,
  week: 4,
  seasonType: 'REG',
  date: '2025-09-28',
  kickoffAt: '2025-09-28T17:00:00Z',
  home: 'BUF',
  away: 'KC',
  homeScore: 24,
  awayScore: 20,
};
const target: FootballGame = {
  ...prior,
  id: '2025_05_KC_BUF',
  week: 5,
  date: '2025-10-05',
  kickoffAt: '2025-10-05T17:00:00Z',
  pregame: {
    asOf: '2025-10-05T16:00:00Z',
    home: {
      previousQuarterbackName: 'Home QB',
      previousQuarterbackId: '00-0000001',
      reportUpdatedAt: '2025-10-03T12:00:00Z',
      quarterbackOut: false,
    },
    away: { previousQuarterbackName: 'Away QB', previousQuarterbackId: '00-0000002' },
  },
};
const performance: PersonnelPerformance[] = [
  {
    id: '00-0000001',
    name: 'Home QB',
    team: 'BUF',
    position: 'QB',
    gameId: prior.id,
    season: 2025,
    week: 4,
    attempts: 30,
    sacks: 2,
    adjustedYards: 300,
  },
  {
    id: '00-0000002',
    name: 'Away QB',
    team: 'KC',
    position: 'QB',
    gameId: prior.id,
    season: 2025,
    week: 4,
    attempts: 30,
    sacks: 2,
    adjustedYards: 180,
  },
];
const snaps: PersonnelSnaps[] = [
  {
    name: 'Receiver Jr.',
    team: 'BUF',
    position: 'WR',
    gameId: prior.id,
    season: 2025,
    week: 4,
    offense: 0.8,
    defense: 0,
  },
];
const reports = [
  {
    season: 2025,
    week: 5,
    seasonType: 'REG' as const,
    team: 'BUF',
    position: 'WR',
    fullName: 'Receiver',
    updatedAt: '2025-10-03T12:00:00Z',
    reportStatus: 'Out',
    reportInjury: '',
    practiceStatus: '',
    practiceInjury: '',
  },
];
it('parses signed sack losses and explicit numeric zero without silently accepting blanks or impossible units', () => {
  const header =
    'season,week,season_type,game_id,team,player_id,player_display_name,position,attempts,sacks_suffered,passing_yards,sack_yards_lost,passing_tds,passing_interceptions';
  const row = '2025,4,REG,2025_04_KC_BUF,BUF,00-0000001,Home QB,QB,30,2,250,-10,2,1';
  expect(parsePersonnelPerformance(header + '\n' + row, 2025)[0]!.adjustedYards).toBe(235);
  expect(parsePersonnelPerformance(header + '\n' + row.replace(',-10,', ',10,'), 2025)).toEqual([]);
  expect(parsePersonnelPerformance(header + '\n' + row.replace(',30,2,', ',,2,'), 2025)).toEqual(
    [],
  );
  const snap =
    'season,week,game_type,game_id,team,player,position,offense_pct,defense_pct\n2025,4,REG,2025_04_KC_BUF,BUF,Receiver,WR,0.8,0';
  expect(parsePersonnelSnaps(snap, 2025)[0]!.offense).toBe(0.8);
  expect(parsePersonnelSnaps(snap.replace(',0.8,0', ',80,0'), 2025)).toEqual([]);
});
it('uses prior role/performance facts and strict IDs, with target-week and post-cutoff stats excluded', () => {
  const p = addPregamePersonnel(target, [prior, target], reports, performance, snaps).pregame!;
  expect(p.home.personnel).toMatchObject({
    throughWeek: 4,
    offenseOutSnaps: 0.8,
    matchedReports: 1,
    reportedPlayers: 1,
    quarterbackAbsenceValue: 0,
  });
  expect(p.home.personnel!.quarterbackQuality).toBeCloseTo(108 / 528);
  const future = performance.map((r) => ({ ...r, gameId: target.id, week: 5, adjustedYards: 900 }));
  expect(
    addPregamePersonnel(
      { ...target, homeQuarterbackName: 'Postgame Other QB' },
      [prior, target],
      reports,
      [...performance, ...future],
      snaps,
    ).pregame,
  ).toEqual(p);
  expect(
    addPregamePersonnel(
      target,
      [{ ...prior, kickoffAt: '2025-10-05T12:00:00Z' }, target],
      reports,
      performance,
      snaps,
    ).pregame!.home.personnel,
  ).toBeUndefined();
  const conflicting = performance.map((r) => ({
    ...r,
    id: r.team === 'BUF' ? '00-9999999' : r.id,
  }));
  expect(
    addPregamePersonnel(target, [prior, target], reports, conflicting, snaps).pregame!.home
      .personnel!.quarterbackQuality,
  ).toBeUndefined();
});
it('leaves unmatched absences unknown, rejects conflicting duplicate roles, and isolates prepared evidence from caller mutation', () => {
  const unmatched = reports.map((r) => ({ ...r, fullName: 'Unknown Player' }));
  expect(
    addPregamePersonnel(target, [prior, target], unmatched, performance, snaps).pregame!.home
      .personnel,
  ).toMatchObject({ matchedReports: 0, reportedPlayers: 1 });
  expect(
    addPregamePersonnel(target, [prior, target], unmatched, performance, snaps).pregame!.home
      .personnel!.offenseOutSnaps,
  ).toBeUndefined();
  expect(
    addPregamePersonnel(target, [prior, target], reports, performance, [
      ...snaps,
      { ...snaps[0]!, offense: 0.2 },
    ]).pregame!.home.personnel!.offenseOutSnaps,
  ).toBeUndefined();
  const input = structuredClone(performance),
    prepared = preparePersonnelEvidence([prior, target], input, snaps);
  input[0]!.adjustedYards = 900;
  expect(
    addPregamePersonnel(target, [prior, target], reports, input, snaps, prepared).pregame!.home
      .personnel!.quarterbackQuality,
  ).toBeCloseTo(108 / 528);
});
it('reads EPA and rushing exposure without turning blank or invalid values into measurements', () => {
  const header =
    'season,week,season_type,game_id,team,player_id,player_display_name,position,attempts,sacks_suffered,passing_yards,sack_yards_lost,passing_tds,passing_interceptions,passing_epa,carries,rushing_epa';
  const row = '2025,4,REG,2025_04_KC_BUF,BUF,00-0000001,Home QB,QB,30,2,250,-10,2,1,9,4,3';
  expect(parsePersonnelPerformance(header + '\n' + row, 2025)[0]).toMatchObject({
    passingEpa: 9,
    carries: 4,
    rushingEpa: 3,
  });
  const blank = parsePersonnelPerformance(header + '\n' + row.replace(',9,4,3', ',,4,'), 2025)[0]!;
  expect(blank.passingEpa).toBeUndefined();
  expect(blank.rushingEpa).toBeUndefined();
  expect(
    parsePersonnelPerformance(header + '\n' + row.replace(',9,4,3', ',9,0,'), 2025)[0],
  ).toMatchObject({ carries: 0, rushingEpa: 0 });
  expect(
    parsePersonnelPerformance(header + '\n' + row.replace(',9,4,3', ',999,4,999'), 2025)[0]!
      .passingEpa,
  ).toBeUndefined();
});
it('separates injury practice limitations from rest, preserves incomplete groups, and includes prior QB rushing', () => {
  const enriched = performance.map((r) => ({ ...r, passingEpa: 9, rushingEpa: 3, carries: 4 }));
  const limited = reports.map((r) => ({
    ...r,
    reportStatus: 'Doubtful',
    practiceStatus: 'Limited Participation in Practice',
    practiceInjury: 'Knee',
  }));
  const p = addPregamePersonnel(target, [prior, target], limited, enriched, snaps).pregame!.home
    .personnel!;
  expect(p.quarterbackEpa).toBeCloseTo(12 / 136);
  expect(p.quarterbackRushEpa).toBeCloseTo(3 / 136);
  expect(p.quarterbackTeamDelta).toBe(0);
  expect(p.offenseDoubtfulSnaps).toBe(0.8);
  expect(p.offenseLimitedSnaps).toBe(0.8);
  expect(
    addPregamePersonnel(
      target,
      [prior, target],
      limited.map((r) => ({ ...r, practiceInjury: 'Rest' })),
      enriched,
      snaps,
    ).pregame!.home.personnel!.offenseLimitedSnaps,
  ).toBe(0);
  expect(
    addPregamePersonnel(
      target,
      [prior, target],
      [...limited, { ...limited[0]!, fullName: 'Unmatched' }],
      enriched,
      snaps,
    ).pregame!.home.personnel!.offenseLimitedSnaps,
  ).toBeUndefined();
  expect(
    addPregamePersonnel(target, [prior, target], reports, enriched, snaps).pregame!.home.personnel!
      .offenseLimitedSnaps,
  ).toBeUndefined();
  const future = enriched.map((r) => ({ ...r, gameId: target.id, week: 5, passingEpa: -100 }));
  expect(
    addPregamePersonnel(target, [prior, target], limited, [...enriched, ...future], snaps).pregame!
      .home.personnel,
  ).toEqual(p);
});
it('withholds practice burden from partially observed injury groups and QB EPA from a stale Out chart', () => {
  const enriched = performance.map((r) => ({ ...r, passingEpa: 9, rushingEpa: 3, carries: 4 }));
  const limited = {
    ...reports[0]!,
    practiceStatus: 'Limited Participation in Practice',
    practiceInjury: 'Knee',
  };
  const unknownPractice = { ...limited, fullName: 'Another', practiceStatus: '' };
  expect(
    addPregamePersonnel(target, [prior, target], [limited, unknownPractice], enriched, snaps)
      .pregame!.home.personnel!.offenseLimitedSnaps,
  ).toBeUndefined();
  const stale = structuredClone(target);
  Object.assign(stale.pregame!.home, {
    quarterbackOut: true,
    expectedQuarterbackName: 'Home QB',
    expectedQuarterbackId: '00-0000001',
    quarterbackObservedAt: '2025-10-05T07:00:00Z',
  });
  expect(
    addPregamePersonnel(stale, [prior, stale], reports, enriched, snaps).pregame!.home.personnel!
      .quarterbackEpa,
  ).toBeUndefined();
});
