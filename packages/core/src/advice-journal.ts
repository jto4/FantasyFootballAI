import type { AdviceResult } from './advice-types.js';
import type { LeagueConnection } from './domain-types.js';
import type { PredictionRecord } from './prediction-records.js';
import { americanOdds, optimizeLineup } from './advice-math.js';
export interface DecisionSnapshot {
  version: 1;
  mode: 'lineup' | 'trade' | 'waivers';
  adviceId: string;
  teamId: string;
  leagueId: string;
  capturedAt: string;
  rosterSnapshotAt?: string;
  ownershipIds: string[];
  chosenIds: string[];
  baselineIds: string[];
  baselineLabel: string;
  scope: 'week' | 'remaining-season';
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, n: number): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= n && !/[\u0000-\u001f]/.test(x);
const date = (x: unknown): x is string =>
  text(x, 40) && /(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x));
const ids = (x: unknown) =>
  Array.isArray(x) &&
  x.length > 0 &&
  x.length <= 100 &&
  new Set(x).size === x.length &&
  x.every((id) => text(id, 256));
export function isDecisionSnapshot(x: unknown): x is DecisionSnapshot {
  return (
    object(x) &&
    Object.keys(x).every((k) =>
      [
        'version',
        'mode',
        'adviceId',
        'teamId',
        'leagueId',
        'capturedAt',
        'rosterSnapshotAt',
        'ownershipIds',
        'chosenIds',
        'baselineIds',
        'baselineLabel',
        'scope',
      ].includes(k),
    ) &&
    x.version === 1 &&
    ['lineup', 'trade', 'waivers'].includes(String(x.mode)) &&
    text(x.adviceId, 160) &&
    text(x.teamId, 256) &&
    text(x.leagueId, 256) &&
    date(x.capturedAt) &&
    (x.rosterSnapshotAt === undefined ||
      (date(x.rosterSnapshotAt) &&
        Date.parse(x.rosterSnapshotAt) <= Date.parse(String(x.capturedAt)))) &&
    ids(x.ownershipIds) &&
    ids(x.chosenIds) &&
    ids(x.baselineIds) &&
    text(x.baselineLabel, 150) &&
    ['week', 'remaining-season'].includes(String(x.scope))
  );
}
/** Freeze the compared sets before kickoff. These are hypothetical choices, not platform transactions. */
export function captureDecisionSnapshot(
  result: AdviceResult,
  league: LeagueConnection | undefined,
  recordedAt: string,
): DecisionSnapshot | undefined {
  if (
    !league ||
    !result.request.teamId ||
    !['recommend', 'lean'].includes(result.assessment.verdict)
  )
    return;
  const team = league.teams.find((t) => t.id === result.request.teamId);
  if (!team?.roster?.length || !['lineup', 'trade', 'waivers'].includes(result.request.mode))
    return;
  const owned = new Set(team.roster.map((p) => p.id));
  const active = result.players.filter(
    (p) =>
      p.projectedPoints !== undefined && !/^(out|ir|inactive|suspended)$/i.test(p.status ?? ''),
  );
  const roster = active.filter((p) => owned.has(p.id));
  let chosenIds: string[] = [],
    baselineIds: string[] = [],
    baselineLabel = '';
  if (result.request.mode === 'lineup' && result.startSit) {
    chosenIds = [...result.assessment.recommendedPlayerIds];
    const alternatives = active
      .filter((p) => result.startSit!.candidateIds.includes(p.id))
      .sort((a, b) => b.projectedPoints! - a.projectedPoints! || a.id.localeCompare(b.id));
    if (alternatives[0]) baselineIds = [alternatives[0].id];
    baselineLabel = 'Highest supplied estimate for the same spot';
  } else if (result.request.mode === 'lineup') {
    chosenIds = result.lineup?.complete ? result.lineup.assignments.map((a) => a.playerId) : [];
    const current =
      league.matchups
        ?.filter((m) => m.week === result.week)
        .flatMap((m) =>
          m.teams.filter((t) => t.teamId === team.id).flatMap((t) => t.starters ?? []),
        ) ?? [];
    const baseline = optimizeLineup(
      roster.filter((p) => current.includes(p.id)),
      league.settings.roster_positions,
    );
    if (!baseline.complete || current.length !== baseline.assignments.length) return;
    baselineIds = baseline.assignments.map((a) => a.playerId);
    baselineLabel = 'Recorded legal starters at analysis time';
  } else if (result.request.mode === 'trade') {
    if (!result.lineup?.complete || !result.alternativeLineup?.complete) return;
    baselineIds = result.lineup.assignments.map((a) => a.playerId);
    chosenIds = result.alternativeLineup.assignments.map((a) => a.playerId);
    baselineLabel = 'Best supported lineup before the proposed trade';
  } else {
    if (
      !result.request.dropPlayerId ||
      result.assessment.recommendedPlayerIds.length !== 1 ||
      !result.lineup?.complete
    )
      return;
    const candidate = active.find((p) => p.id === result.assessment.recommendedPlayerIds[0]);
    if (!candidate) return;
    const after = optimizeLineup(
      [...roster.filter((p) => p.id !== result.request.dropPlayerId), candidate],
      league.settings.roster_positions,
    );
    if (!after.complete) return;
    chosenIds = after.assignments.map((a) => a.playerId);
    baselineIds = result.lineup.assignments.map((a) => a.playerId);
    baselineLabel = 'Best supported lineup before the proposed add/drop';
  }
  const snapshot: DecisionSnapshot = {
    version: 1,
    mode: result.request.mode as DecisionSnapshot['mode'],
    adviceId: result.id,
    teamId: team.id,
    leagueId: league.id,
    capturedAt: recordedAt,
    ownershipIds: [...owned],
    chosenIds,
    baselineIds,
    baselineLabel,
    scope: result.request.mode === 'trade' ? 'remaining-season' : 'week',
    ...(league.lastSyncedAt && Date.parse(league.lastSyncedAt) <= Date.parse(recordedAt)
      ? { rosterSnapshotAt: league.lastSyncedAt }
      : {}),
  };
  return isDecisionSnapshot(snapshot) ? snapshot : undefined;
}
export interface AdviceJournalReport {
  decisions: {
    adviceId: string;
    mode: string;
    capturedAt: string;
    baselineLabel: string;
    status: 'pending' | 'missing' | 'settled';
    projectedChange?: number;
    actualChange?: number;
  }[];
  projections: {
    key: string;
    mode: string;
    league: string;
    position: string;
    gamesPerForecast: number;
    season: number;
    samples: number;
    mae: number;
    baselineMae?: number;
  }[];
  experiments: {
    protocolId: string;
    method: string;
    season: number;
    market: string;
    samples: number;
    weeks: number;
    brier: number;
    baselineBrier: number;
    improvement: number;
    interval?: [number, number];
    calibration: { range: string; samples: number; predicted: number; observed: number }[];
  }[];
  excludedBetRecords: number;
  warnings: string[];
}
export function isAdviceJournalReport(x: unknown): x is AdviceJournalReport {
  const n = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const count = (v: unknown) => n(v) && Number.isInteger(v) && v >= 0 && v <= 2000;
  return (
    object(x) &&
    count(x.excludedBetRecords) &&
    Array.isArray(x.warnings) &&
    x.warnings.length <= 20 &&
    x.warnings.every((w) => text(w, 3000)) &&
    Array.isArray(x.decisions) &&
    x.decisions.length <= 2000 &&
    x.decisions.every(
      (d) =>
        object(d) &&
        text(d.adviceId, 160) &&
        text(d.mode, 40) &&
        date(d.capturedAt) &&
        text(d.baselineLabel, 150) &&
        ['pending', 'missing', 'settled'].includes(String(d.status)) &&
        (d.projectedChange === undefined || n(d.projectedChange)) &&
        (d.status === 'settled' ? n(d.actualChange) : d.actualChange === undefined),
    ) &&
    Array.isArray(x.projections) &&
    x.projections.length <= 2000 &&
    x.projections.every(
      (p) =>
        object(p) &&
        text(p.key, 12) &&
        text(p.mode, 250) &&
        text(p.league, 150) &&
        text(p.position, 20) &&
        Number.isInteger(p.season) &&
        Number(p.season) >= 2010 &&
        Number(p.season) <= 2099 &&
        Number.isInteger(p.gamesPerForecast) &&
        Number(p.gamesPerForecast) >= 1 &&
        Number(p.gamesPerForecast) <= 18 &&
        count(p.samples) &&
        n(p.mae) &&
        p.mae >= 0 &&
        (p.baselineMae === undefined || (n(p.baselineMae) && p.baselineMae >= 0)),
    ) &&
    Array.isArray(x.experiments) &&
    x.experiments.length <= 2000 &&
    x.experiments.every(
      (e) =>
        object(e) &&
        text(e.protocolId, 250) &&
        text(e.method, 180) &&
        Number.isInteger(e.season) &&
        ['moneyline', 'spread', 'total'].includes(String(e.market)) &&
        count(e.samples) &&
        count(e.weeks) &&
        ['brier', 'baselineBrier', 'improvement'].every((k) => n(e[k])) &&
        (e.interval === undefined ||
          (Array.isArray(e.interval) &&
            e.interval.length === 2 &&
            e.interval.every(n) &&
            Number(e.interval[0]) <= Number(e.interval[1]))) &&
        Array.isArray(e.calibration) &&
        e.calibration.length <= 5 &&
        e.calibration.every(
          (b) =>
            object(b) &&
            text(b.range, 40) &&
            count(b.samples) &&
            n(b.predicted) &&
            b.predicted >= 0 &&
            b.predicted <= 1 &&
            n(b.observed) &&
            b.observed >= 0 &&
            b.observed <= 1,
        ),
    )
  );
}
export function adviceJournal(records: PredictionRecord[]): AdviceJournalReport {
  const decisions: AdviceJournalReport['decisions'] = [];
  const byId = new Map<string, PredictionRecord>();
  for (const record of records) if (!byId.has(record.id)) byId.set(record.id, record);
  const decisionIds = new Set<string>();
  const seen = new Set<string>();
  const projectionGroups = new Map<string, PredictionRecord[]>();
  for (const r of [...records].sort(
    (a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id),
  )) {
    if (r.kind === 'fantasy' && r.status === 'settled') {
      const key = `${r.workflow ?? 'legacy'}:${r.method}:${r.player?.leagueId}:${r.player?.id}:${r.scope}:${r.games.map((g) => g.id).join(',')}:${JSON.stringify(Object.entries(r.player?.scoring ?? {}).sort())}`;
      if (!seen.has(key)) {
        seen.add(key);
        const group = `${r.workflow ?? 'legacy'}:${r.scope}:${r.method}:${r.season}:${r.player?.leagueId}:${r.player?.position}:${r.games.length}:${JSON.stringify(Object.entries(r.player?.scoring ?? {}).sort())}`;
        projectionGroups.set(group, [...(projectionGroups.get(group) ?? []), r]);
      }
    }
    const d = r.decision;
    if (!d || decisionIds.has(d.adviceId)) continue;
    decisionIds.add(d.adviceId);
    const needed = [...new Set([...d.chosenIds, ...d.baselineIds])];
    const rows = needed.map((id) => {
      const p = byId.get(`${d.adviceId}:fantasy:${id}`);
      return p?.adviceId === d.adviceId &&
        p.kind === 'fantasy' &&
        p.player?.leagueId === d.leagueId &&
        p.scope === d.scope
        ? p
        : undefined;
    });
    const complete = rows.every((p): p is PredictionRecord => !!p);
    const settled = complete && rows.every((p) => p.status === 'settled');
    const sum = (ids: string[], field: 'forecast' | 'actual') =>
      ids.reduce((total, id) => total + rows.find((p) => p?.player?.id === id)![field]!, 0);
    decisions.push({
      adviceId: d.adviceId,
      mode: d.mode,
      capturedAt: d.capturedAt,
      baselineLabel: d.baselineLabel,
      status:
        !complete || rows.some((p) => p?.status === 'missing')
          ? 'missing'
          : settled
            ? 'settled'
            : 'pending',
      ...(complete
        ? { projectedChange: sum(d.chosenIds, 'forecast') - sum(d.baselineIds, 'forecast') }
        : {}),
      ...(settled
        ? { actualChange: sum(d.chosenIds, 'actual') - sum(d.baselineIds, 'actual') }
        : {}),
    });
  }
  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const groups = new Map<string, PredictionRecord[]>(),
    uniqueBets = new Set<string>();
  let excludedBetRecords = 0;
  for (const r of [...records].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
    if (r.kind !== 'bet') continue;
    if (
      !r.protocol ||
      !r.quote ||
      r.baseline === undefined ||
      r.quote.oppositeAmericanOdds === undefined ||
      r.terms?.kind === 'player-prop' ||
      Date.parse(r.quote.observedAt) > Date.parse(r.recordedAt) ||
      Date.parse(r.recordedAt) - Date.parse(r.quote.observedAt) > 300000
    ) {
      excludedBetRecords++;
      continue;
    }
    const implied = americanOdds(r.quote.americanOdds).breakEvenRate;
    const opposite = americanOdds(r.quote.oppositeAmericanOdds).breakEvenRate;
    if (Math.abs(r.baseline - implied / (implied + opposite)) > 1e-12) {
      excludedBetRecords++;
      continue;
    }
    const key = `${r.protocol.id}:${r.games[0]!.id}:${r.terms!.kind}`;
    if (uniqueBets.has(key)) continue;
    uniqueBets.add(key);
    if (r.status !== 'settled' || r.actual === 0) continue;
    const group = `${r.protocol.id}:${r.season}:${r.terms!.kind}`;
    groups.set(group, [...(groups.get(group) ?? []), r]);
  }
  const experiments = [...groups.values()].map((rows) => {
    const first = rows[0]!,
      losses = rows.map(
        (r) =>
          (r.baseline! - (r.actual === 1 ? 1 : 0)) ** 2 -
          (r.forecast - (r.actual === 1 ? 1 : 0)) ** 2,
      );
    const improvement = avg(losses),
      weeks = new Map<number, { sum: number; n: number }>();
    rows.forEach((r, i) => {
      const week = r.games[0]!.week;
      const g = weeks.get(week) ?? { sum: 0, n: 0 };
      g.sum += losses[i]!;
      g.n++;
      weeks.set(week, g);
    });
    const se =
      weeks.size >= 8
        ? Math.sqrt(
            (weeks.size / (weeks.size - 1)) *
              [...weeks.values()].reduce((s, g) => s + (g.sum - improvement * g.n) ** 2, 0),
          ) / rows.length
        : undefined;
    return {
      protocolId: first.protocol!.id,
      method: first.method,
      season: first.season,
      market: first.terms!.kind,
      samples: rows.length,
      weeks: weeks.size,
      brier: avg(rows.map((r) => (r.forecast - (r.actual === 1 ? 1 : 0)) ** 2)),
      baselineBrier: avg(rows.map((r) => (r.baseline! - (r.actual === 1 ? 1 : 0)) ** 2)),
      improvement,
      ...(se === undefined
        ? {}
        : { interval: [improvement - 1.96 * se, improvement + 1.96 * se] as [number, number] }),
      calibration: Array.from({ length: 5 }, (_, i) => {
        const bucket = rows.filter((r) => Math.min(4, Math.floor(r.forecast * 5)) === i);
        return {
          range: `${20 * i}–${20 * (i + 1)}%`,
          samples: bucket.length,
          predicted: bucket.length ? avg(bucket.map((r) => r.forecast)) : 0,
          observed: bucket.length ? avg(bucket.map((r) => (r.actual === 1 ? 1 : 0))) : 0,
        };
      }).filter((b) => b.samples),
    };
  });
  return {
    decisions,
    projections: [...projectionGroups].map(([, rows], index) => ({
      key: String(index),
      mode: `${rows[0]!.workflow ?? 'legacy'}:${rows[0]!.scope}:${rows[0]!.method}`,
      league: rows[0]!.player?.leagueName ?? 'Saved league',
      position: rows[0]!.player?.position ?? 'Unknown',
      gamesPerForecast: rows[0]!.games.length,
      season: rows[0]!.season,
      samples: rows.length,
      mae: avg(rows.map((r) => Math.abs(r.forecast - r.actual!))),
      ...(rows.every((r) => r.baseline !== undefined)
        ? { baselineMae: avg(rows.map((r) => Math.abs(r.baseline! - r.actual!))) }
        : {}),
    })),
    experiments,
    excludedBetRecords,
    warnings: [
      'Decision comparisons are hypothetical frozen choices, not executed transactions or proof of causation. Missing appearances remain unknown, never zero.',
      'Draft and unsupported decisions contribute projection accuracy only; no draft-time skill or complete transaction gain is inferred.',
      'Prospective betting comparisons require versioned code and the same verified pre-kickoff quote. Manual, old unversioned, AI judgment and prop records are excluded.',
      'Sentiment and whale corrections remain research-only. No experiment automatically changes production forecasts. Positive sample scores do not establish a consistent sportsbook edge.',
    ],
  };
}
