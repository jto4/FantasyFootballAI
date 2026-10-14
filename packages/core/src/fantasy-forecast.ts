import type { LeagueConnection, RosterPlayer } from './domain-types.js';
import type { FootballDataSnapshot, FootballGame, PlayerGameStats } from './advice-types.js';
import {
  historicalPlayerGames,
  footballPosition,
  footballRowSourceIds,
  defensePlayerIdentity,
  nflTeamKey,
  playerNameKey,
  scoreHistoricalGame,
} from './advice-math.js';

type Sample = { row: PlayerGameStats; points: number; usage: number | undefined };
type Observation = { week: string; residual: number; baselineResidual: number };
type Model = {
  matrix: number[][];
  target: number[];
  cases: number;
  weeks: Set<string>;
  observations: Observation[];
};
export interface FantasyForecast {
  method: 'rolling-form-v1' | 'rolling-baseline-v1';
  points: number;
  baselinePoints: number;
  formAdjustment: number;
  workloadAdjustment: number;
  opponentAdjustment: number;
  recordedPoints: number;
  futureGames: number;
  lower: number;
  upper: number;
  sourceIds: string[];
  evaluation: {
    cases: number;
    weeks: number;
    mae: number;
    /** Rejected adjustment model error stays separate from the selected baseline's error. */
    candidateMae: number;
    baselineMae: number;
    improvementLower: number;
  };
  warnings: string[];
}
const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const weekKey = (row: { season: number; week: number }) => `${row.season}:${row.week}`;
const validDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(date)) &&
  new Date(date).toISOString().slice(0, 10) === date;
const fresh = (data: FootballDataSnapshot, id: string, asOf: string) => {
  const source = data.sources.find((s) => s.id === id);
  const age = Date.parse(asOf) - Date.parse(source?.retrievedAt ?? '');
  return (
    source?.status === 'available' && Number.isFinite(age) && age >= 0 && age <= 48 * 3_600_000
  );
};
const usage = (row: PlayerGameStats): number | undefined => {
  const fields =
    row.position === 'QB'
      ? (['attempts'] as const)
      : row.position === 'RB'
        ? (['carries', 'targets'] as const)
        : row.position === 'K'
          ? (['fg_att', 'pat_att'] as const)
          : (['targets'] as const);
  return fields.every((key) => row.stats[key] !== undefined)
    ? fields.reduce((sum, key) => sum + row.stats[key]!, 0)
    : undefined;
};
function coefficients(model: Model): number[] {
  // Fixed ridge penalty limits unstable adjustments; held-out errors decide whether
  // this model is used instead of the unadjusted baseline. No outcome is its own input.
  const rows = model.matrix.map((row, i) => [
    ...row.map((v, j) => v + (i === j ? 25 : 0)),
    model.target[i]!,
  ]);
  for (let i = 0; i < 3; i++) {
    const pivot = rows[i]![i]!;
    if (!Number.isFinite(pivot) || Math.abs(pivot) < 1e-10) return [0, 0, 0];
    for (let j = i; j <= 3; j++) rows[i]![j] = rows[i]![j]! / pivot;
    for (let k = 0; k < 3; k++)
      if (k !== i) {
        const scale = rows[k]![i]!;
        for (let j = i; j <= 3; j++) rows[k]![j] = rows[k]![j]! - scale * rows[i]![j]!;
      }
  }
  return rows.map((row) => row[3]!);
}
function summary(model: Model) {
  const groups = new Map<string, number[]>();
  for (const row of model.observations) {
    const values = groups.get(row.week) ?? [];
    values.push(Math.abs(row.baselineResidual) - Math.abs(row.residual));
    groups.set(row.week, values);
  }
  const differences = [...groups.values()].map(average);
  const mean = differences.length ? average(differences) : 0;
  const variance =
    differences.length > 1
      ? differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (differences.length - 1)
      : 0;
  return {
    cases: model.observations.length,
    weeks: groups.size,
    mae: model.observations.length
      ? average(model.observations.map((r) => Math.abs(r.residual)))
      : 0,
    baselineMae: model.observations.length
      ? average(model.observations.map((r) => Math.abs(r.baselineResidual)))
      : 0,
    improvementLower:
      differences.length > 1 ? mean - 1.96 * Math.sqrt(variance / differences.length) : -1,
  };
}
const quantile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)]!;
};

/** Prepare one chronological cohort model per supported player position, reused across players. */
export function prepareFantasyForecast(
  league: LeagueConnection,
  data: FootballDataSnapshot,
  target: { season: number; week: number; asOf: string },
) {
  const models = new Map<string, Model>();
  const histories = new Map<string, Sample[]>();
  const names = new Map<string, Set<string>>();
  const defenses = new Map<string, { week: string; points: number }[]>();
  const freshSources = new Set(
    data.sources.filter((s) => fresh(data, s.id, target.asOf)).map((s) => s.id),
  );
  const gameCounts = new Map<string, number>();
  for (const game of data.games) gameCounts.set(game.id, (gameCounts.get(game.id) ?? 0) + 1);
  const uniqueData = { ...data, games: data.games.filter((g) => gameCounts.get(g.id) === 1) };
  const raw = historicalPlayerGames(uniqueData, target);
  const counts = new Map<string, number>();
  for (const row of raw) {
    const key = `${row.playerId}:${weekKey(row)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const incompleteDefenseWeeks = new Set<string>();
  const samples: Sample[] = raw
    .flatMap((row) => {
      if (!['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(row.position)) return [];
      const result = scoreHistoricalGame(league, row);
      if (
        counts.get(`${row.playerId}:${weekKey(row)}`) !== 1 ||
        !footballRowSourceIds(row).length ||
        !footballRowSourceIds(row).every((id) => freshSources.has(id)) ||
        result.points === undefined
      ) {
        // A rejected contributor must not silently shrink an opponent's recorded total.
        incompleteDefenseWeeks.add(`${weekKey(row)}:${row.position}:${nflTeamKey(row.opponent)}`);
        return [];
      }
      return [{ row, points: result.points, usage: usage(row) }];
    })
    .sort(
      (a, b) =>
        a.row.season - b.row.season ||
        a.row.week - b.row.week ||
        a.row.playerId.localeCompare(b.row.playerId),
    );
  for (const { row } of samples) {
    const key = `${playerNameKey(row.name)}:${row.position}`,
      ids = names.get(key) ?? new Set<string>();
    ids.add(row.playerId);
    names.set(key, ids);
  }
  const creditedByPlayer = new Map<string, PlayerGameStats[]>();
  for (const row of historicalPlayerGames(uniqueData, { ...target, week: 19 })) {
    if (
      !footballRowSourceIds(row).length ||
      !footballRowSourceIds(row).every((id) => freshSources.has(id))
    )
      continue;
    const list = creditedByPlayer.get(row.playerId) ?? [];
    list.push(row);
    creditedByPlayer.set(row.playerId, list);
  }
  const positionMeans = new Map<string, { mean: number; teams: number }>();
  const refreshPositionMeans = () => {
    for (const position of ['QB', 'RB', 'WR', 'TE', 'K', 'DST']) {
      const relevant = [...defenses.entries()].filter(([key]) => key.startsWith(`${position}:`));
      const values = relevant.flatMap(([, rows]) => rows.slice(-8).map((r) => r.points));
      positionMeans.set(position, {
        mean: values.length ? average(values) : 0,
        teams: relevant.length,
      });
    }
  };
  const features = (prior: Sample[], position: string, opponent: string) => {
    const recent = prior.slice(-8),
      baseline = average(recent.map((s) => s.points));
    const short = recent.slice(-3);
    const role =
      recent.every((s) => s.usage !== undefined) && average(recent.map((s) => s.usage!)) > 0
        ? baseline *
          (average(short.map((s) => s.usage!)) / average(recent.map((s) => s.usage!)) - 1)
        : 0;
    const positionMean = positionMeans.get(position);
    const opposing = defenses.get(`${position}:${nflTeamKey(opponent)}`)?.slice(-8) ?? [];
    const matchup =
      opposing.length >= 4 && positionMean && positionMean.teams >= 4
        ? average(opposing.map((r) => r.points)) - positionMean.mean
        : 0;
    return { baseline, x: [average(short.map((s) => s.points)) - baseline, role, matchup] };
  };
  const pending = new Map<string, Sample[]>();
  for (const sample of samples) {
    const key = weekKey(sample.row),
      group = pending.get(key) ?? [];
    group.push(sample);
    pending.set(key, group);
  }
  for (const [week, group] of pending) {
    refreshPositionMeans();
    const weekWeights = new Map(
      [...models].map(([position, model]) => [position, coefficients(model)]),
    );
    const training: { model: Model; x: number[]; residual: number }[] = [];
    const totals = new Map<string, number>();
    for (const sample of group) {
      const { row, points } = sample;
      const model: Model = models.get(row.position) ?? {
        matrix: Array.from({ length: 3 }, () => [0, 0, 0]),
        target: [0, 0, 0],
        cases: 0,
        weeks: new Set<string>(),
        observations: [],
      };
      models.set(row.position, model);
      const prior = histories.get(row.playerId) ?? [];
      if (prior.length >= 4) {
        const { baseline, x } = features(prior, row.position, row.opponent);
        if (model.cases >= 40 && model.weeks.size >= 8) {
          const prediction =
            baseline +
            weekWeights.get(row.position)!.reduce((sum, value, i) => sum + value * x[i]!, 0);
          model.observations.push({
            week,
            residual: points - prediction,
            baselineResidual: points - baseline,
          });
        }
        training.push({ model, x, residual: points - baseline });
      }
      const key = `${row.position}:${nflTeamKey(row.opponent)}`;
      totals.set(key, (totals.get(key) ?? 0) + points);
    }
    // Commit the entire week after prediction: simultaneous games/players cannot
    // leak their outcomes into each other's workload, opponent features or weights.
    for (const { model, x, residual } of training) {
      model.cases++;
      model.weeks.add(week);
      for (let i = 0; i < 3; i++) {
        model.target[i] = model.target[i]! + x[i]! * residual;
        for (let j = 0; j < 3; j++) model.matrix[i]![j] = model.matrix[i]![j]! + x[i]! * x[j]!;
      }
    }
    for (const sample of group) {
      const list = histories.get(sample.row.playerId) ?? [];
      list.push(sample);
      histories.set(sample.row.playerId, list);
    }
    for (const [key, points] of totals) {
      if (incompleteDefenseWeeks.has(`${week}:${key}`)) continue;
      const list = defenses.get(key) ?? [];
      list.push({ week, points });
      defenses.set(key, list);
    }
  }
  refreshPositionMeans();
  const fitted = new Map(
    [...models].map(([position, model]) => {
      const evaluation = summary(model),
        enhanced = evaluation.improvementLower > 0;
      const errors = model.observations.map((o) => (enhanced ? o.residual : o.baselineResidual));
      return [
        position,
        {
          evaluation: {
            ...evaluation,
            mae: enhanced ? evaluation.mae : evaluation.baselineMae,
            candidateMae: evaluation.mae,
          },
          enhanced,
          weights: enhanced ? coefficients(model) : [0, 0, 0],
          lowError: Math.min(0, quantile(errors, 0.1)),
          highError: Math.max(0, quantile(errors, 0.9)),
        },
      ];
    }),
  );
  const schedules = new Map<string, FootballGame[]>();
  for (const game of data.games.filter((g) => g.season === target.season && g.seasonType === 'REG'))
    for (const team of new Set([nflTeamKey(game.home), nflTeamKey(game.away)])) {
      const list = schedules.get(team) ?? [];
      list.push(game);
      schedules.set(team, list);
    }
  const sourceIdsFor = (position: string) => [
    'games',
    ...new Set(
      samples
        .filter((s) => s.row.position === position)
        .flatMap((s) => footballRowSourceIds(s.row)),
    ),
  ];
  return (
    player: RosterPlayer,
    scope: 'season' | 'remaining-season',
    throughWeek = 18,
  ): FantasyForecast | undefined => {
    if (
      target.season < 2021 ||
      target.season !== data.season ||
      !Number.isInteger(target.week) ||
      target.week < 1 ||
      target.week > 18 ||
      !Number.isFinite(Date.parse(target.asOf)) ||
      !freshSources.has('games') ||
      !player.nflTeam ||
      !Number.isInteger(throughWeek) ||
      throughWeek < target.week ||
      throughWeek > 18
    )
      return;
    const position = footballPosition(player.position);
    const ids = names.get(`${playerNameKey(player.name)}:${position}`);
    const id =
      position === 'DST'
        ? defensePlayerIdentity(player)
        : player.gsisId
          ? ids?.has(player.gsisId)
            ? player.gsisId
            : undefined
          : ids?.size === 1
            ? [...ids][0]
            : undefined;
    const selected = id && histories.has(id) ? ([id, histories.get(id)!] as const) : undefined;
    if (!selected || selected[1].length < 4) return;
    if (position === 'DST') {
      const team = nflTeamKey(player.nflTeam!);
      const expected = uniqueData.games
        .filter(
          (g) =>
            g.seasonType === 'REG' &&
            g.season >= target.season - 2 &&
            (g.season < target.season || g.week < target.week) &&
            g.date < target.asOf.slice(0, 10) &&
            g.homeScore !== undefined &&
            g.awayScore !== undefined &&
            [g.home, g.away].some((t) => nflTeamKey(t) === team),
        )
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8);
      if (
        expected.length < 4 ||
        expected.some(
          (g) =>
            raw.filter(
              (r) =>
                r.playerId === id &&
                r.gameId === g.id &&
                footballRowSourceIds(r).length > 0 &&
                footballRowSourceIds(r).every((source) => freshSources.has(source)) &&
                scoreHistoricalGame(league, r).points !== undefined,
            ).length !== 1,
        )
      )
        return;
    }
    const prior = selected[1],
      fit = fitted.get(position);
    if (prior.some((s) => s.row.position !== position)) return;
    if (
      !fit ||
      fit.evaluation.cases < 40 ||
      fit.evaluation.weeks < 8 ||
      prior.at(-1)!.row.season < target.season - 1
    )
      return;
    const team = nflTeamKey(player.nflTeam);
    const schedule = schedules.get(team) ?? [];
    if (
      schedule.length !== 17 ||
      new Set(schedule.map((g) => g.week)).size !== 17 ||
      new Set(schedule.map((g) => g.id)).size !== 17 ||
      schedule.some(
        (g) =>
          !validDate(g.date) ||
          !Number.isInteger(g.week) ||
          g.week < 1 ||
          g.week > 18 ||
          nflTeamKey(g.home) === nflTeamKey(g.away),
      )
    )
      return;
    const day = target.asOf.slice(0, 10);
    const window = schedule.filter(
      (g) => g.week >= (scope === 'season' ? 1 : target.week) && g.week <= throughWeek,
    );
    const credited = (creditedByPlayer.get(selected[0]) ?? []).filter(
      (row) =>
        row.playerId === selected[0] &&
        row.position === position &&
        (position === 'DST' || playerNameKey(row.name) === playerNameKey(player.name)),
    );
    const future: FootballGame[] = [],
      recorded: Sample[] = [];
    for (const game of window) {
      const complete = game.homeScore !== undefined && game.awayScore !== undefined;
      if (complete && game.date < day) {
        if (scope === 'season') {
          const rows = credited.filter((row) => row.gameId === game.id);
          // No stat row is not evidence of zero points or a missed appearance.
          if (rows.length !== 1) return;
          const result = scoreHistoricalGame(league, rows[0]!);
          if (result.points === undefined) return;
          recorded.push({ row: rows[0]!, points: result.points, usage: usage(rows[0]!) });
        }
        continue;
      }
      const kickoff = game.kickoffAt ? Date.parse(game.kickoffAt) : NaN;
      if (Number.isFinite(kickoff) && kickoff <= Date.parse(target.asOf)) {
        if (scope === 'remaining-season') continue;
        return;
      }
      // A date-only schedule cannot establish whether today's game has kicked off.
      if (
        (!Number.isFinite(kickoff) && game.date <= day) ||
        game.homeScore !== undefined ||
        game.awayScore !== undefined
      )
        return;
      future.push(game);
    }
    if (!future.length) return;
    const { evaluation, enhanced, weights, lowError, highError } = fit;
    let points = 0,
      lower = 0,
      upper = 0,
      baselinePoints = 0;
    const adjustments = [0, 0, 0];
    for (const game of future) {
      const opponent = nflTeamKey(game.home) === team ? game.away : game.home;
      const { baseline, x } = features(prior, position, opponent);
      const estimate = baseline + weights.reduce((sum, value, i) => sum + value * x[i]!, 0);
      if (!Number.isFinite(estimate)) return;
      baselinePoints += baseline;
      for (let i = 0; i < 3; i++) adjustments[i] = adjustments[i]! + weights[i]! * x[i]!;
      points += estimate;
      lower += estimate + lowError;
      upper += estimate + highError;
    }
    const recordedPoints = recorded.reduce((sum, s) => sum + s.points, 0);
    return {
      method: enhanced ? 'rolling-form-v1' : 'rolling-baseline-v1',
      points: points + recordedPoints,
      baselinePoints,
      formAdjustment: adjustments[0]!,
      workloadAdjustment: adjustments[1]!,
      opponentAdjustment: adjustments[2]!,
      recordedPoints,
      futureGames: future.length,
      lower: lower + recordedPoints,
      upper: upper + recordedPoints,
      sourceIds: sourceIdsFor(position),
      evaluation,
      warnings: [
        'Assumes continued role/participation; future injury, roster moves and rookie development unquantified.',
        enhanced
          ? 'Scoring-form, workload and opponent-position adjustments beat the baseline in the earlier weekly test; this is not prospective proof.'
          : 'Adjustments lacked reliable gains in earlier weekly tests; uses the scoring baseline.',
        'Summed per-game error bands without independence; not calibrated season coverage or availability probability.',
        ...(position === 'DST'
          ? [
              'D/ST estimates do not model current defensive personnel, weather, or future turnovers; negative scores remain possible.',
            ]
          : []),
        ...(player.position === 'K'
          ? [
              'Kicker estimates do not model weather, coaching fourth-down choices or a changed kicking job.',
            ]
          : []),
        ...(recordedPoints || recorded.length
          ? [
              'Full season includes recorded points; not remaining trade value or draft-time knowledge.',
            ]
          : []),
      ],
    };
  };
}
