import type { AdviceResult, BetTerms, FootballDataSnapshot, FootballGame } from './advice-types.js';
import type { LeagueConnection, RosterPlayer } from './domain-types.js';
import { isDecisionSnapshot, type DecisionSnapshot } from './advice-journal.js';
import { isAdviceRequest } from './advice-contracts.js';
import {
  isSportsbookQuote,
  type SportsbookQuote,
  type FinalFootballResult,
} from './sportsbook-types.js';
import { americanOdds, nflTeamKey, playerNameKey, scoreHistoricalGame } from './advice-math.js';
import { closingLineValue } from './prop-lines.js';
export const maximumPredictionRecords = 2000;
export const maximumPredictionBytes = 8000000;
type TargetGame = Pick<
  FootballGame,
  'id' | 'espnId' | 'season' | 'week' | 'seasonType' | 'date' | 'kickoffAt' | 'home' | 'away'
>;
export interface PredictionRecord {
  workflow?: AdviceResult['request']['mode'];
  decision?: DecisionSnapshot;
  protocol?: {
    id: string;
    sourceHash: string;
    registeredAt: string;
    baseline: 'same-quote-no-vig';
    minimumWeeks: 8;
  };
  id: string;
  adviceId: string;
  recordedAt: string;
  method: string;
  kind: 'fantasy' | 'bet';
  season: number;
  forecast: number;
  baseline?: number;
  games: TargetGame[];
  selected: boolean;
  terms?: BetTerms;
  quote?: SportsbookQuote;
  player?: {
    id: string;
    name: string;
    position: string;
    team: string;
    leagueId?: string;
    leagueName?: string;
    gsisId?: string;
    platform: LeagueConnection['platform'];
    scoring: Record<string, number>;
  };
  scope?: 'week' | 'season' | 'remaining-season';
  status: 'pending' | 'missing' | 'settled';
  actual?: number;
  profitUnits?: number;
  settledAt?: string;
  /**
   * Last pregame price at the same book and side, captured shortly before kickoff. `clv` is the
   * no-vig closing probability minus the probability implied by the price taken; it is present
   * only when the line itself did not move, so the two prices describe the same bet.
   */
  closing?: {
    observedAt: string;
    americanOdds: number;
    oppositeAmericanOdds: number;
    line?: number;
    clv?: number;
  };
}
const obj = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, n: number) =>
  typeof x === 'string' && x.length > 0 && x.length <= n && !/[\u0000-\u001f\u007f]/.test(x);
const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const date = (x: unknown) =>
  text(x, 40) &&
  /(?:Z|[+-]\d\d:\d\d)$/.test(x as string) &&
  Number.isFinite(Date.parse(x as string));
const gameKeys = [
  'id',
  'espnId',
  'season',
  'week',
  'seasonType',
  'date',
  'kickoffAt',
  'home',
  'away',
];
export function isPredictionRecord(x: unknown): x is PredictionRecord {
  if (
    obj(x) &&
    x.workflow !== undefined &&
    !['draft-plan', 'draft-review', 'lineup', 'trade', 'waivers', 'betting'].includes(
      String(x.workflow),
    )
  )
    return false;
  if (
    obj(x) &&
    x.decision !== undefined &&
    (!isDecisionSnapshot(x.decision) ||
      x.kind !== 'fantasy' ||
      x.decision.adviceId !== x.adviceId ||
      x.decision.capturedAt !== x.recordedAt)
  )
    return false;
  if (obj(x) && x.protocol !== undefined) {
    const p = x.protocol;
    if (
      !obj(p) ||
      Object.keys(p).some(
        (k) => !['id', 'sourceHash', 'registeredAt', 'baseline', 'minimumWeeks'].includes(k),
      ) ||
      x.kind !== 'bet' ||
      !text(p.sourceHash, 64) ||
      !/^[a-f0-9]{64}$/.test(String(p.sourceHash)) ||
      p.id !== `${x.method}:${p.sourceHash}` ||
      !date(p.registeredAt) ||
      Date.parse(String(p.registeredAt)) > Date.parse(String(x.recordedAt)) ||
      p.baseline !== 'same-quote-no-vig' ||
      p.minimumWeeks !== 8
    )
      return false;
  }
  if (
    !obj(x) ||
    Object.keys(x).some(
      (k) =>
        ![
          'id',
          'workflow',
          'decision',
          'protocol',
          'adviceId',
          'recordedAt',
          'method',
          'kind',
          'season',
          'forecast',
          'baseline',
          'games',
          'selected',
          'terms',
          'quote',
          'player',
          'scope',
          'status',
          'actual',
          'profitUnits',
          'settledAt',
          'closing',
        ].includes(k),
    ) ||
    !text(x.id, 256) ||
    !text(x.adviceId, 160) ||
    !date(x.recordedAt) ||
    !text(x.method, 180) ||
    !['fantasy', 'bet'].includes(String(x.kind)) ||
    !Number.isInteger(x.season) ||
    Number(x.season) < 2010 ||
    Number(x.season) > 2099 ||
    !finite(x.forecast) ||
    Math.abs(Number(x.forecast)) > 100000 ||
    (x.baseline !== undefined && !finite(x.baseline)) ||
    typeof x.selected !== 'boolean' ||
    !['pending', 'missing', 'settled'].includes(String(x.status)) ||
    !Array.isArray(x.games) ||
    !x.games.length ||
    x.games.length > 18
  )
    return false;
  if (
    new Set(x.games.map((g) => (obj(g) ? g.id : undefined))).size !== x.games.length ||
    !x.games.every(
      (g) =>
        obj(g) &&
        Object.keys(g).every((k) => gameKeys.includes(k)) &&
        text(g.id, 80) &&
        g.season === x.season &&
        g.seasonType === 'REG' &&
        Number.isInteger(g.week) &&
        Number(g.week) >= 1 &&
        Number(g.week) <= 18 &&
        text(g.date, 10) &&
        /^\d{4}-\d\d-\d\d$/.test(String(g.date)) &&
        date(g.kickoffAt) &&
        Date.parse(String(g.kickoffAt)) > Date.parse(String(x.recordedAt)) &&
        text(g.home, 8) &&
        text(g.away, 8) &&
        g.home !== g.away &&
        (g.espnId === undefined || (typeof g.espnId === 'string' && /^\d{9}$/.test(g.espnId))),
    )
  )
    return false;
  if (x.status === 'settled') {
    if (
      !date(x.settledAt) ||
      !finite(x.actual) ||
      Date.parse(String(x.settledAt)) <=
        Math.max(...x.games.map((g) => Date.parse(String(g.kickoffAt)))) ||
      (x.profitUnits !== undefined && !finite(x.profitUnits))
    )
      return false;
  } else if (x.actual !== undefined || x.profitUnits !== undefined || x.settledAt !== undefined)
    return false;
  if (x.kind === 'bet') {
    if (
      x.player !== undefined ||
      x.scope !== undefined ||
      x.games.length !== 1 ||
      Number(x.forecast) < 0 ||
      Number(x.forecast) > 1 ||
      (x.baseline !== undefined && (Number(x.baseline) < 0 || Number(x.baseline) > 1)) ||
      !isAdviceRequest({ mode: 'betting', bet: x.terms })
    )
      return false;
    const t = x.terms as BetTerms;
    if (
      t.gameId !== x.games[0].id ||
      (x.quote !== undefined &&
        (!isSportsbookQuote(x.quote) ||
          x.quote.id !== t.quoteId ||
          x.quote.gameId !== t.gameId ||
          x.quote.kind !== t.kind ||
          x.quote.side !== t.side ||
          x.quote.line !== t.line ||
          x.quote.americanOdds !== t.americanOdds ||
          x.quote.oppositeAmericanOdds !== t.oppositeAmericanOdds ||
          Date.parse(x.quote.observedAt) > Date.parse(String(x.recordedAt))))
    )
      return false;
    if (
      x.selected &&
      (!x.quote ||
        t.kind === 'player-prop' ||
        Date.parse(String(x.recordedAt)) - Date.parse((x.quote as SportsbookQuote).observedAt) >
          300000)
    )
      return false;
    if (x.closing !== undefined) {
      const c = x.closing;
      if (
        !obj(c) ||
        Object.keys(c).some(
          (k) => !['observedAt', 'americanOdds', 'oppositeAmericanOdds', 'line', 'clv'].includes(k),
        ) ||
        !x.quote ||
        !date(c.observedAt) ||
        Date.parse(String(c.observedAt)) < Date.parse((x.quote as SportsbookQuote).observedAt) ||
        ![c.americanOdds, c.oppositeAmericanOdds].every(
          (o) => Number.isInteger(o) && Math.abs(Number(o)) >= 100 && Math.abs(Number(o)) <= 100000,
        ) ||
        (c.line !== undefined && !finite(c.line)) ||
        (c.clv !== undefined && (!finite(c.clv) || Math.abs(Number(c.clv)) > 1))
      )
        return false;
    }
    if (x.status === 'settled') {
      if (![-1, 0, 1].includes(Number(x.actual))) return false;
      const profit =
        Number(x.actual) === 1
          ? americanOdds(t.americanOdds).profitPerUnit
          : Number(x.actual) === -1
            ? -1
            : 0;
      if (x.selected ? x.profitUnits !== profit : x.profitUnits !== undefined) return false;
    }
    return true;
  }
  const p = x.player;
  return (
    x.terms === undefined &&
    x.closing === undefined &&
    x.quote === undefined &&
    x.selected === false &&
    x.profitUnits === undefined &&
    ['week', 'season', 'remaining-season'].includes(String(x.scope)) &&
    obj(p) &&
    Object.keys(p).every((k) =>
      [
        'id',
        'name',
        'position',
        'team',
        'leagueId',
        'leagueName',
        'gsisId',
        'platform',
        'scoring',
      ].includes(k),
    ) &&
    text(p.id, 120) &&
    text(p.name, 150) &&
    text(p.position, 8) &&
    text(p.team, 8) &&
    (p.leagueId === undefined || text(p.leagueId, 256)) &&
    (p.leagueName === undefined || text(p.leagueName, 150)) &&
    (p.gsisId === undefined || text(p.gsisId, 120)) &&
    ['sleeper', 'yahoo', 'espn'].includes(String(p.platform)) &&
    obj(p.scoring) &&
    Object.keys(p.scoring).length <= 200 &&
    Object.entries(p.scoring).every(
      ([k, v]) => text(k, 80) && finite(v) && Math.abs(Number(v)) <= 10000,
    )
  );
}
const frozen = (g: FootballGame): TargetGame =>
  Object.fromEntries(
    gameKeys
      .filter((k) => g[k as keyof FootballGame] !== undefined)
      .map((k) => [k, g[k as keyof FootballGame]]),
  ) as TargetGame;
/** Only newly saved, pre-kickoff predictions. Never reconstruct a supposed earlier forecast from history. */
export function capturePredictionRecords(
  result: AdviceResult,
  data: FootballDataSnapshot,
  league: LeagueConnection | undefined,
  catalog: RosterPlayer[],
  recordedAt: string,
  verifiedQuote?: SportsbookQuote,
): PredictionRecord[] {
  const captured = Date.parse(recordedAt);
  if (!Number.isFinite(captured)) return [];
  const records: PredictionRecord[] = [];
  if (result.request.bet) {
    const t = result.request.bet,
      game = data.games.filter((g) => g.id === t.gameId);
    if (game.length !== 1 || !game[0]!.kickoffAt || Date.parse(game[0]!.kickoffAt!) <= captured)
      return [];
    const implied = americanOdds(t.americanOdds).breakEvenRate;
    const opposite =
      t.oppositeAmericanOdds === undefined
        ? undefined
        : americanOdds(t.oppositeAmericanOdds).breakEvenRate;
    const baseline = opposite === undefined ? undefined : implied / (implied + opposite);
    const forecasts = [
      ...(result.betHistory?.forecast
        ? [
            {
              method: result.betHistory.forecast.method,
              probability: result.betHistory.forecast.probability,
              selected:
                !!verifiedQuote &&
                captured - Date.parse(verifiedQuote.observedAt) <= 300000 &&
                ['recommend', 'lean'].includes(result.assessment.verdict),
            },
          ]
        : []),
      ...(result.assessment.forecast
        ? [
            {
              method: `ai:${result.model}`,
              probability: result.assessment.forecast.probability,
              selected: false,
            },
          ]
        : []),
    ];
    for (const f of forecasts)
      records.push({
        id: `${result.id}:${f.method}`,
        adviceId: result.id,
        recordedAt,
        method: f.method,
        kind: 'bet',
        season: game[0]!.season,
        forecast: f.probability,
        ...(baseline === undefined ? {} : { baseline }),
        games: [frozen(game[0]!)],
        selected: f.selected,
        terms: structuredClone(t),
        ...(verifiedQuote ? { quote: structuredClone(verifiedQuote) } : {}),
        status: 'pending',
      });
  } else if (league) {
    for (const p of result.players) {
      if (p.projectedPoints === undefined || !p.team || !p.projectionMethod) continue;
      const period = p.projectionPeriod ?? {
        season: result.season,
        fromWeek: result.week,
        throughWeek: result.week,
      };
      const teamGames = data.games.filter(
        (g) =>
          g.season === period.season &&
          g.seasonType === 'REG' &&
          g.week >= period.fromWeek &&
          g.week <= period.throughWeek &&
          [g.home, g.away].map(nflTeamKey).includes(nflTeamKey(p.team!)),
      );
      const games = teamGames.filter((g) => g.kickoffAt && Date.parse(g.kickoffAt) > captured);
      if (
        !games.length ||
        games.length > 18 ||
        new Set(games.map((g) => g.week)).size !== games.length ||
        teamGames.some((g) => !g.kickoffAt)
      )
        continue;
      const recorded = p.metrics.find((m) => m.id === `${p.id}:forecast-recorded`)?.value;
      if (
        p.projectionScope === 'season' &&
        teamGames.some((g) => Date.parse(g.kickoffAt!) <= captured) &&
        recorded === undefined
      )
        continue;
      const future = p.projectedPoints - (p.projectionScope === 'season' ? (recorded ?? 0) : 0);
      const player = catalog.find((c) => c.id === p.id);
      const baseline = p.metrics.find((m) => m.id === `${p.id}:forecast-baseline`)?.value;
      records.push({
        id: `${result.id}:fantasy:${p.id}`,
        adviceId: result.id,
        recordedAt,
        method: p.projectionMethod,
        kind: 'fantasy',
        workflow: result.request.mode,
        season: period.season,
        forecast: future,
        ...(baseline === undefined
          ? {}
          : { baseline: baseline - (p.projectionScope === 'season' ? (recorded ?? 0) : 0) }),
        games: games.map(frozen),
        selected: false,
        player: {
          id: p.id,
          name: p.name,
          position: p.position,
          team: p.team,
          leagueId: league.id,
          leagueName: (league.displayName ?? league.name).slice(0, 150),
          ...(player?.gsisId ? { gsisId: player.gsisId } : {}),
          platform: league.platform,
          scoring: structuredClone(league.scoring),
        },
        scope: p.projectionScope ?? 'week',
        status: 'pending',
      });
    }
  }
  return records.filter(isPredictionRecord);
}
/** Missing/ambiguous player outcomes stay unknown. Final scores must come from a verified final-event receipt. */
export function settlePredictionRecord(
  record: PredictionRecord,
  data: FootballDataSnapshot,
  finals: FinalFootballResult[],
  asOf: string,
): PredictionRecord {
  if (record.status === 'settled') return record;
  const matches = record.games.map((g) =>
    finals.filter(
      (f) =>
        f.gameId === g.id &&
        f.espnId === g.espnId &&
        nflTeamKey(f.home) === nflTeamKey(g.home) &&
        nflTeamKey(f.away) === nflTeamKey(g.away) &&
        f.kickoffAt === g.kickoffAt &&
        Date.parse(f.observedAt) <= Date.parse(asOf),
    ),
  );
  if (matches.some((m) => m.length !== 1)) return record;
  if (record.kind === 'bet') {
    const t = record.terms!,
      g = matches[0]![0]!;
    let margin = t.kind === 'total' ? g.homeScore + g.awayScore : g.homeScore - g.awayScore;
    if (t.kind === 'moneyline' || t.kind === 'spread') {
      if (t.side === 'away') margin = -margin;
      if (t.kind === 'spread') margin += t.line!;
    } else if (t.kind === 'total')
      margin = t.side === 'under' ? t.line! - margin : margin - t.line!;
    else {
      const rows = data.players.filter(
        (p) =>
          p.playerId === t.playerId &&
          p.gameId === g.gameId &&
          p.season === record.season &&
          p.seasonType === 'REG' &&
          p.week === record.games[0]!.week &&
          [g.home, g.away].map(nflTeamKey).includes(nflTeamKey(p.team)) &&
          nflTeamKey(p.opponent) ===
            (nflTeamKey(p.team) === nflTeamKey(g.home) ? nflTeamKey(g.away) : nflTeamKey(g.home)),
      );
      if (rows.length !== 1 || rows[0]!.stats[t.stat!] === undefined)
        return { ...record, status: 'missing' };
      const ids = rows[0]!.sourceIds ?? [`stats-${record.season}`];
      if (
        !ids.length ||
        !ids.every((id) =>
          data.sources.some(
            (s) =>
              s.id === id &&
              s.status === 'available' &&
              s.retrievedAt &&
              Date.parse(s.retrievedAt) >= Date.parse(g.observedAt) &&
              Date.parse(s.retrievedAt) <= Date.parse(asOf),
          ),
        )
      )
        return { ...record, status: 'missing' };
      const value = rows[0]!.stats[t.stat!]!;
      margin = t.side === 'under' ? t.line! - value : value - t.line!;
    }
    const actual = Math.sign(margin),
      profit = actual > 0 ? americanOdds(t.americanOdds).profitPerUnit : actual < 0 ? -1 : 0;
    return {
      ...record,
      status: 'settled',
      actual,
      settledAt: asOf,
      ...(record.selected ? { profitUnits: profit } : {}),
    };
  }
  const p = record.player!;
  let total = 0;
  for (const target of record.games) {
    const rows = data.players.filter(
      (r) =>
        r.gameId === target.id &&
        r.season === record.season &&
        r.week === target.week &&
        r.seasonType === 'REG' &&
        r.position === (p.position === 'DEF' ? 'DST' : p.position) &&
        nflTeamKey(r.team) === nflTeamKey(p.team) &&
        nflTeamKey(r.opponent) ===
          (nflTeamKey(p.team) === nflTeamKey(target.home)
            ? nflTeamKey(target.away)
            : nflTeamKey(target.home)) &&
        (p.position === 'DEF' || p.position === 'DST'
          ? true
          : p.gsisId
            ? r.playerId === p.gsisId
            : playerNameKey(r.name) === playerNameKey(p.name)),
    );
    if (rows.length !== 1) return { ...record, status: 'missing' };
    const row = rows[0]!;
    const receipt = matches[record.games.indexOf(target)]![0]!;
    const ids = row.sourceIds ?? [`stats-${record.season}`];
    if (
      !ids.length ||
      !ids.every((id) =>
        data.sources.some(
          (s) =>
            s.id === id &&
            s.status === 'available' &&
            s.retrievedAt &&
            Date.parse(s.retrievedAt) >= Date.parse(receipt.observedAt) &&
            Date.parse(s.retrievedAt) <= Date.parse(asOf),
        ),
      )
    )
      return { ...record, status: 'missing' };
    const scored = scoreHistoricalGame(p, row);
    if (scored.points === undefined) return { ...record, status: 'missing' };
    total += scored.points;
  }
  return { ...record, status: 'settled', actual: total, settledAt: asOf };
}
export interface PredictionPerformance {
  total: number;
  pending: number;
  missing: number;
  capacity: number;
  groups: {
    kind: 'fantasy' | 'bet';
    method: string;
    scope?: string;
    league?: string;
    position?: string;
    gamesPerForecast?: number;
    samples: number;
    mae?: number;
    bias?: number;
    brier?: number;
    baselineBrier?: number;
    calibration: { range: string; samples: number; predicted: number; observed: number }[];
  }[];
  paper: {
    selections: number;
    wins: number;
    losses: number;
    pushes: number;
    stakedUnits: number;
    netUnits: number;
    roi?: number;
    weeks: number;
    roiInterval?: [number, number];
    /** Average closing line value of paper selections with a comparable closing price. */
    closingLineValue?: { samples: number; average: number; beatClose: number };
    /** Net units per settled week, in order, for a running profit-and-loss view. */
    byWeek: { season: number; week: number; netUnits: number }[];
  };
  warnings: string[];
}
/** Earliest prediction per game/player/method (and fantasy horizon/scoring) prevents retries inflating accuracy. */
export function predictionPerformance(records: PredictionRecord[]): PredictionPerformance {
  const unique = new Map<string, PredictionRecord>();
  for (const r of [...records].sort(
    (a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id),
  )) {
    const key =
      r.kind === 'bet'
        ? `${r.method}:${r.games[0]!.id}:${r.terms!.kind}:${r.terms!.side}`
        : `${r.method}:${r.player!.leagueId ?? ''}:${r.player!.id}:${r.scope}:${r.games.map((g) => g.id).join(',')}:${JSON.stringify(Object.entries(r.player!.scoring).sort())}`;
    if (!unique.has(key)) unique.set(key, r);
  }
  const all = [...unique.values()],
    groups = new Map<string, PredictionRecord[]>();
  for (const r of all.filter((r) => r.status === 'settled')) {
    const key = `${r.kind}:${r.method}:${r.scope ?? ''}:${r.player?.leagueId ?? ''}:${r.player?.position ?? ''}:${r.games.length}:${JSON.stringify(Object.entries(r.player?.scoring ?? {}).sort())}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const resultGroups = [...groups.values()].map((rows) => {
    const r = rows[0]!,
      average = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    if (r.kind === 'fantasy')
      return {
        kind: r.kind,
        method: r.method,
        ...(r.scope ? { scope: r.scope } : {}),
        ...(r.player?.leagueName ? { league: r.player.leagueName } : {}),
        ...(r.player?.position ? { position: r.player.position } : {}),
        gamesPerForecast: r.games.length,
        samples: rows.length,
        mae: average(rows.map((x) => Math.abs(x.forecast - x.actual!))),
        bias: average(rows.map((x) => x.forecast - x.actual!)),
        calibration: [],
      };
    const settled = rows.filter((x) => x.actual !== 0),
      baseline = settled.filter((x) => x.baseline !== undefined);
    return {
      kind: r.kind,
      method: r.method,
      samples: settled.length,
      ...(settled.length
        ? { brier: average(settled.map((x) => (x.forecast - (x.actual === 1 ? 1 : 0)) ** 2)) }
        : {}),
      ...(baseline.length === settled.length && baseline.length
        ? {
            baselineBrier: average(
              baseline.map((x) => (x.baseline! - (x.actual === 1 ? 1 : 0)) ** 2),
            ),
          }
        : {}),
      calibration: Array.from({ length: 5 }, (_, i) => {
        const bucket = settled.filter((x) => Math.min(4, Math.floor(x.forecast * 5)) === i);
        return {
          range: `${i * 20}–${(i + 1) * 20}%`,
          samples: bucket.length,
          predicted: bucket.length ? average(bucket.map((x) => x.forecast)) : 0,
          observed: bucket.length ? average(bucket.map((x) => (x.actual === 1 ? 1 : 0))) : 0,
        };
      }).filter((x) => x.samples),
    };
  });
  // At most one qualifying paper selection per game/market; selection never uses its outcome.
  const selected = new Map<string, PredictionRecord>();
  for (const r of [...records].sort(
    (a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id),
  ))
    if (r.kind === 'bet' && r.selected && r.quote) {
      const key = `${r.games[0]!.id}:${r.terms!.kind}`;
      if (!selected.has(key)) selected.set(key, r);
    }
  const closed = [...selected.values()].filter((r) => r.status === 'settled'),
    net = closed.reduce((s, r) => s + r.profitUnits!, 0),
    weeks = new Map<string, { profit: number; stake: number }>();
  for (const r of closed) {
    const key = `${r.season}:${r.games[0]!.week}`,
      g = weeks.get(key) ?? { profit: 0, stake: 0 };
    g.profit += r.profitUnits!;
    g.stake++;
    weeks.set(key, g);
  }
  const roi = closed.length ? net / closed.length : undefined;
  const withClv = [...selected.values()].filter((r) => r.closing?.clv !== undefined);
  const byWeek = [...weeks.entries()]
    .map(([key, g]) => {
      const [season, week] = key.split(':').map(Number);
      return { season: season!, week: week!, netUnits: g.profit };
    })
    .sort((a, b) => a.season - b.season || a.week - b.week);
  const se =
    roi !== undefined && weeks.size >= 8
      ? Math.sqrt(
          (weeks.size / (weeks.size - 1)) *
            [...weeks.values()].reduce((s, g) => s + (g.profit - roi * g.stake) ** 2, 0),
        ) / closed.length
      : undefined;
  return {
    total: records.length,
    pending: records.filter((r) => r.status === 'pending').length,
    missing: records.filter((r) => r.status === 'missing').length,
    capacity: maximumPredictionRecords,
    groups: resultGroups,
    paper: {
      selections: selected.size,
      wins: closed.filter((r) => r.actual === 1).length,
      losses: closed.filter((r) => r.actual === -1).length,
      pushes: closed.filter((r) => r.actual === 0).length,
      stakedUnits: closed.length,
      netUnits: net,
      ...(roi === undefined ? {} : { roi }),
      weeks: weeks.size,
      ...(se === undefined || roi === undefined
        ? {}
        : { roiInterval: [roi - 1.96 * se, roi + 1.96 * se] as [number, number] }),
      ...(withClv.length
        ? {
            closingLineValue: {
              samples: withClv.length,
              average: withClv.reduce((s, r) => s + r.closing!.clv!, 0) / withClv.length,
              beatClose: withClv.filter((r) => r.closing!.clv! > 0).length,
            },
          }
        : {}),
      byWeek,
    },
    warnings: [
      'Local forward-recorded predictions and hypothetical one-unit paper selections; not actual wagers or realized money.',
      'Accuracy counts the earliest forecast per target/method. Missing player appearances are unknown, not zero; outcome coverage can be selective.',
      'Paper returns use only fetched verified prices and actionable saved choices, at most one selection per game/market. Fees, taxes, fill availability and price slippage are not modeled.',
      'Positive results in this sample do not establish future profitability. Weekly-cluster intervals need at least eight settled weeks.',
    ],
  };
}

/**
 * Records the latest pregame price for a bet record's book and side. Called repeatedly before
 * kickoff; the last call before the game starts becomes the closing price.
 */
export function recordClosingPrice(
  record: PredictionRecord,
  quotes: SportsbookQuote[],
  observedAt: string,
): PredictionRecord {
  const taken = record.quote;
  if (record.kind !== 'bet' || !taken || record.status !== 'pending') return record;
  const match = quotes.find(
    (q) => q.providerId === taken.providerId && q.kind === taken.kind && q.side === taken.side,
  );
  if (!match || Date.parse(observedAt) < Date.parse(taken.observedAt)) return record;
  const sameLine = match.line === taken.line;
  return {
    ...record,
    closing: {
      observedAt,
      americanOdds: match.americanOdds,
      oppositeAmericanOdds: match.oppositeAmericanOdds,
      ...(match.line !== undefined ? { line: match.line } : {}),
      ...(sameLine
        ? {
            clv: closingLineValue(taken.americanOdds, {
              odds: match.americanOdds,
              oppositeOdds: match.oppositeAmericanOdds,
            }),
          }
        : {}),
    },
  };
}
