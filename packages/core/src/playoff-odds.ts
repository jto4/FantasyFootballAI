import type { LeagueConnection } from './domain-types.js';

export interface PlayoffOdds {
  simulations: number;
  playoffSpots: number;
  regularSeasonWeeks: number;
  remainingWeeks: number[];
  /** False when some remaining weeks used random pairings because no schedule was available. */
  scheduleKnown: boolean;
  teams: {
    teamId: string;
    name: string;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    projectedWins: number;
    playoffChance: number;
    topSeedChance: number;
  }[];
}

const integer = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;

/** Small deterministic generator so the same league data always gives the same odds. */
function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, normal };
}

/**
 * Simulates the rest of the regular season from each team's scoring so far.
 *
 * Team strength is its average weekly score pulled toward the league average by three weeks of
 * league-average play, with one league-wide spread for weekly variation. Remaining games use the
 * platform schedule when listed and random pairings otherwise. Seeds go to the best records,
 * then most points for. Returns undefined until at least two weeks have been played.
 */
export function playoffOdds(league: LeagueConnection, simulations = 5000): PlayoffOdds | undefined {
  const teams = league.teams.map((t) => ({ id: t.id, name: t.name }));
  const ids = new Set(teams.map((t) => t.id));
  const games = (league.weeklyScores ?? []).filter(
    (g) => g.teams.length === 2 && g.teams.every((t) => ids.has(t.teamId)),
  );
  const played = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
  if (teams.length < 4 || played.length < 2) return;
  const settings = league.settings;
  const lastRegular =
    integer(settings.regularSeasonWeeks, 1, 30) ??
    (integer(settings.playoff_week_start, 2, 30) ??
      integer(settings.playoffStartWeek, 2, 30) ??
      15) - 1;
  const playoffSpots = Math.min(
    teams.length,
    integer(settings.playoffTeams, 2, 64) ??
      integer(settings.playoff_teams, 2, 32) ??
      (teams.length >= 10 ? 6 : 4),
  );
  const record = new Map(
    teams.map((t) => [t.id, { w: 0, l: 0, t: 0, pf: 0, scores: [] as number[] }]),
  );
  for (const game of games) {
    const [a, b] = game.teams;
    const ra = record.get(a!.teamId)!,
      rb = record.get(b!.teamId)!;
    ra.pf += a!.points;
    rb.pf += b!.points;
    ra.scores.push(a!.points);
    rb.scores.push(b!.points);
    if (a!.points > b!.points) {
      ra.w++;
      rb.l++;
    } else if (a!.points < b!.points) {
      ra.l++;
      rb.w++;
    } else {
      ra.t++;
      rb.t++;
    }
  }
  const all = [...record.values()].flatMap((r) => r.scores);
  const leagueMean = all.reduce((s, v) => s + v, 0) / all.length;
  const strength = new Map(
    [...record.entries()].map(([id, r]) => [
      id,
      (r.scores.reduce((s, v) => s + v, 0) + 3 * leagueMean) / (r.scores.length + 3),
    ]),
  );
  const residuals = [...record.values()].flatMap((r) => {
    const mean = r.scores.reduce((s, v) => s + v, 0) / r.scores.length;
    return r.scores.map((v) => v - mean);
  });
  const spread = Math.max(
    10,
    Math.sqrt(
      residuals.reduce((s, v) => s + v * v, 0) / Math.max(1, residuals.length - teams.length),
    ),
  );
  const lastPlayed = played[played.length - 1]!;
  const remainingWeeks = Array.from(
    { length: Math.max(0, lastRegular - lastPlayed) },
    (_, i) => lastPlayed + 1 + i,
  );
  const listed = new Map<number, [string, string][]>();
  for (const game of league.upcomingSchedule ?? [])
    if (remainingWeeks.includes(game.week) && game.teamIds.every((id) => ids.has(id)))
      listed.set(game.week, [...(listed.get(game.week) ?? []), game.teamIds]);
  const scheduleKnown = remainingWeeks.every((week) => listed.has(week));
  const random = generator(0x5eed + teams.length * 31 + lastPlayed);
  const tally = new Map(teams.map((t) => [t.id, { playoffs: 0, top: 0, wins: 0 }]));
  for (let run = 0; run < simulations; run++) {
    const sim = new Map(
      [...record.entries()].map(([id, r]) => [id, { w: r.w + r.t / 2, pf: r.pf }]),
    );
    for (const week of remainingWeeks) {
      let pairs = listed.get(week);
      if (!pairs) {
        const order = teams.map((t) => t.id);
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(random.next() * (i + 1));
          [order[i], order[j]] = [order[j]!, order[i]!];
        }
        pairs = [];
        for (let i = 0; i + 1 < order.length; i += 2) pairs.push([order[i]!, order[i + 1]!]);
      }
      for (const [a, b] of pairs) {
        const sa = strength.get(a)! + spread * random.normal(),
          sb = strength.get(b)! + spread * random.normal();
        sim.get(a)!.pf += sa;
        sim.get(b)!.pf += sb;
        if (sa > sb) sim.get(a)!.w++;
        else sim.get(b)!.w++;
      }
    }
    const standings = [...sim.entries()].sort((x, y) => y[1].w - x[1].w || y[1].pf - x[1].pf);
    standings.forEach(([id, row], index) => {
      const t = tally.get(id)!;
      t.wins += row.w;
      if (index < playoffSpots) t.playoffs++;
      if (index === 0) t.top++;
    });
  }
  return {
    simulations,
    playoffSpots,
    regularSeasonWeeks: lastRegular,
    remainingWeeks,
    scheduleKnown,
    teams: teams
      .map((t) => {
        const r = record.get(t.id)!,
          s = tally.get(t.id)!;
        return {
          teamId: t.id,
          name: t.name,
          wins: r.w,
          losses: r.l,
          ties: r.t,
          pointsFor: r.pf,
          projectedWins: s.wins / simulations,
          playoffChance: s.playoffs / simulations,
          topSeedChance: s.top / simulations,
        };
      })
      .sort((a, b) => b.playoffChance - a.playoffChance || b.projectedWins - a.projectedWins),
  };
}
