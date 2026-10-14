import { expect, it } from 'vitest';
import { prepareGameRatingModel } from './game-rating-model.js';
import { prepareRichPersonnelModel } from './rich-personnel-model.js';
import type { FootballGame } from './advice-types.js';
function fixture() {
  const games: FootballGame[] = [];
  for (let season = 2018; season <= 2024; season++)
    for (let week = 1; week <= 18; week++)
      for (let i = 0; i < 8; i++) {
        const date = new Date(Date.UTC(season, 8, 1 + (week - 1) * 7)).toISOString().slice(0, 10);
        const context = (home: boolean) => ({
          previousQuarterbackName: home ? 'Home QB' : 'Away QB',
          personnel: {
            availableBy: `${season - 1}-12-01T00:00:00Z`,
            throughSeason: season - 1,
            throughWeek: 12,
            reportedPlayers: 0,
            matchedReports: 0,
            quarterbackEpa: home ? 0.2 : -0.1,
          },
        });
        games.push({
          id: `${season}-${week}-${i}`,
          season,
          week,
          seasonType: 'REG',
          date,
          kickoffAt: date + 'T17:00:00Z',
          home: `T${i}`,
          away: `T${8 + ((i + week) % 8)}`,
          homeScore: 24 + (i % 3),
          awayScore: 18 + (week % 3),
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
          pregame: { asOf: date + 'T12:00:00Z', home: context(true), away: context(false) },
        });
      }
  return games;
}
it('research corrections and learned blend weights cannot read target, same-week or future outcomes', () => {
  const games = fixture(),
    target = games.find((g) => g.season === 2023 && g.week === 10)!;
  const predict = (input: FootballGame[], rule: 'direct' | 'adaptive-book') => {
    const model = prepareGameRatingModel(input),
      rich = prepareRichPersonnelModel(model, { family: 'quarterback', penalty: 200, rule }),
      observation = model.observations.find((r) => r.game.id === target.id)!.markets.total!;
    return rich.probability('total', target, observation.raw, observation.baseline);
  };
  const mutated = games.map((g) =>
    g.season > target.season || (g.season === target.season && g.week >= target.week)
      ? { ...g, homeScore: 99, awayScore: 0 }
      : g,
  );
  for (const rule of ['direct', 'adaptive-book'] as const) {
    const p = predict(games, rule);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    expect(predict(mutated, rule)).toBeCloseTo(p, 12);
  }
});
it('direct research corrections preserve the selected production model when paired richer inputs are unknown', () => {
  const games = fixture(),
    model = prepareGameRatingModel(games),
    r = model.observations.at(-1)!,
    q = r.markets.total!,
    origin = structuredClone(r.game);
  delete origin.pregame!.away.personnel;
  const rich = prepareRichPersonnelModel(model, { family: 'all', penalty: 1000, rule: 'direct' });
  expect(rich.probability('total', origin, q.raw, q.baseline)).toBe(
    model.adjustJointAvailability('total', origin, q.raw, q.baseline),
  );
});
