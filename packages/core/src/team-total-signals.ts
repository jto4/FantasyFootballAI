import type { FootballGame } from './advice-types.js';
import { earlierGame } from './game-rating-model.js';
import { nflTeamKey } from './advice-math.js';

export interface TeamTotalStats {
  season: number;
  week: number;
  gameId: string;
  team: string;
  opponent: string;
  attempts: number;
  sacks: number;
  carries: number;
  passingEpa: number;
  rushingEpa: number;
  explosivePlays: number;
  firstDowns: number;
}
export const totalSignalParameters = Object.freeze({
  fitSeasons: 1,
  teamPenaltyGames: 4,
  iterations: 16,
  publicationLagHours: 48,
  maxRows: 12000,
});
const teams = new Set(
  'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LA LAC LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(
    ' ',
  ),
);
// Historical IDs use relocated team names; keep this mapping local to research joins.
export function totalSignalTeamKey(input: string) {
  const key = nflTeamKey(input);
  return ({ OAK: 'LV', SD: 'LAC', STL: 'LA' } as Record<string, string>)[key] ?? key;
}
export function validateTeamTotalStats(rows: TeamTotalStats[]): void {
  if (rows.length > totalSignalParameters.maxRows) throw new Error('Too many team totals rows.');
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.gameId}:${r.team}`;
    if (
      !Number.isInteger(r.season) ||
      r.season < 2010 ||
      r.season > 2099 ||
      !Number.isInteger(r.week) ||
      r.week < 1 ||
      r.week > 18 ||
      typeof r.gameId !== 'string' ||
      !/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(r.gameId) ||
      !r.gameId.startsWith(`${r.season}_${String(r.week).padStart(2, '0')}_`) ||
      !r.gameId.split('_').slice(2).map(totalSignalTeamKey).includes(r.team) ||
      !r.gameId.split('_').slice(2).map(totalSignalTeamKey).includes(r.opponent) ||
      !teams.has(r.team) ||
      !teams.has(r.opponent) ||
      r.team === r.opponent ||
      ![r.attempts, r.sacks, r.carries, r.explosivePlays, r.firstDowns].every(
        (v) => Number.isInteger(v) && v >= 0 && v <= 120,
      ) ||
      ![r.passingEpa, r.rushingEpa].every((v) => Number.isFinite(v) && Math.abs(v) <= 150) ||
      r.attempts + r.sacks < 1 ||
      r.carries < 1 ||
      r.attempts + r.sacks + r.carries > 160 ||
      r.explosivePlays > r.attempts + r.sacks + r.carries ||
      r.firstDowns > r.attempts + r.sacks + r.carries ||
      seen.has(key)
    )
      throw new Error('Invalid or duplicate team totals row.');
    seen.add(key);
  }
}

/** Research only. Game counts are a volume proxy, not neutral-script tempo.
 * Opponent-adjusted ridge ratings use completed earlier weeks with a 48-hour lag;
 * archive revisions still cannot be certified as available at historical kickoff.
 */
export function prepareTeamTotalSignals(
  games: FootballGame[],
  rows: TeamTotalStats[],
  halfLifeDays: 120 | 365,
) {
  validateTeamTotalStats(rows);
  if (games.length > 10000 || ![120, 365].includes(halfLifeDays))
    throw new Error('Invalid totals signals input.');
  const byId = new Map<string, FootballGame[]>();
  for (const g of games) byId.set(g.id, [...(byId.get(g.id) ?? []), g]);
  const byStats = new Map(rows.map((r) => [`${r.gameId}:${r.team}`, r]));
  const joined = rows.flatMap((r) => {
    const matches = byId.get(r.gameId),
      g = matches?.length === 1 ? matches[0] : undefined;
    const opposite = byStats.get(`${r.gameId}:${r.opponent}`);
    return g &&
      g.seasonType === 'REG' &&
      g.season === r.season &&
      g.week === r.week &&
      Number.isInteger(g.homeScore) &&
      Number.isInteger(g.awayScore) &&
      ((totalSignalTeamKey(g.home) === r.team && totalSignalTeamKey(g.away) === r.opponent) ||
        (totalSignalTeamKey(g.away) === r.team && totalSignalTeamKey(g.home) === r.opponent)) &&
      opposite?.opponent === r.team &&
      opposite.week === r.week &&
      opposite.season === r.season
      ? [{ game: g, stats: r }]
      : [];
  });
  const cache = new Map<string, ReturnType<typeof fit>>();
  function fit(origin: FootballGame) {
    const prior = joined.filter(
      ({ game }) =>
        earlierGame(game, origin) &&
        game.season >= origin.season - totalSignalParameters.fitSeasons &&
        Date.parse(origin.date) - Date.parse(game.date) >=
          totalSignalParameters.publicationLagHours * 3600000,
    );
    const samples = prior.map(({ game, stats: r }) => {
      const pass = r.attempts + r.sacks,
        plays = pass + r.carries;
      return {
        team: r.team,
        opponent: r.opponent,
        w: 2 ** (-(Date.parse(origin.date) - Date.parse(game.date)) / 86400000 / halfLifeDays),
        x: [
          (r.passingEpa + r.rushingEpa) / plays,
          r.passingEpa / pass,
          r.rushingEpa / r.carries,
          plays / 65,
          r.explosivePlays / plays,
          r.firstDowns / plays,
          pass / plays,
        ],
      };
    });
    const names = [...new Set(samples.flatMap((r) => [r.team, r.opponent]))].sort();
    const weightedGames = new Map(
      names.map((t) => [t, samples.filter((r) => r.team === t).reduce((s, r) => s + r.w, 0)]),
    );
    const weight = samples.reduce((s, r) => s + r.w, 0);
    const league = Array.from({ length: 7 }, (_, i) =>
      weight ? samples.reduce((s, r) => s + r.w * r.x[i]!, 0) / weight : 0,
    );
    const offense = new Map(names.map((t) => [t, Array<number>(7).fill(0)]));
    const defense = new Map(names.map((t) => [t, Array<number>(7).fill(0)]));
    for (let iteration = 0; iteration < totalSignalParameters.iterations; iteration++) {
      for (const [ratings, other, attacking] of [
        [offense, defense, true],
        [defense, offense, false],
      ] as const) {
        for (const t of names) {
          const numerator = Array<number>(7).fill(0);
          let denominator = totalSignalParameters.teamPenaltyGames;
          for (const r of samples) {
            if ((attacking ? r.team : r.opponent) !== t) continue;
            denominator += r.w;
            const opposed = other.get(attacking ? r.opponent : r.team)!;
            for (let i = 0; i < 7; i++) numerator[i]! += r.w * (r.x[i]! - league[i]! - opposed[i]!);
          }
          ratings.set(
            t,
            numerator.map((v) => v / denominator),
          );
        }
      }
    }
    return { league, offense, defense, weightedGames, priorTeamRows: samples.length };
  }
  return {
    joinedRows: joined.length,
    rejectedJoinRows: rows.length - joined.length,
    features(origin: FootballGame) {
      const key = `${origin.season}:${origin.week}:${origin.date}`;
      let ratings = cache.get(key);
      if (!ratings) {
        ratings = fit(origin);
        cache.set(key, ratings);
        if (cache.size > 1024) cache.delete(cache.keys().next().value!);
      }
      const home = totalSignalTeamKey(origin.home),
        away = totalSignalTeamKey(origin.away);
      const h = ratings.offense.get(home),
        a = ratings.offense.get(away),
        hd = ratings.defense.get(home),
        ad = ratings.defense.get(away);
      const coverage = Math.min(
        ratings.weightedGames.get(home) ?? 0,
        ratings.weightedGames.get(away) ?? 0,
      );
      if (!h || !a || !hd || !ad || coverage < 1)
        return { x: Array<number>(12).fill(0), coverage, supported: false };
      const matchupH = h.map((v, i) => ratings!.league[i]! + v + ad[i]!);
      const matchupA = a.map((v, i) => ratings!.league[i]! + v + hd[i]!);
      const sum = h.map((v, i) => v + a[i]! + hd[i]! + ad[i]!);
      return {
        coverage,
        supported: true,
        x: [
          ...sum,
          Math.abs(matchupH[0]! - matchupA[0]!),
          matchupH[3]! * matchupH[0]! +
            matchupA[3]! * matchupA[0]! -
            2 * ratings.league[3]! * ratings.league[0]!,
          matchupH[6]! * matchupH[1]! +
            (1 - matchupH[6]!) * matchupH[2]! +
            matchupA[6]! * matchupA[1]! +
            (1 - matchupA[6]!) * matchupA[2]!,
          Math.min(coverage, 20) / 20,
          1,
        ],
      };
    },
  };
}
