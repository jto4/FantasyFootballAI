import type { FootballGame } from './advice-types.js';
import { earlierGame } from './game-rating-model.js';
import { totalSignalTeamKey } from './team-total-signals.js';

export interface DriveTotalStats {
  gameId: string;
  season: number;
  week: number;
  team: string;
  opponent: string;
  plays: number;
  epa: number;
  successes: number;
  explosives: number;
  dropbacks: number;
  passEpa: number;
  sacks: number;
  neutralPlays: number;
  neutralPasses: number;
  neutralNoHuddle: number;
  neutralEpa: number;
  neutralSuccesses: number;
  drives: number;
  offensivePoints: number;
  opportunities: number;
  redZoneDrives: number;
  redZoneTouchdowns: number;
  possessionSeconds: number;
  possessionPlays: number;
}
export const driveSignalParameters = Object.freeze({
  halfLifeWeeks: 8,
  priorSeasonWeight: 0.25,
  teamPenaltyGames: 4,
  iterations: 12,
  publicationLagHours: 48,
  minimumWeightedGames: 2,
  maxRows: 12000,
});
export function validateDriveTotalStats(rows: DriveTotalStats[]) {
  if (!Array.isArray(rows) || rows.length > 12000) throw new Error('Invalid drive history size.');
  const seen = new Set<string>();
  const teams = new Set(
    'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LA LAC LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(
      ' ',
    ),
  );
  for (const r of rows) {
    const key = `${r.gameId}:${r.team}`;
    const counts = [
      r.plays,
      r.successes,
      r.explosives,
      r.dropbacks,
      r.sacks,
      r.neutralPlays,
      r.neutralPasses,
      r.neutralNoHuddle,
      r.neutralSuccesses,
      r.drives,
      r.offensivePoints,
      r.opportunities,
      r.redZoneDrives,
      r.redZoneTouchdowns,
      r.possessionPlays,
    ];
    if (
      !/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(r.gameId) ||
      !r.gameId.startsWith(`${r.season}_${String(r.week).padStart(2, '0')}_`) ||
      !Number.isInteger(r.season) ||
      r.season < 2010 ||
      r.season > 2099 ||
      !Number.isInteger(r.week) ||
      r.week < 1 ||
      r.week > 18 ||
      !teams.has(r.team) ||
      !teams.has(r.opponent) ||
      r.team === r.opponent ||
      !r.gameId.split('_').slice(2).map(totalSignalTeamKey).includes(r.team) ||
      !r.gameId.split('_').slice(2).map(totalSignalTeamKey).includes(r.opponent) ||
      counts.some((v) => !Number.isInteger(v) || v < 0 || v > 200) ||
      r.plays < 1 ||
      r.dropbacks < 1 ||
      r.drives < 1 ||
      r.drives > 30 ||
      r.successes > r.plays ||
      r.explosives > r.plays ||
      r.dropbacks > r.plays ||
      r.sacks > r.dropbacks ||
      r.neutralPlays > r.plays ||
      r.neutralPasses > r.neutralPlays ||
      r.neutralNoHuddle > r.neutralPlays ||
      r.neutralSuccesses > r.neutralPlays ||
      r.opportunities > r.drives ||
      r.redZoneDrives > r.opportunities ||
      r.redZoneTouchdowns > r.redZoneDrives ||
      r.offensivePoints > r.drives * 7 ||
      ![r.epa, r.passEpa, r.neutralEpa].every((v) => Number.isFinite(v) && Math.abs(v) <= 200) ||
      !Number.isFinite(r.possessionSeconds) ||
      r.possessionSeconds < 0 ||
      r.possessionSeconds > 3600 ||
      seen.has(key)
    )
      throw new Error('Invalid or duplicate drive history row.');
    seen.add(key);
  }
}

/** Possession clock per play measures clock consumption, not wall-clock snap tempo.
 * Latest revised PBP is lagged by 48h; it is not a certified historical publication vintage.
 */
export function prepareDriveTotalSignals(games: FootballGame[], rows: DriveTotalStats[]) {
  validateDriveTotalStats(rows);
  if (games.length > 10000) throw new Error('Too many drive schedule rows.');
  const byId = new Map<string, FootballGame[]>();
  for (const g of games) byId.set(g.id, [...(byId.get(g.id) ?? []), g]);
  const byStats = new Map(rows.map((r) => [`${r.gameId}:${r.team}`, r]));
  const joined = rows.flatMap((r) => {
    const matches = byId.get(r.gameId),
      g = matches?.length === 1 ? matches[0] : undefined,
      opposite = byStats.get(`${r.gameId}:${r.opponent}`);
    return g &&
      g.seasonType === 'REG' &&
      g.season === r.season &&
      g.week === r.week &&
      Number.isInteger(g.homeScore) &&
      Number.isInteger(g.awayScore) &&
      opposite?.opponent === r.team &&
      [totalSignalTeamKey(g.home), totalSignalTeamKey(g.away)].includes(r.team) &&
      [totalSignalTeamKey(g.home), totalSignalTeamKey(g.away)].includes(r.opponent)
      ? [{ game: g, stats: r }]
      : [];
  });
  function fit(origin: FootballGame) {
    const samples = joined
      .filter(
        ({ game, stats }) =>
          earlierGame(game, origin) &&
          game.season >= origin.season - 1 &&
          stats.neutralPlays >= 5 &&
          stats.possessionPlays > 0 &&
          Date.parse(origin.date) - Date.parse(game.date) >= 48 * 3600000,
      )
      .map(({ game, stats: r }) => ({
        team: r.team,
        opponent: r.opponent,
        w:
          2 **
            (-(game.season === origin.season
              ? origin.week - game.week
              : origin.week - 1 + 18 - game.week) /
              8) *
          (game.season === origin.season ? 1 : 0.25),
        x: [
          r.epa / r.plays,
          r.successes / r.plays,
          r.explosives / r.plays,
          r.passEpa / r.dropbacks,
          r.sacks / r.dropbacks,
          r.drives,
          r.offensivePoints / r.drives,
          r.opportunities / r.drives,
          r.redZoneTouchdowns / Math.max(1, r.redZoneDrives),
          r.possessionSeconds / r.possessionPlays,
          r.neutralPasses / r.neutralPlays,
          r.neutralNoHuddle / r.neutralPlays,
          r.neutralEpa / r.neutralPlays,
          r.neutralSuccesses / r.neutralPlays,
        ],
      }));
    const names = [...new Set(samples.flatMap((r) => [r.team, r.opponent]))].sort(),
      n = 14;
    const weightedGames = new Map(
      names.map((t) => [t, samples.filter((r) => r.team === t).reduce((s, r) => s + r.w, 0)]),
    );
    const weight = samples.reduce((s, r) => s + r.w, 0),
      league = Array.from({ length: n }, (_, i) =>
        weight ? samples.reduce((s, r) => s + r.w * r.x[i]!, 0) / weight : 0,
      );
    const offense = new Map(names.map((t) => [t, Array<number>(n).fill(0)])),
      defense = new Map(names.map((t) => [t, Array<number>(n).fill(0)]));
    for (let iteration = 0; iteration < 12; iteration++)
      for (const [ratings, other, attacking] of [
        [offense, defense, true],
        [defense, offense, false],
      ] as const)
        for (const t of names) {
          const numerator = Array<number>(n).fill(0);
          let denominator = 4;
          for (const r of samples) {
            if ((attacking ? r.team : r.opponent) !== t) continue;
            denominator += r.w;
            const opposed = other.get(attacking ? r.opponent : r.team)!;
            for (let i = 0; i < n; i++) numerator[i]! += r.w * (r.x[i]! - league[i]! - opposed[i]!);
          }
          ratings.set(
            t,
            numerator.map((v) => v / denominator),
          );
        }
    return { league, offense, defense, weightedGames, priorRows: samples.length };
  }
  const cache = new Map<string, ReturnType<typeof fit>>();
  return {
    joinedRows: joined.length,
    rejectedJoinRows: rows.length - joined.length,
    features(origin: FootballGame) {
      if (!Number.isFinite(origin.totalLine)) throw new Error('Missing totals line.');
      const key = `${origin.season}:${origin.week}:${origin.date}`;
      let r = cache.get(key);
      if (!r) {
        r = fit(origin);
        cache.set(key, r);
      }
      const home = totalSignalTeamKey(origin.home),
        away = totalSignalTeamKey(origin.away),
        h = r.offense.get(home),
        a = r.offense.get(away),
        hd = r.defense.get(home),
        ad = r.defense.get(away),
        coverage = Math.min(r.weightedGames.get(home) ?? 0, r.weightedGames.get(away) ?? 0);
      if (!h || !a || !hd || !ad || coverage < 2)
        return { x: Array<number>(14).fill(0), supported: false, coverage, priorRows: r.priorRows };
      const mh = h.map((v, i) => r!.league[i]! + v + ad[i]!),
        ma = a.map((v, i) => r!.league[i]! + v + hd[i]!);
      const sum = h.map((v, i) => v + a[i]! + hd[i]! + ad[i]!);
      const drives = Math.max(5, Math.min(18, (mh[5]! + ma[5]!) / 2));
      const projectedPoints = drives * (Math.max(0, mh[6]!) + Math.max(0, ma[6]!));
      const scales = [0.2, 0.1, 0.05, 0.3, 0.05, 2, 1, 0.15, 0.25, 8, 0.15, 0.15, 0.25, 0.1];
      const x = sum.map((v, i) => v / scales[i]!);
      // Replace the redundant raw drive-volume sum with its scoring interaction and book-line gap.
      x[5] = (projectedPoints - origin.totalLine!) / 10;
      return {
        x: x.map((v) => Math.max(-4, Math.min(4, v))),
        supported: true,
        coverage,
        projectedPoints,
        priorRows: r.priorRows,
      };
    },
  };
}
