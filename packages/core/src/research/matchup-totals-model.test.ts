import { expect, it } from 'vitest';
import { prepareGameRatingModel } from '../game-rating-model.js';
import { prepareMatchupTotalsModel } from './matchup-totals-model.js';
import type { TeamTotalStats } from '../team-total-signals.js';
import type { FootballGame } from '../advice-types.js';

function fixture() {
  const teams = 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC'.split(' ');
  const games: FootballGame[] = [],
    stats: TeamTotalStats[] = [];
  for (let season = 2015; season <= 2021; season++)
    for (let week = 1; week <= 18; week++)
      for (let i = 0; i < 8; i++) {
        const home = teams[i]!,
          away = teams[8 + ((i + week) % 8)]!;
        const game: FootballGame = {
          id: `${season}_${String(week).padStart(2, '0')}_${away}_${home}`,
          season,
          week,
          seasonType: 'REG',
          date: new Date(Date.UTC(season, 8, 1 + 7 * (week - 1))).toISOString().slice(0, 10),
          home,
          away,
          homeScore: 20 + ((i + week) % 10),
          awayScore: 17 + ((week * 3 + i) % 15),
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
        };
        games.push(game);
        for (const [team, opponent] of [
          [home, away],
          [away, home],
        ])
          stats.push({
            season,
            week,
            gameId: game.id,
            team: team!,
            opponent: opponent!,
            attempts: 30 + i,
            sacks: 2,
            carries: 28,
            passingEpa: ((week + i) % 20) - 10,
            rushingEpa: i - 4,
            explosivePlays: 3 + i,
            firstDowns: 15 + i,
          });
      }
  return { games, stats };
}
it('preserves target predictions when future labels/stats change and leaves both non-total markets exact', () => {
  const { games, stats } = fixture(),
    target = games.find((g) => g.season === 2021 && g.week === 6)!;
  const future = (season: number, week: number) =>
    season > target.season || (season === target.season && week >= target.week);
  function predict(input: FootballGame[], rows: TeamTotalStats[], method: 'tree' | 'ridge') {
    const model = prepareGameRatingModel(input),
      r = model.observations.find((r) => r.game.id === target.id)!;
    const before = ['moneyline', 'spread'].map((kind) => {
      const q = r.markets[kind as 'moneyline' | 'spread']!;
      return model.adjust(kind as 'moneyline' | 'spread', r.game, q.raw, q.baseline);
    });
    const tree = prepareMatchupTotalsModel(model, rows, {
      halfLifeDays: 120,
      signals: true,
      method,
    });
    const p = tree.probability(r.markets.total!);
    const after = ['moneyline', 'spread'].map((kind) => {
      const q = r.markets[kind as 'moneyline' | 'spread']!;
      return model.adjust(kind as 'moneyline' | 'spread', r.game, q.raw, q.baseline);
    });
    expect(after).toEqual(before);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    return p;
  }
  for (const method of ['tree', 'ridge'] as const) {
    const p = predict(games, stats, method);
    expect(
      predict(
        games.map((g) => (future(g.season, g.week) ? { ...g, homeScore: 99, awayScore: 0 } : g)),
        stats.map((r) =>
          future(r.season, r.week) ? { ...r, passingEpa: 100, rushingEpa: -100 } : r,
        ),
        method,
      ),
    ).toBe(p);
  }
});
