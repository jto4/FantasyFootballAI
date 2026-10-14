import { expect, it } from 'vitest';
import { buildBetForecast, betForecastQualified } from './bet-forecast.js';
import { prepareGameRatingModel, fitTeamScores } from './game-rating-model.js';
import type { FootballDataSnapshot, BetTerms } from './advice-types.js';
const asOf = '2025-10-07T12:00:00Z';
function fixture(): FootballDataSnapshot {
  const games: FootballDataSnapshot['games'] = [];
  for (const season of [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])
    for (let week = 1; week <= (season === 2025 ? 4 : 18); week++)
      for (let i = 0; i < 8; i++) {
        const date = new Date(Date.UTC(season, 8, 1 + (week - 1) * 7)).toISOString().slice(0, 10);
        games.push({
          id: `${season}-${week}-${i}`,
          season,
          week,
          seasonType: 'REG',
          date,
          neutralSite: week % 7 === 0,
          home: `T${i}`,
          away: `T${8 + ((i + week) % 8)}`,
          homeScore: 24 + (i % 3) * 2 + (week % 2),
          awayScore: 18 + ((i + week) % 3) * 2,
          spreadLine: 3.5,
          totalLine: 44.5,
          archivedOdds: {
            homeMoneyline: -135,
            awayMoneyline: 115,
            homeSpreadOdds: -110,
            awaySpreadOdds: -110,
            overOdds: -110,
            underOdds: -110,
          },
        });
      }
  games.push({
    id: 'target',
    season: 2025,
    week: 5,
    seasonType: 'REG',
    date: '2025-10-11',
    neutralSite: false,
    home: 'T1',
    away: 'T9',
  });
  return {
    season: 2025,
    games,
    players: [],
    market: [],
    sources: [{ id: 'games', name: 'Fictional archive', status: 'available', retrievedAt: asOf }],
    warnings: [],
  };
}
const terms: BetTerms = {
  kind: 'moneyline',
  gameId: 'target',
  side: 'home',
  americanOdds: -135,
  oppositeAmericanOdds: 115,
};
it('identifies the sportsbook as a model input and matched baseline, complements opposite sides and preserves source freshness', () => {
  const data = fixture(),
    home = buildBetForecast(terms, data, asOf),
    away = buildBetForecast(
      { ...terms, side: 'away', americanOdds: 115, oppositeAmericanOdds: -135 },
      data,
      asOf,
    );
  expect(home.forecast?.method).toBe('market-context-v3');
  expect(home.forecast!.evaluation.baselineKind).toBe('sportsbook');
  expect(home.forecast!.evaluation.weeks).toBeGreaterThan(40);
  expect(home.forecast!.probability + away.forecast!.probability).toBeCloseTo(1, 12);
  expect(home.forecast!.evaluation.brier).toBeCloseTo(away.forecast!.evaluation.brier, 12);
  expect(home.metrics.find((m) => m.id === 'bet-model-market-baseline')?.sourceIds).toContain(
    'entered-odds',
  );
  expect(home.warnings.join(' ')).toContain('uses both entered/fetched sportsbook prices');
  data.sources[0]!.retrievedAt = '2025-09-01T00:00:00Z';
  const stale = buildBetForecast(terms, data, asOf).forecast!;
  expect(stale.fresh).toBe(false);
  expect(betForecastQualified(stale)).toBe(false);
});
it('evaluates each past game at its own archived line, not the current selected threshold', () => {
  const data = fixture(),
    a = buildBetForecast({ ...terms, kind: 'spread', line: -3.5 }, data, asOf),
    b = buildBetForecast({ ...terms, kind: 'spread', line: -10.5 }, data, asOf);
  expect(a.forecast!.probability).not.toBe(b.forecast!.probability);
  expect(a.evaluationCases).toEqual(b.evaluationCases);
  expect(a.forecast!.evaluation.brier).toBe(b.forecast!.evaluation.brier);
  data.games.find((g) => g.id === 'target')!.spreadLine = 80;
  expect(buildBetForecast({ ...terms, kind: 'spread', line: -3.5 }, data, asOf)).toEqual(a);
});
it('excludes target/same-week/future outcomes and fits every earlier evaluation before its result', () => {
  const data = fixture(),
    before = buildBetForecast(terms, data, asOf);
  const future = {
    ...data.games[0]!,
    id: 'future',
    season: 2025,
    week: 6,
    date: '2025-10-18',
    homeScore: 99,
  };
  data.games.push(future);
  expect(buildBetForecast(terms, data, asOf)).toEqual(before);
  data.games.push({ ...future, id: 'later-prior-week', week: 4, date: '2025-10-09' });
  expect(buildBetForecast(terms, data, asOf)).toEqual(before);
  for (const game of data.games) if (game.season === 2024 && game.week >= 10) game.homeScore = 90;
  const changed = buildBetForecast(terms, data, asOf);
  for (const row of before.evaluationCases.filter(
    (r) => r.season < 2024 || (r.season === 2024 && r.week <= 10),
  ))
    expect(changed.evaluationCases.find((x) => x.gameId === row.gameId)?.probability).toBe(
      row.probability,
    );
});
it('deduplicates repeated games, excludes conflicting identities and removes the learned home effect at neutral sites', () => {
  const data = fixture(),
    original = prepareGameRatingModel(data.games);
  data.games.push({ ...data.games[0]! });
  expect(prepareGameRatingModel(data.games).observations).toEqual(original.observations);
  data.games.push({ ...data.games[0]!, homeScore: 99 });
  expect(
    prepareGameRatingModel(data.games).observations.some((r) => r.game.id === data.games[0]!.id),
  ).toBe(false);
  const target = data.games.at(-3)!,
    fit = fitTeamScores(
      data.games.filter((g) => g.id !== data.games[0]!.id),
      target,
    ),
    home = fit(target),
    neutral = fit({ ...target, neutralSite: true });
  expect(home).toBeDefined();
  expect(home!.margin).toBeGreaterThan(neutral!.margin);
  expect(home!.total).toBeCloseTo(neutral!.total, 12);
});
it('withholds sportsbook-edge support when missing current paired prices requires the legacy fallback', () => {
  const result = buildBetForecast(
    { kind: 'moneyline', gameId: 'target', side: 'home', americanOdds: -110 },
    fixture(),
    asOf,
  );
  expect(result.forecast!.method).toBe('rolling-residual-v1');
  expect(result.forecast!.evaluation.baselineKind).toBe('frequency');
  expect(betForecastQualified(result.forecast!)).toBe(false);
});

it('uses verified totals context, keeps other probabilities on v3, rejects later context and ignores target archive starter fields', () => {
  const data = fixture(),
    clock = '2025-10-11T16:00:00Z';
  data.sources[0]!.retrievedAt = clock;
  for (const game of data.games) {
    game.kickoffAt = `${game.date}T17:00:00Z`;
    game.stadiumId = 'BUF00';
    game.stadiumName = 'Highmark Stadium';
    const t = Date.parse(game.kickoffAt);
    game.pregame = {
      asOf: game.id === 'target' ? clock : new Date(t - 1000).toISOString(),
      home: {
        reportUpdatedAt: new Date(t - 86400000).toISOString(),
        offenseOut: game.week % 3,
        defenseOut: 0,
        quarterbackOut: false,
      },
      away: {
        reportUpdatedAt: new Date(t - 86400000).toISOString(),
        offenseOut: 0,
        defenseOut: 1,
        quarterbackOut: game.week % 7 === 0,
      },
      weather: {
        venueId: 'BUF00',
        model: 'jma_gsm',
        leadHours: 48,
        validAt: game.kickoffAt,
        availableBy: new Date(t - 36 * 3600000).toISOString(),
        temperatureC: 10,
        windKph: game.week % 2 ? 10 : 40,
        precipitationMm: 0,
      },
    };
  }
  const totalTerms = { ...terms, kind: 'total' as const, side: 'over' as const, line: 44.5 },
    total = buildBetForecast(totalTerms, data, clock);
  expect(total.forecast!.method).toBe('health-weather-total-v4');
  expect(total.metrics.some((m) => m.id === 'bet-model-weather-wind')).toBe(true);
  expect(buildBetForecast(terms, data, clock).forecast!.method).toBe('market-context-v3');
  const target = data.games.find((g) => g.id === 'target')!;
  target.homeQuarterbackId = '00-9999999';
  target.homeQuarterbackName = 'Unverified target starter';
  expect(buildBetForecast(totalTerms, data, clock)).toEqual(total);
  target.pregame!.asOf = '2025-10-11T16:30:00Z';
  expect(buildBetForecast(totalTerms, data, clock).forecast!.method).toBe('market-context-v3');
});
it('exposes richer QB and practice facts descriptively without altering production probabilities or qualification', () => {
  const data = fixture(),
    target = data.games.find((g) => g.id === 'target')!;
  target.kickoffAt = '2025-10-11T17:00:00Z';
  const before = buildBetForecast(terms, data, asOf);
  target.pregame = { asOf, home: {}, away: {} };
  for (const side of ['home', 'away'] as const) {
    target.pregame[side] = {
      previousQuarterbackName: side + ' QB',
      reportUpdatedAt: '2025-10-06T12:00:00Z',
      personnel: {
        availableBy: '2025-10-05T12:00:00Z',
        throughSeason: 2025,
        throughWeek: 4,
        reportedPlayers: 1,
        matchedReports: 1,
        quarterbackEpa: side === 'home' ? 0.2 : -0.1,
        quarterbackTeamDelta: 0.1,
        offensiveLineOutSnaps: 0.8,
        offenseDnpSnaps: 0.6,
      },
    };
  }
  const after = buildBetForecast(terms, data, asOf);
  expect(after.forecast!.probability).toBe(before.forecast!.probability);
  expect(after.evaluationCases).toEqual(before.evaluationCases);
  expect(betForecastQualified(after.forecast!)).toBe(betForecastQualified(before.forecast!));
  expect(after.metrics.find((m) => m.id === 'bet-model-home-quarterbackEpa')?.value).toBe(0.2);
  expect(after.metrics.find((m) => m.id === 'bet-model-home-offenseDnpSnaps')?.value).toBe(0.6);
});
