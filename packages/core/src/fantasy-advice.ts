import { matchupWinProbability, projectionRange } from './fantasy-projection.js';
import { fantasyOutcomeSpread, matchupVarianceScale } from './fantasy-projection-settings.js';
import type { LineupStrategy } from './preferences.js';
import type { LeagueConnection } from './domain-types.js';
import type {
  AdviceMetric,
  AdviceAssessment,
  FantasyAdvicePlan,
  FantasyAdviceRequest,
  LineupEstimate,
  PlayerAdviceEvidence,
} from './advice-types.js';
import {
  adviceConfidence,
  optimizeLineup,
  playerNameKey,
  keptStarterIds,
  starterSlots,
} from './advice-math.js';
import { replacementBaselines } from './draft-replacement.js';
import { isInactiveFootballStatus } from './player-availability.js';
import { weeklyGameWithheldWarning } from './advice-warnings.js';

export class StartSitSelectionError extends Error {
  constructor(reason: 'players' | 'slot') {
    super(
      reason === 'players'
        ? 'Choose 2–20 distinct players from your team for one starting spot.'
        : 'These players do not share a supported starting spot in this league.',
    );
  }
}

/** Compute roster consequences before AI judges context. Season and weekly units never mix. */
export function buildFantasyAdvicePlan(
  league: LeagueConnection,
  request: FantasyAdviceRequest,
  evidence: PlayerAdviceEvidence[],
  asOf: string,
  options: { strategy?: LineupStrategy } = {},
): FantasyAdvicePlan {
  const team = league.teams.find((item) => item.id === request.teamId);
  if (!team) throw new Error('Choose a team in this league.');
  if (new Set(evidence.map((player) => player.id)).size !== evidence.length)
    throw new Error('Player evidence contains duplicate identifiers.');
  const byId = new Map(evidence.map((player) => [player.id, player]));
  const scope =
    request.mode === 'trade'
      ? 'remaining-season'
      : request.mode === 'draft-plan' || request.mode === 'draft-review'
        ? 'season'
        : 'week';
  const tradeWeek =
    request.week ??
    (typeof league.settings.currentWeek === 'number' ? league.settings.currentWeek : undefined);
  const tradeSeason = request.season ?? league.season;
  const throughWeek = request.throughWeek ?? 18;
  if (
    request.mode === 'trade' &&
    (!Number.isInteger(throughWeek) ||
      throughWeek < 1 ||
      throughWeek > 18 ||
      (tradeWeek !== undefined && throughWeek < tradeWeek))
  )
    throw new Error('Choose a valid remaining trade interval.');
  const players = evidence.map((player) => {
    const aligned = { ...player };
    if (
      aligned.projectionScope !== scope ||
      (scope === 'week' && aligned.weeklyGameStatus === 'bye') ||
      (scope === 'remaining-season' &&
        (!aligned.projectionPeriod ||
          aligned.projectionPeriod.season !== tradeSeason ||
          aligned.projectionPeriod.fromWeek !== tradeWeek ||
          aligned.projectionPeriod.throughWeek !== throughWeek))
    )
      delete aligned.projectedPoints;
    return aligned;
  });
  const compatible = new Map(players.map((player) => [player.id, player]));
  const roster = (team.roster ?? []).flatMap((player) =>
    compatible.get(player.id) ? [compatible.get(player.id)!] : [],
  );
  const completeRoster = Boolean(
    team.roster?.length &&
    team.rosterSize === team.roster.length &&
    roster.length === team.roster.length,
  );
  const completeLeague =
    league.teams.length === league.teamCount &&
    league.teams.every((item) => item.roster && item.rosterSize === item.roster.length);
  const rosteredIds = new Set(
    league.teams.flatMap(
      (item) => item.rosterPlayerIds ?? item.roster?.map((player) => player.id) ?? [],
    ),
  );
  const rosteredNames = new Set(
    league.teams.flatMap((item) => item.roster?.map((player) => playerNameKey(player.name)) ?? []),
  );
  const picks = league.draft?.picks ?? [];
  const draftedIds = new Set(picks.map((pick) => pick.playerId));
  const draftedNames = new Set(
    picks.flatMap((pick) => (pick.playerName ? [playerNameKey(pick.playerName)] : [])),
  );
  const metrics: AdviceMetric[] = [],
    warnings: string[] = [];
  const plan: FantasyAdvicePlan = {
    mode: request.mode,
    teamId: team.id,
    candidates: [],
    players: [],
    metrics,
    confidence: adviceConfidence({
      coverage: 0,
      fresh: false,
      sampleSize: 0,
      independentSources: 0,
      decisionMargin: 0,
      uncertainty: 0,
    }),
    warnings,
  };
  const metric = (
    id: string,
    label: string,
    value: number,
    sourceIds: string[],
    description?: string,
  ) =>
    metrics.push({
      id,
      label,
      value,
      unit: 'points',
      sourceIds,
      ...(description ? { description } : {}),
    });
  const sourceIds = (rows: PlayerAdviceEvidence[]) => [
    ...new Set(rows.flatMap((player) => player.projectionSourceIds)),
  ];
  const requireIds = (ids: string[] | undefined, label: string) => {
    if (
      !ids?.length ||
      ids.length > 20 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !byId.has(id))
    )
      throw new Error(`Choose 1–20 distinct known players for ${label}.`);
    return ids;
  };
  let involved = roster,
    margin = 0,
    completePickLog = true;
  if (request.mode === 'lineup' && request.candidateIds !== undefined) {
    const ids = request.candidateIds;
    if (
      ids.length < 2 ||
      ids.length > 20 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !byId.has(id) || !team.roster?.some((player) => player.id === id))
    )
      throw new StartSitSelectionError('players');
    involved = ids.map((id) => compatible.get(id)!);
    const slots = starterSlots(league.settings.roster_positions);
    const eligibleSlots = [
      ...new Set(
        slots.slots
          .filter((slot) =>
            involved.every((player) =>
              slot.positions.includes(player.position === 'DEF' ? 'DST' : player.position),
            ),
          )
          .map((slot) => slot.label),
      ),
    ];
    if (!eligibleSlots.length) throw new StartSitSelectionError('slot');
    plan.startSit = { candidateIds: ids, eligibleSlots };
    plan.candidates = involved
      .filter(
        (player) =>
          player.projectedPoints !== undefined &&
          Number.isFinite(player.projectedPoints) &&
          !isInactiveFootballStatus(player.status),
      )
      .sort((a, b) => b.projectedPoints! - a.projectedPoints! || a.id.localeCompare(b.id))
      .map((player) => ({
        playerId: player.id,
        value: player.projectedPoints!,
        rationale:
          'Eligible for the shared starting spot. Compare estimates, availability and matchup evidence; this does not fill or validate other lineup slots.',
      }));
    const best = plan.candidates[0],
      next = plan.candidates[1];
    if (best && next) {
      margin = best.value! - next.value!;
      metric(
        'start-sit-gap',
        'Highest estimate minus next alternative',
        margin,
        sourceIds(involved),
        'A difference between supplied weekly estimates for one spot, not a full-lineup improvement or win probability.',
      );
    }
    warnings.push(
      'This compares one starting spot only. Keep the chosen player out of other starting slots and check the rest of your lineup separately.',
    );
    if (!completeRoster)
      warnings.push(
        'The saved team roster is incomplete; ownership is checked for the selected players only.',
      );
    warnings.push(...slots.warnings);
  } else if (request.mode === 'lineup') {
    const activeRoster = roster.filter((player) => !isInactiveFootballStatus(player.status));
    const kept = keptStarterIds(
      league,
      team.id,
      request.week ?? (league.settings.currentWeek as number | undefined),
      activeRoster,
    );
    const locked = kept.all;
    plan.lineup = strategyLineup(
      league,
      team.id,
      request.week ?? (league.settings.currentWeek as number | undefined),
      activeRoster,
      byId,
      locked,
      options.strategy,
    );
    if (options.strategy && options.strategy !== 'balanced')
      warnings.push(
        `Lineup strategy: ${strategyNames[options.strategy]}. Projections are unchanged; only close calls between players are decided differently.`,
      );
    for (const id of kept.started)
      warnings.push(
        `${byId.get(id)?.name ?? id}'s game has already started, so they are locked in the starting lineup. Only recommend changes for players whose games have not kicked off.`,
      );
    for (const id of kept.unknown)
      warnings.push(
        `${byId.get(id)?.name ?? id} has no projection this week, so they stay in the lineup rather than being benched for missing data.`,
      );
    if (!completeRoster)
      warnings.push(
        'The team roster snapshot is incomplete; a full-team recommendation cannot be verified.',
      );
    if (!completeRoster) {
      plan.lineup.complete = false;
      delete plan.lineup.points;
    }
    const starterIds =
      league.matchups
        ?.filter((matchup) => matchup.week === (request.week ?? league.settings.currentWeek))
        .flatMap((matchup) =>
          matchup.teams
            .filter((side) => side.teamId === team.id)
            .flatMap((side) => side.starters ?? []),
        ) ?? [];
    const current = activeRoster.filter((player) => starterIds.includes(player.id));
    if (plan.lineup.complete && plan.lineup.points !== undefined) {
      metric(
        'lineup-optimized',
        'Best supported starting-lineup estimate',
        plan.lineup.points,
        sourceIds(roster),
        'A legal assignment using supplied estimates. Not a win forecast.',
      );
      // Current lineup comparison requires a legal full assignment, not a bench/roster sum.
      const currentLineup = optimizeLineup(current, league.settings.roster_positions, locked);
      if (
        currentLineup.complete &&
        currentLineup.points !== undefined &&
        current.length === plan.lineup.assignments.length
      ) {
        margin = plan.lineup.points - currentLineup.points;
        metric(
          'lineup-current',
          'Current starters estimate',
          currentLineup.points,
          sourceIds(current),
        );
        metric('lineup-gain', 'Estimated change from current starters', margin, sourceIds(roster));
      } else
        warnings.push(
          'Current starter assignments are incomplete or do not match a legal lineup; no improvement total was inferred.',
        );
      const slots = starterSlots(league.settings.roster_positions).slots;
      plan.candidates = roster
        .filter(
          (player) =>
            player.projectedPoints !== undefined &&
            Number.isFinite(player.projectedPoints) &&
            !isInactiveFootballStatus(player.status) &&
            slots.some((slot) =>
              slot.positions.includes(player.position === 'DEF' ? 'DST' : player.position),
            ),
        )
        .map((player) => ({
          playerId: player.id,
          value: player.projectedPoints!,
          rationale:
            'Eligible roster option. Choose a complete legal lineup using estimates, availability and matchup evidence; the highest estimate is a comparison, not a mandatory choice.',
        }));
    }
  } else if (request.mode === 'trade') {
    const give = requireIds(request.giveIds, 'players you give'),
      receive = requireIds(request.receiveIds, 'players you receive');
    const other = league.teams.find((item) => item.id === request.tradeTeamId);
    if (!other || other.id === team.id) throw new Error('Choose the other team in the trade.');
    if (
      give.some((id) => !team.roster?.some((player) => player.id === id)) ||
      receive.some((id) => !other.roster?.some((player) => player.id === id)) ||
      give.some((id) => receive.includes(id))
    )
      throw new Error(
        'Trade players must belong to the selected teams. Refresh rosters if ownership changed.',
      );
    const received = receive.map((id) => compatible.get(id)!);
    const after = [...roster.filter((player) => !give.includes(player.id)), ...received];
    plan.lineup = optimizeLineup(roster, league.settings.roster_positions);
    plan.alternativeLineup = optimizeLineup(after, league.settings.roster_positions);
    involved = [...roster, ...received];
    warnings.push(
      `Trade value uses remaining estimates for weeks ${tradeWeek ?? '?'}–${throughWeek}, not already-earned points. Future injuries, bye coverage, keeper/dynasty assets, picks and roster-limit transactions require separate judgment.`,
    );
    if (plan.lineup.complete && plan.alternativeLineup.complete && completeRoster) {
      margin = plan.alternativeLineup.points! - plan.lineup.points!;
      metric(
        'trade-before',
        'Starting roster remaining estimate before trade',
        plan.lineup.points!,
        sourceIds(roster),
      );
      metric(
        'trade-after',
        'Starting roster remaining estimate after trade',
        plan.alternativeLineup.points!,
        sourceIds(after),
      );
      metric('trade-gain', 'Remaining starting-slot estimate change', margin, sourceIds(involved));
    } else
      warnings.push(
        'Complete scoring-matched remaining estimates for the same season/week interval and a complete roster are required to calculate the trade’s lineup impact.',
      );
    plan.candidates = received.map((player) => ({
      playerId: player.id,
      ...(player.projectedPoints !== undefined ? { value: player.projectedPoints } : {}),
      rationale: 'Incoming player; judge lineup impact, depth and availability together.',
    }));
  } else if (request.mode === 'waivers') {
    const drop = request.dropPlayerId
      ? roster.find((p) => p.id === request.dropPlayerId)
      : undefined;
    if (request.dropPlayerId && !drop)
      throw new Error('Choose an owned player to drop. Refresh rosters if ownership changed.');
    const active = (rows: PlayerAdviceEvidence[]) =>
      rows.filter((p) => !isInactiveFootballStatus(p.status));
    const available = players.filter(
      (player) => !rosteredIds.has(player.id) && !rosteredNames.has(playerNameKey(player.name)),
    );
    if (request.candidateIds) requireIds(request.candidateIds, 'waiver comparisons');
    const selected = request.candidateIds
      ? available.filter((player) => request.candidateIds!.includes(player.id))
      : highestByPosition(available, 25);
    if (!request.candidateIds)
      warnings.push(
        'Automatic waiver screening considers the top 25 supported estimates per position. A selected shortlist can compare other players.',
      );
    if (request.candidateIds?.some((id) => !selected.some((player) => player.id === id)))
      throw new Error('At least one selected waiver player is already rostered in this snapshot.');
    const waiverLocked = keptStarterIds(
      league,
      team.id,
      request.week ?? (league.settings.currentWeek as number | undefined),
      roster,
    ).all;
    plan.lineup = optimizeLineup(active(roster), league.settings.roster_positions, waiverLocked);
    const baseline = plan.lineup.complete && completeRoster ? plan.lineup.points : undefined;
    if (baseline !== undefined)
      metric('waiver-before', 'Current best starting-lineup estimate', baseline, sourceIds(roster));
    if (drop?.projectedPoints !== undefined)
      metric(
        'waiver-drop',
        `${drop.name}: estimate removed by the proposed drop`,
        drop.projectedPoints,
        sourceIds([drop]),
      );
    const afterValues = new Map<string, { points: number; sources: string[] }>();
    plan.candidates = selected
      .filter((player) => player.projectedPoints !== undefined && active([player]).length === 1)
      .map((player) => {
        const afterRoster = active([...roster.filter((p) => p.id !== drop?.id), player]);
        const after = optimizeLineup(afterRoster, league.settings.roster_positions, waiverLocked);
        const value =
          baseline !== undefined && after.complete ? after.points! - baseline : undefined;
        if (value !== undefined) {
          afterValues.set(player.id, { points: after.points!, sources: sourceIds(afterRoster) });
        }
        return {
          playerId: player.id,
          ...(value !== undefined ? { value } : {}),
          rationale:
            value !== undefined
              ? drop
                ? 'Estimated weekly starting-lineup change after removing the selected owned player and adding this candidate.'
                : 'Estimated weekly starting-lineup gain before choosing a player to drop.'
              : 'Incomplete roster/projections prevent a starting-lineup gain estimate.',
        };
      })
      .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
      .slice(0, 10);
    for (const candidate of plan.candidates) {
      const after = afterValues.get(candidate.playerId),
        player = compatible.get(candidate.playerId)!;
      if (!after || candidate.value === undefined) continue;
      metric(
        `${player.id}:waiver-after`,
        `${player.name}: starting-lineup estimate after move`,
        after.points,
        after.sources,
      );
      metric(
        `${player.id}:waiver-gain`,
        `${player.name}: starting-lineup estimate change`,
        candidate.value,
        sourceIds([...roster, player]),
        drop
          ? 'Includes the proposed drop and reassigns all supported starting slots. Platform locks and transaction rules still need confirmation.'
          : 'Add-only screening before any required drop; not a verified add/drop gain.',
      );
    }
    // A selected player without an estimate still needs evidence and a data-gap explanation.
    involved = [
      ...roster,
      ...(request.candidateIds
        ? selected
        : plan.candidates.map((item) => compatible.get(item.playerId)!)),
    ];
    margin = plan.candidates[0]?.value ?? 0;
    warnings.push(
      'Candidate availability comes from the synced roster snapshot. Confirm current waiver status, choose a legal drop, and review FAAB/priority before submitting.',
    );
    if (!completeLeague)
      warnings.push(
        'Other league rosters are incomplete; free-agent availability cannot be verified.',
      );
  } else if (request.mode === 'draft-plan') {
    if (request.candidateIds) requireIds(request.candidateIds, 'draft comparisons');
    const available = players.filter(
      (player) =>
        !draftedIds.has(player.id) &&
        !draftedNames.has(playerNameKey(player.name)) &&
        !rosteredIds.has(player.id) &&
        !rosteredNames.has(playerNameKey(player.name)),
    );
    const selected = request.candidateIds
      ? available.filter((player) => request.candidateIds!.includes(player.id))
      : available;
    if (request.candidateIds?.some((id) => !selected.some((player) => player.id === id)))
      throw new Error('At least one selected draft candidate is already picked or rostered.');
    const baselines = replacementBaselines(players, league);
    plan.candidates = selected
      .filter((player) => player.projectedPoints !== undefined)
      .map((player) => {
        const baseline = baselines.get(player.position === 'DEF' ? 'DST' : player.position);
        const value = baseline !== undefined ? player.projectedPoints! - baseline : undefined;
        return {
          playerId: player.id,
          ...(value !== undefined ? { value } : {}),
          rationale:
            baseline !== undefined
              ? 'Season value above positional replacement, alongside roster needs and imported ADP.'
              : 'Replacement pool is incomplete; season estimate alone is not a value grade.',
        };
      })
      .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
      .slice(0, 12);
    for (const candidate of plan.candidates) {
      const player = compatible.get(candidate.playerId)!;
      if (candidate.value !== undefined)
        metric(
          `${player.id}:replacement`,
          `${player.name}: season points above positional replacement`,
          candidate.value,
          sourceIds(
            players.filter(
              (row) =>
                (row.position === 'DEF' ? 'DST' : row.position) ===
                (player.position === 'DEF' ? 'DST' : player.position),
            ),
          ),
          'Replacement is the next projected player after jointly allocating all league starting slots, including overlapping FLEX/Superflex eligibility. Bench demand and future draft choices remain unmodelled.',
        );
    }
    involved = [
      ...roster,
      ...(request.candidateIds
        ? selected
        : plan.candidates.map((item) => compatible.get(item.playerId)!)),
    ];
    warnings.push(
      'Draft value requires scoring-matched season estimates. This is a redraft starting-demand approximation, not a keeper/dynasty grade or future pick prediction. Confirm the live draft board.',
    );
  } else {
    const mine = picks.filter((pick) => pick.teamId === team.id);
    const matched = mine.flatMap((pick) => {
      const exact = compatible.get(pick.playerId);
      const byName = players.filter(
        (player) =>
          pick.playerName && playerNameKey(player.name) === playerNameKey(pick.playerName),
      );
      const player = exact ?? (byName.length === 1 ? byName[0] : undefined);
      return player ? [{ pick, player }] : [];
    });
    const baselines = replacementBaselines(players, league);
    plan.candidates = matched.map(({ pick, player }) => {
      const baseline = baselines.get(player.position === 'DEF' ? 'DST' : player.position);
      const value =
        player.projectedPoints !== undefined && baseline !== undefined
          ? player.projectedPoints - baseline
          : undefined;
      if (value !== undefined)
        metric(
          `${player.id}:replacement`,
          `${player.name}: current season points above positional replacement`,
          value,
          sourceIds(
            players.filter(
              (row) =>
                (row.position === 'DEF' ? 'DST' : row.position) ===
                (player.position === 'DEF' ? 'DST' : player.position),
            ),
          ),
          'Current full-season estimate minus replacement after jointly allocating all league starting slots. This is not draft-time value, the actual roster starting gain or a retrospective draft grade.',
        );
      const adp = player.metrics.find((item) => item.id.endsWith(':adp'));
      if (adp && pick.pickNumber !== undefined && !pick.isKeeper)
        metrics.push({
          id: `${player.id}:draft-adp`,
          label: `${player.name}: pick versus imported ADP`,
          value: pick.pickNumber - adp.value,
          unit: 'picks',
          sourceIds: adp.sourceIds,
          description:
            'Positive means selected later than imported ADP. This describes draft timing, not actual player success.',
        });
      return {
        playerId: player.id,
        ...(value !== undefined ? { value } : {}),
        rationale:
          pick.pickNumber !== undefined
            ? `Logged overall pick ${pick.pickNumber}${pick.isKeeper ? ' (keeper; excluded from ADP timing comparisons)' : ''}.`
            : 'Logged pick without an overall pick number.',
      };
    });
    involved = [...roster, ...matched.map((item) => item.player)];
    completePickLog = mine.length > 0 && matched.length === mine.length;
    if (!mine.length)
      warnings.push(
        'No draft pick log for this team is available; current rosters cannot establish draft rounds or pick value.',
      );
    if (matched.length !== mine.length)
      warnings.push('Some logged picks have no unique player match.');
    warnings.push(
      'Draft process evidence is separate from actual outcomes. Incomplete season estimates or ADP coverage must not become invented draft grades.',
    );
  }
  plan.players = [...new Map(involved.map((player) => [player.id, player])).values()];
  const relevant = plan.players;
  const coverage = relevant.length
    ? relevant.filter(
        (player) =>
          player.projectedPoints !== undefined ||
          // A recorded inactive bench player needs no point estimate to verify a
          // complete replacement lineup. Unknown active-player estimates still count.
          (['lineup', 'waivers'].includes(request.mode) &&
            (plan.lineup?.complete || plan.startSit) &&
            (isInactiveFootballStatus(player.status) || player.weeklyGameStatus === 'bye') &&
            !plan.lineup?.assignments.some((assignment) => assignment.playerId === player.id)) ||
          // A player whose game has begun is settled for the week: locked if starting, unusable
          // if benched. No estimate is needed for either.
          (['lineup', 'waivers'].includes(request.mode) &&
            player.warnings.includes(weeklyGameWithheldWarning)),
      ).length / relevant.length
    : 0;
  const fresh = Boolean(
    league.lastSyncedAt &&
    Date.parse(asOf) - Date.parse(league.lastSyncedAt) >= 0 &&
    Date.parse(asOf) - Date.parse(league.lastSyncedAt) <= 48 * 60 * 60 * 1_000 &&
    relevant.every(
      (player) =>
        !player.warnings.some((warning) =>
          /old|invalid\/future|availability|ambiguous|freshness|stale|unavailable/i.test(warning),
        ),
    ),
  );
  const sampleSize = relevant.length
    ? Math.min(...relevant.map((player) => player.historicalPoints.length))
    : 0;
  const historicalUncertainty =
    (scope === 'season'
      ? 17
      : scope === 'remaining-season' && tradeWeek
        ? throughWeek + 1 - tradeWeek
        : 1) *
    Math.max(
      1,
      ...relevant.map(
        (player) => player.metrics.find((metric) => metric.id.endsWith(':points-sd'))?.value ?? 0,
      ),
    );
  const forecastUncertainty = Math.max(
    0,
    ...relevant.map((player) => {
      const lower = player.metrics.find((m) => m.id.endsWith(':forecast-lower'))?.value;
      const upper = player.metrics.find((m) => m.id.endsWith(':forecast-upper'))?.value;
      return lower !== undefined && upper !== undefined ? (upper - lower) / 2 : 0;
    }),
  );
  // Imported source sets are not evidence of independent publishers or calibrated skill.
  plan.confidence = adviceConfidence({
    coverage:
      (!completeRoster &&
        !plan.startSit &&
        ['lineup', 'trade', 'waivers'].includes(request.mode)) ||
      (request.mode === 'waivers' && !completeLeague) ||
      (request.mode === 'draft-plan' && !completeLeague) ||
      (request.mode === 'draft-review' && !completePickLog) ||
      (['draft-plan', 'draft-review'].includes(request.mode) &&
        (!plan.candidates.length ||
          plan.candidates.some((candidate) => candidate.value === undefined)))
        ? 0
        : coverage,
    fresh,
    sampleSize,
    independentSources: 0,
    decisionMargin: margin,
    uncertainty: Math.max(historicalUncertainty, forecastUncertainty),
  });
  if (
    relevant.some(
      (p) =>
        p.projectionMethod === 'rolling-form-v1' || p.projectionMethod === 'rolling-baseline-v1',
    )
  ) {
    plan.confidence.score = Math.min(plan.confidence.score, 69);
    plan.confidence.label = plan.confidence.score >= 60 ? 'Moderate' : 'Low';
    plan.confidence.meaning +=
      ' Automatic season estimates assume continued role and participation; prospective season accuracy is unverified.';
  }
  return plan;
}

/** Verify the actual model choice, never silently complete it with other roster players. */
export function evaluateLineupSelection(
  plan: FantasyAdvicePlan,
  selectedIds: string[],
  rawSlots: unknown,
): LineupEstimate {
  const parsed = starterSlots(rawSlots);
  const allowed = new Set(plan.candidates.map((candidate) => candidate.playerId));
  if (
    plan.mode !== 'lineup' ||
    !plan.lineup?.complete ||
    parsed.warnings.length ||
    selectedIds.length !== parsed.slots.length ||
    new Set(selectedIds).size !== selectedIds.length ||
    selectedIds.some((id) => !allowed.has(id))
  )
    throw new Error('Advice must select a complete legal lineup from eligible roster players.');
  const chosen = plan.players.filter((player) => selectedIds.includes(player.id));
  const lineup = optimizeLineup(chosen, rawSlots);
  if (!lineup.complete || lineup.assignments.length !== selectedIds.length)
    throw new Error('Advice must select a complete legal lineup from eligible roster players.');
  return lineup;
}

export function validateLineupAssessment(
  assessment: AdviceAssessment,
  plan: FantasyAdvicePlan,
  rawSlots: unknown,
): LineupEstimate {
  const lineup = evaluateLineupSelection(plan, assessment.recommendedPlayerIds, rawSlots);
  const best = new Set(plan.lineup!.assignments.map((row) => row.playerId));
  const chosen = new Set(assessment.recommendedPlayerIds);
  const changed = [...new Set([...best, ...chosen])].filter(
    (id) => best.has(id) !== chosen.has(id),
  );
  if (
    changed.some(
      (id) =>
        !assessment.reasons.some((reason) =>
          plan.players
            .find((player) => player.id === id)
            ?.metrics.some(
              (metric) =>
                /:(projected|baseline)$/.test(metric.id) &&
                reason.metricIds.includes(metric.id) &&
                reason.text.includes(`{{${metric.id}}}`),
            ),
        ),
    )
  )
    throw new Error('A different lineup requires visible estimates for the changed players.');
  return lineup;
}

export function validateStartSitAssessment(
  assessment: AdviceAssessment,
  plan: FantasyAdvicePlan,
): void {
  if (
    !plan.startSit ||
    assessment.recommendedPlayerIds.length !== 1 ||
    !plan.candidates.some((candidate) => candidate.playerId === assessment.recommendedPlayerIds[0])
  )
    throw new Error('Advice must select exactly one eligible player for the start/sit comparison.');
  // A headline plus an unrelated team total cannot substantiate this comparison.
  if (
    plan.candidates.some(
      (candidate) =>
        !assessment.reasons.some((reason) =>
          plan.players
            .find((player) => player.id === candidate.playerId)
            ?.metrics.some(
              (metric) =>
                /:(projected|baseline)$/.test(metric.id) &&
                reason.metricIds.includes(metric.id) &&
                reason.text.includes(`{{${metric.id}}}`),
            ),
        ),
    )
  )
    throw new Error(
      'A start/sit comparison requires visible estimates for every eligible alternative.',
    );
}

function highestByPosition(players: PlayerAdviceEvidence[], limit: number): PlayerAdviceEvidence[] {
  return ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF'].flatMap((position) =>
    players
      .filter((player) => player.position === position && player.projectedPoints !== undefined)
      .sort((a, b) => b.projectedPoints! - a.projectedPoints! || a.id.localeCompare(b.id))
      .slice(0, limit),
  );
}

const strategyNames: Record<LineupStrategy, string> = {
  balanced: 'balanced',
  safe: 'safe floor',
  upside: 'chase upside',
  'win-chance': 'maximize win chance',
};

/**
 * The lineup under the owner's strategy. Safe and upside score each player as projection ∓ half
 * an error standard deviation; win chance tries a range of those weights and keeps the lineup
 * with the best chance to outscore this week's opponent. Balanced is the plain projection.
 * Backtested on simulated 2025–2026 rosters, none changed the win rate by more than 0.2 points,
 * so this is a preference, not an edge.
 */
function strategyLineup(
  league: LeagueConnection,
  teamId: string,
  week: number | undefined,
  roster: PlayerAdviceEvidence[],
  byId: Map<string, PlayerAdviceEvidence>,
  locked: ReadonlySet<string>,
  strategy: LineupStrategy = 'balanced',
) {
  const slots = league.settings.roster_positions;
  const sd = (player: PlayerAdviceEvidence) =>
    projectionRange(player.position, player.projectedPoints ?? 0, fantasyOutcomeSpread)?.sd ?? 0;
  const weighted = (k: number) =>
    optimizeLineup(
      roster,
      slots,
      locked,
      (player) => (player.projectedPoints ?? 0) + k * sd(player),
    );
  if (strategy === 'safe') return weighted(-0.5);
  if (strategy === 'upside') return weighted(0.5);
  if (strategy !== 'win-chance') return optimizeLineup(roster, slots, locked);
  const matchup = (league.matchups ?? []).find(
    (m) => m.week === week && m.teams.some((t) => t.teamId === teamId),
  );
  const opponent = matchup?.teams.find((t) => t.teamId !== teamId)?.starters ?? [];
  const opponentStarters = opponent.map((id) => byId.get(id));
  if (!opponent.length || opponentStarters.some((p) => p?.projectedPoints === undefined))
    return optimizeLineup(roster, slots, locked);
  const opponentSide = {
    settled: 0,
    remaining: opponentStarters.map((p) => ({
      position: p!.position,
      estimate: p!.projectedPoints!,
    })),
  };
  let best: { lineup: ReturnType<typeof optimizeLineup>; chance: number } | undefined;
  for (const k of [-1, -0.5, -0.25, 0, 0.25, 0.5, 1]) {
    const lineup = weighted(k);
    if (!lineup.complete) continue;
    const chance = matchupWinProbability(
      [
        {
          settled: 0,
          remaining: lineup.assignments.map((a) => ({
            position: byId.get(a.playerId)?.position ?? '',
            estimate: a.points,
          })),
        },
        opponentSide,
      ],
      fantasyOutcomeSpread,
      matchupVarianceScale,
    );
    if (chance !== undefined && (!best || chance > best.chance + 1e-9)) best = { lineup, chance };
  }
  return best?.lineup ?? optimizeLineup(roster, slots, locked);
}
