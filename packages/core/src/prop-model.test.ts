import { expect, it } from 'vitest';
import type { FootballGame, PlayerGameStats } from './advice-types.js';
import {
  anchoredOverChance,
  buildPropModelLeague,
  defaultPropModelParams,
  fitMarketWeight,
  modelMedian,
  predictProp,
  predictPropMean,
  probabilityOver,
  propModelEligible,
} from './prop-model.js';
import { propModelSettings } from './prop-model-settings.js';

const game = (week: number, home = 'SEA', away = 'LA', extra: Partial<FootballGame> = {}) =>
  ({
    id: `2026_${String(week).padStart(2, '0')}_${away}_${home}`,
    season: 2026,
    week,
    seasonType: 'REG',
    date: '2026-10-01',
    home,
    away,
    homeScore: 24,
    awayScore: 20,
    ...extra,
  }) as FootballGame;
const row = (week: number, yards: number, season = 2026): PlayerGameStats => ({
  playerId: 'p',
  name: 'Fictional Receiver',
  position: 'WR',
  team: 'SEA',
  opponent: 'LA',
  gameId: game(week).id.replace('2026', String(season)),
  season,
  week,
  seasonType: 'REG',
  stats: { receiving_yards: yards },
});

it('weights recent games most and ignores the game being predicted and later ones', () => {
  const games = [1, 2, 3, 4, 5].map((w) => game(w));
  const league = buildPropModelLeague([], games);
  const history = [row(1, 20), row(2, 20), row(3, 100), row(4, 100), row(5, 999)];
  const prediction = predictPropMean(
    { stat: 'receiving_yards', position: 'WR', team: 'SEA', game: games[4]!, history },
    league,
    { ...defaultPropModelParams, shrinkGames: 0 },
  )!;
  expect(prediction.sampleGames).toBe(4);
  expect(prediction.base).toBeGreaterThan(60);
  expect(prediction.base).toBeLessThan(100);
});

it('raises the estimate for a high implied team total when the setting allows it', () => {
  const target = game(5, 'SEA', 'LA', { totalLine: 54, spreadLine: 6 });
  const league = buildPropModelLeague([], [game(1), game(2), game(3), target]);
  const input = {
    stat: 'receiving_yards' as const,
    position: 'WR',
    team: 'SEA',
    game: target,
    history: [row(1, 60), row(2, 60), row(3, 60)],
  };
  const flat = predictPropMean(input, league, { ...defaultPropModelParams, envExponent: 0 })!;
  const env = predictPropMean(input, league, { ...defaultPropModelParams, envExponent: 1 })!;
  // Home favored by 6 in a 54 total: 30 implied points against a 22-point league average.
  expect(env.factors.environment).toBeCloseTo(30 / 22);
  expect(env.mean).toBeGreaterThan(flat.mean);
});

it('turns a mean into chances with count and ratio spreads', () => {
  expect(probabilityOver(4.5, 4.5, { kind: 'count', size: 1000 })).toBeCloseTo(0.468, 2);
  expect(modelMedian(4.5, { kind: 'count', size: 1000 })).toBe(4);
  const ratio = { kind: 'ratio' as const, quantiles: [0, 0.5, 1, 1.5, 2] };
  expect(probabilityOver(50, 50, ratio)).toBeCloseTo(0.5);
  expect(probabilityOver(75, 50, ratio)).toBeCloseTo(0.25);
  expect(probabilityOver(0, 50, ratio)).toBe(1);
  expect(modelMedian(50, ratio)).toBe(50);
});

it('anchors to the line and refits the weight only with enough graded props', () => {
  const outcome = { kind: 'ratio' as const, quantiles: [0, 0.5, 1, 1.5, 2] };
  // The line sits at 0.75 of the mean, so the model says 62.5% over; a 25% weight gives 53.1%.
  expect(probabilityOver(75, 100, outcome)).toBeCloseTo(0.625);
  expect(anchoredOverChance(75, 100, outcome, 0.25)).toBeCloseTo(0.53125);
  const graded = Array.from({ length: 200 }, (_, i) => ({
    line: 75,
    mean: 100,
    stat: 'receiving_yards' as const,
    over: i % 4 !== 0,
  }));
  expect(fitMarketWeight(graded.slice(0, 100), propModelSettings)).toBeUndefined();
  // Overs hit 75% of the time, so trusting the model fully fits best.
  expect(fitMarketWeight(graded, propModelSettings)?.weight).toBeGreaterThan(0.6);
});

it('declines to price players outside the fitted population', () => {
  expect(propModelEligible('rushing_yards', 'QB', 6)).toBe(false);
  expect(propModelEligible('receiving_yards', 'WR', 45)).toBe(true);
  const target = game(4);
  const league = buildPropModelLeague([], [game(1), game(2), game(3), target]);
  const thin = predictProp(
    {
      stat: 'receiving_yards',
      position: 'WR',
      team: 'SEA',
      game: target,
      history: [row(1, 60), row(2, 60)],
      line: 50.5,
    },
    league,
    propModelSettings.receiving_yards,
  );
  expect(thin).toBeUndefined();
  const priced = predictProp(
    {
      stat: 'receiving_yards',
      position: 'WR',
      team: 'SEA',
      game: target,
      history: [row(1, 60), row(2, 60), row(3, 60)],
      line: 50.5,
      espnProjection: 70,
    },
    league,
    propModelSettings.receiving_yards,
  )!;
  expect(priced.source).toBe('blend');
  expect(priced.overChance).toBeGreaterThan(0.5);
  expect(priced.overChance).toBeLessThan(0.6);
});

it('scales the estimate by snap-share and depth-chart changes when those settings are on', () => {
  const target = game(4);
  const league = buildPropModelLeague([], [game(1), game(2), game(3), target]);
  const withSnaps = (week: number, yards: number, snapShare: number) => ({
    ...row(week, yards),
    usage: { snapShare },
  });
  const input = {
    stat: 'receiving_yards' as const,
    position: 'WR',
    team: 'SEA',
    game: target,
    history: [withSnaps(1, 40, 0.4), withSnaps(2, 40, 0.4), withSnaps(3, 60, 0.8)],
    depth: { now: 1, atLastGame: 3 },
  };
  const norms = { snapShareByRank: { WR: [0.85, 0.77, 0.58] }, yardsPerAirYard: 0.4 };
  const off = predictPropMean(input, league, defaultPropModelParams, norms)!;
  expect(off.factors).toMatchObject({ snap: 1, depth: 1 });
  const on = predictPropMean(
    input,
    league,
    { ...defaultPropModelParams, snapExponent: 1, depthExponent: 1 },
    norms,
  )!;
  // Recent snaps (0.4, 0.8 → 0.6) above the usual weighted share, and a WR3 → WR1 promotion.
  expect(on.factors.snap).toBeGreaterThan(1);
  expect(on.factors.depth).toBeCloseTo(0.85 / 0.58);
  expect(on.mean).toBeGreaterThan(off.mean);
});
