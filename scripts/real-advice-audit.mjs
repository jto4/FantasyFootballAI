import { isAdviceResult } from '../packages/core/dist/index.js';

const slots = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
};
const inactive = (p) =>
  /^(out|inactive|ir|injured reserve|suspended|pup|nfi)$/i.test(p.status ?? '') ||
  p.weeklyGameStatus === 'bye';

/** Independent exhaustive oracle for the small, explicitly constructed evaluation
 * rosters. It does not use the app's optimizer or infer values for missing players. */
export function exhaustiveLineup(players, positions) {
  const starts = positions.filter((s) => s !== 'BN');
  if (starts.length > 9 || players.length > 20 || starts.some((s) => !slots[s]))
    throw new Error('Unsupported independent evaluation size or slot.');
  let best;
  function visit(index, used, points) {
    if (index === starts.length) {
      best = Math.max(best ?? -Infinity, points);
      return;
    }
    for (const p of players) {
      if (
        used.has(p.id) ||
        !Number.isFinite(p.projectedPoints) ||
        !slots[starts[index]].includes(p.position)
      )
        continue;
      used.add(p.id);
      visit(index + 1, used, points + p.projectedPoints);
      used.delete(p.id);
    }
  }
  visit(0, new Set(), 0);
  return best;
}

function pprPoints(stats) {
  const weights = {
    passing_yards: 0.04,
    passing_tds: 4,
    passing_interceptions: -2,
    rushing_yards: 0.1,
    rushing_tds: 6,
    receptions: 1,
    receiving_yards: 0.1,
    receiving_tds: 6,
    passing_2pt_conversions: 2,
    rushing_2pt_conversions: 2,
    receiving_2pt_conversions: 2,
    sack_fumbles_lost: -2,
    rushing_fumbles_lost: -2,
    receiving_fumbles_lost: -2,
  };
  if (Object.keys(weights).some((k) => !Number.isFinite(stats[k]))) return;
  return Object.entries(weights).reduce((sum, [k, w]) => sum + stats[k] * w, 0);
}

function publisherEstimate(player, context, snapshot) {
  const catalog = new Map(snapshot.catalog).get(player.id);
  const rows = snapshot.data.playerForecasts.filter(
    (r) =>
      r.position === player.position &&
      (catalog?.espnId
        ? r.espnId === catalog.espnId
        : r.name === player.name || (player.name === 'James Cook' && r.name === 'James Cook III')),
  );
  if (new Set(rows.map((r) => r.espnId)).size !== 1) return;
  const team = (t) => (t === 'LAR' ? 'LA' : t === 'WSH' ? 'WAS' : t);
  const schedule = snapshot.data.games.filter(
    (g) =>
      g.season === context.season &&
      g.seasonType === 'REG' &&
      [team(g.home), team(g.away)].includes(team(player.team)) &&
      g.week >= (player.projectionScope === 'season' ? 1 : context.week) &&
      g.week <=
        (player.projectionScope === 'week' ? context.week : (context.request.throughWeek ?? 18)),
  );
  let total = 0;
  for (const game of schedule) {
    if (Date.parse(game.kickoffAt) > Date.parse(context.asOf)) {
      const forecast = rows.filter((r) => r.week === game.week);
      if (forecast.length !== 1 || forecast[0].issuedWeek > game.week) return;
      const points = pprPoints(forecast[0].stats);
      if (points === undefined) return;
      total += points;
    } else if (player.projectionScope === 'season') {
      const actual = snapshot.data.players.filter(
        (r) =>
          r.gameId === game.id &&
          r.position === player.position &&
          (catalog?.gsisId ? r.playerId === catalog.gsisId : r.name === player.name),
      );
      if (actual.length !== 1) return;
      const points = pprPoints(actual[0].stats);
      if (points === undefined) return;
      total += points;
    }
  }
  return schedule.length ? total : undefined;
}

export function auditRealAdvice(record, context, snapshot) {
  const errors = [],
    checks = [];
  const result = record.result;
  if (!isAdviceResult(result)) return { passed: false, errors: ['invalid-saved-result'], checks };
  if (!record.passes.at(-1)?.answer) errors.push('invalid-reviewed-answer');
  const metrics = new Map(context.metrics.map((m) => [m.id, m]));
  const compare = (id, expected) => {
    const metric = metrics.get(id);
    if (!metric) return;
    checks.push(id);
    if (!Number.isFinite(expected) || Math.abs(metric.value - expected) > 1e-7)
      errors.push(`incorrect:${id}`);
  };
  for (const p of context.players) {
    if (p.projectionMethod !== 'public-projection-v1' || p.projectedPoints === undefined) continue;
    const expected = publisherEstimate(p, context, snapshot);
    checks.push(`publisher-ppr:${p.id}`);
    if (expected === undefined || Math.abs(expected - p.projectedPoints) > 1e-7)
      errors.push(`publisher-ppr:${p.id}`);
  }
  const weekly = ['lineup', 'waivers'].includes(record.request.mode);
  const players = context.players.filter((p) => !weekly || !inactive(p));
  const own = new Set(record.scenario.teams[0].roster.map((p) => p.id));
  const roster = players.filter((p) => own.has(p.id));
  const positions = record.scenario.settings.roster_positions;
  const before = exhaustiveLineup(roster, positions);
  if (record.request.mode === 'lineup' && !result.startSit) {
    compare('lineup-optimized', before);
    const starterIds = new Set(
      record.scenario.matchups
        .find((m) => m.week === context.week)
        ?.teams.find((t) => t.teamId === 'mine')?.starters ?? [],
    );
    const current = exhaustiveLineup(
      roster.filter((p) => starterIds.has(p.id)),
      positions,
    );
    compare('lineup-current', current);
    compare('lineup-gain', before - current);
  }
  if (record.request.mode === 'trade') {
    const give = new Set(record.request.giveIds),
      receive = new Set(record.request.receiveIds);
    const after = exhaustiveLineup(
      players.filter((p) => (own.has(p.id) && !give.has(p.id)) || receive.has(p.id)),
      positions,
    );
    compare('trade-before', before);
    compare('trade-after', after);
    compare('trade-gain', after - before);
    if (after < before && ['lean', 'recommend'].includes(record.passes.at(-1)?.answer?.verdict))
      errors.push('reviewed-losing-trade');
  }
  if (record.request.mode === 'waivers') {
    compare('waiver-before', before);
    for (const id of record.request.candidateIds ?? []) {
      const p = players.find((p) => p.id === id);
      if (!p || p.projectedPoints === undefined) continue;
      const after = exhaustiveLineup(
        [...roster.filter((p) => p.id !== record.request.dropPlayerId), p],
        positions,
      );
      compare(`${id}:waiver-after`, after);
      compare(`${id}:waiver-gain`, after - before);
    }
  }
  for (const id of result.assessment.recommendedPlayerIds) {
    const p = context.players.find((p) => p.id === id);
    if (weekly && (!p || inactive(p))) errors.push(`unavailable-pick:${id}`);
  }
  if (record.request.mode === 'betting') {
    const q = result.marketQuote;
    if (
      !q ||
      q.gameId !== record.request.bet.gameId ||
      q.americanOdds !== record.request.bet.americanOdds
    )
      errors.push('unmatched-real-price');
    if (q) {
      const implied = (odds) => (odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100));
      const selected = implied(q.americanOdds),
        opposite = implied(q.oppositeAmericanOdds);
      compare('odds-break-even', selected * 100);
      compare('odds-no-vig', (selected / (selected + opposite)) * 100);
      compare('bet-model-market-baseline', (selected / (selected + opposite)) * 100);
    }
    if (
      ['hold', 'insufficient'].includes(context.decisionPolicy.maximumVerdict) &&
      ['lean', 'recommend'].includes(record.passes.at(-1)?.answer?.verdict)
    )
      errors.push('reviewed-unsupported-bet');
  }
  return {
    passed: !errors.length,
    errors,
    checks,
    scope:
      'Evidence arithmetic, legal roster consequences and reviewed recommendation gates; not future football outcomes.',
  };
}
