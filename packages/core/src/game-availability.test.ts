import { expect, it } from 'vitest';
import {
  availabilityFeatures,
  usablePregameContext,
  usablePersonnel,
  personnelFeatures,
} from './game-availability.js';
import type { FootballGame } from './advice-types.js';
const game: FootballGame = {
  id: 'game',
  season: 2025,
  week: 5,
  seasonType: 'REG',
  date: '2025-10-05',
  kickoffAt: '2025-10-05T17:00:00Z',
  home: 'BUF',
  away: 'KC',
  stadiumId: 'BUF00',
  pregame: {
    asOf: '2025-10-05T16:00:00Z',
    home: {
      reportUpdatedAt: '2025-10-03T16:00:00Z',
      offenseOut: 2,
      defenseOut: 1,
      quarterbackOut: true,
      quarterbackDoubtful: false,
      expectedQuarterbackName: 'A quarterback',
      quarterbackObservedAt: '2025-10-05T07:00:00Z',
      quarterbackChanged: true,
    },
    away: {
      reportUpdatedAt: '2025-10-03T17:00:00Z',
      offenseOut: 1,
      defenseOut: 3,
      quarterbackOut: false,
      quarterbackDoubtful: true,
      expectedQuarterbackName: 'B quarterback',
      quarterbackObservedAt: '2025-10-05T07:00:00Z',
      quarterbackChanged: false,
    },
    weather: {
      venueId: 'BUF00',
      model: 'jma_gsm',
      leadHours: 48,
      validAt: '2025-10-05T17:00:00Z',
      availableBy: '2025-10-04T05:00:00Z',
      temperatureC: 0,
      windKph: 40,
      precipitationMm: 5,
    },
  },
};
it('orients reported counts and flags without treating designations as playing probabilities', () => {
  expect(availabilityFeatures('total', game)).toEqual([0.75, 1, 1, 1, 1, 1, 0.4, 1]);
  expect(availabilityFeatures('spread', game)).toEqual([0.25, -0.5, 1, -1, 1, 1, 0.4, 1]);
  expect(
    availabilityFeatures('total', {
      ...game,
      homeQuarterbackId: '00-9999999',
      homeQuarterbackName: 'Postgame starter',
    }),
  ).toEqual(availabilityFeatures('total', game));
});
it('rejects future snapshots/reports, stale charts and unbounded numeric values at use time', () => {
  for (const mutate of [
    (g: FootballGame) => {
      g.pregame!.asOf = '2025-10-05T16:30:00Z';
    },
    (g: FootballGame) => {
      g.pregame!.home.reportUpdatedAt = '2025-10-05T16:30:00Z';
    },
    (g: FootballGame) => {
      g.pregame!.home.quarterbackObservedAt = '2025-09-20T07:00:00Z';
    },
    (g: FootballGame) => {
      g.pregame!.home.offenseOut = 1000;
    },
  ]) {
    const copy = structuredClone(game);
    mutate(copy);
    expect(usablePregameContext(copy, '2025-10-05T16:00:00Z')).toBeUndefined();
    expect(availabilityFeatures('total', copy, '2025-10-05T16:00:00Z')).toEqual(Array(8).fill(0));
  }
});
it('requires a matching kickoff hour, venue, lead and availability bound; missing stays absent', () => {
  for (const mutation of [
    { venueId: 'other' },
    { validAt: '2025-10-05T18:00:00Z' },
    { availableBy: '2025-10-05T18:00:00Z' },
    { leadHours: 0 },
    { windKph: NaN },
  ]) {
    const copy = structuredClone(game);
    Object.assign(copy.pregame!.weather!, mutation);
    expect(usablePregameContext(copy)).toBeUndefined();
  }
  expect(
    availabilityFeatures('total', {
      ...game,
      pregame: { asOf: '2025-10-05T16:00:00Z', home: {}, away: {} },
    }),
  ).toEqual(Array(8).fill(0));
  expect(usablePregameContext(game, '2025-10-05T17:00:00Z')).toBeUndefined();
});
it('requires earlier-week, bounded and dated personnel evidence, preserving missing measurements', () => {
  const g = structuredClone(game);
  g.pregame!.home.previousQuarterbackName = 'Home QB';
  g.pregame!.away.previousQuarterbackName = 'Away QB';
  g.pregame!.home.personnel = {
    availableBy: '2025-09-30T17:00:00Z',
    throughSeason: 2025,
    throughWeek: 4,
    quarterbackQuality: 0.3,
    offenseOutSnaps: 0.8,
    matchedReports: 1,
    reportedPlayers: 2,
  };
  g.pregame!.away.personnel = {
    availableBy: '2025-09-30T17:00:00Z',
    throughSeason: 2025,
    throughWeek: 4,
    quarterbackQuality: -0.2,
    offenseOutSnaps: 0.2,
    matchedReports: 1,
    reportedPlayers: 1,
  };
  expect(usablePersonnel(g, 'home')?.quarterbackQuality).toBe(0.3);
  expect(personnelFeatures('spread', g)[0]).toBe(0.5);
  expect(personnelFeatures('total', g)[2]).toBe(0.5);
  expect(personnelFeatures('total', g)[3]).toBe(0);
  for (const patch of [
    { throughWeek: 5 },
    { quarterbackQuality: Infinity },
    { matchedReports: 3 },
    { availableBy: '2025-10-06T00:00:00Z' },
  ]) {
    const bad = structuredClone(g);
    Object.assign(bad.pregame!.home.personnel!, patch);
    expect(usablePregameContext(bad)).toBeUndefined();
  }
  const undated = structuredClone(g);
  delete undated.pregame!.home.reportUpdatedAt;
  expect(usablePregameContext(undated)).toBeUndefined();
});
it('keeps rejected official injury source effects out of production while allowing an explicit local research counterfactual', () => {
  const g = structuredClone(game);
  g.pregame!.home.reportSource = 'nfl-official';
  expect(availabilityFeatures('total', g).slice(0, 4)).toEqual([0, 0, 0, 0]);
  expect(availabilityFeatures('total', g, undefined, true).slice(0, 4)).toEqual(
    availabilityFeatures('total', game).slice(0, 4),
  );
});
it('bounds richer personnel fields and keeps unknown or undated practice evidence out of research features', async () => {
  const { richPersonnelFeatures } = await import('./game-availability.js');
  const g = structuredClone(game);
  for (const side of ['home', 'away'] as const) {
    g.pregame![side].previousQuarterbackName = side + ' QB';
    g.pregame![side].personnel = {
      availableBy: '2025-09-30T17:00:00Z',
      throughSeason: 2025,
      throughWeek: 4,
      reportedPlayers: 1,
      matchedReports: 1,
      quarterbackEpa: side === 'home' ? 0.2 : -0.1,
      offenseDnpSnaps: side === 'home' ? 0.8 : 0.2,
    };
  }
  expect(richPersonnelFeatures('total', g)[0]).toBeCloseTo(0.1);
  expect(richPersonnelFeatures('spread', g)[0]).toBeCloseTo(0.3);
  expect(richPersonnelFeatures('total', g, 'injuries')[0]).toBe(0);
  expect(richPersonnelFeatures('total', g, 'quarterback')[9]).toBe(0);
  expect(richPersonnelFeatures('total', g)[9]).toBe(0.5);
  delete g.pregame!.away.personnel!.offenseDnpSnaps;
  expect(richPersonnelFeatures('total', g)[9]).toBe(0);
  g.pregame!.home.personnel!.quarterbackTeamDelta = NaN;
  expect(usablePregameContext(g)).toBeUndefined();
});
