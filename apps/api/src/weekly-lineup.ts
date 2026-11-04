import {
  fantasyOutcomeSpread,
  footballPosition,
  isInactiveFootballStatus,
  matchupVarianceScale,
  matchupWinProbability,
  pairLineupSwaps,
  projectionRange,
  weeklyGameWithheldWarning,
  type LeagueConnection,
  type LineupEstimate,
  type NewsItem,
  type PlayerAdviceEvidence,
} from '@sidekick/core';
import type { WeeklyBriefing } from './weekly-service.js';

type Evidence = Map<string, PlayerAdviceEvidence>;
type LineupChanges = WeeklyBriefing['lineup']['changes'];

/** Each swap from the recorded starters to the best lineup, paired by who can share a slot. */
export function lineupChanges(input: {
  league: LeagueConnection;
  optimal: LineupEstimate | undefined;
  starters: Set<string>;
  byId: Evidence;
  roster: { id: string; position?: string | undefined }[];
  name: (id: string) => string;
}): LineupChanges {
  const { league, optimal, starters, byId, roster, name } = input;
  if (!optimal?.complete || !starters.size) return [];
  const ins = optimal.assignments.filter((row) => !starters.has(row.playerId));
  const chosen = new Set(optimal.assignments.map((row) => row.playerId));
  const position = (id: string) =>
    byId.get(id)?.position ?? roster.find((p) => p.id === id)?.position ?? '';
  const pairs = pairLineupSwaps(
    ins.map((row) => ({ id: row.playerId, position: position(row.playerId) })),
    [...starters].filter((id) => !chosen.has(id)).map((id) => ({ id, position: position(id) })),
    league.settings.roster_positions,
  );
  return ins.map((row) => {
    const out = pairs.get(row.playerId);
    const outPoints = out ? byId.get(out)?.projectedPoints : undefined;
    return {
      slot: row.slot,
      start: { id: row.playerId, name: name(row.playerId), points: row.points },
      ...(out
        ? {
            bench: {
              id: out,
              name: name(out),
              ...(outPoints !== undefined ? { points: outPoints } : {}),
            },
          }
        : {}),
    };
  });
}

/** Both sides of this week's matchup with estimates, win chance and the swaps' effect on them. */
export function weeklyMatchup(input: {
  league: LeagueConnection;
  teamId: string;
  week: number;
  leagueWeek: number;
  byId: Evidence;
  optimal: LineupEstimate | undefined;
  changes: LineupChanges;
}): WeeklyBriefing['matchup'] {
  const { league, teamId, week, leagueWeek, byId, optimal, changes } = input;
  // The recorded matchup is the league's current week; estimates only apply to that same week.
  const allRostered = new Map(
    league.teams.flatMap((team) => (team.roster ?? []).map((player) => [player.id, player])),
  );
  const current = (league.matchups ?? []).find(
    (m) => m.week === leagueWeek && m.teams.some((t) => t.teamId === teamId),
  );
  const side = (entry: NonNullable<typeof current>['teams'][number]) => {
    const lineup = (entry.starters ?? []).filter(Boolean).slice(0, 30);
    const players = lineup.map((id) => {
      const player = byId.get(id) ?? allRostered.get(id);
      const estimate = week === leagueWeek ? byId.get(id)?.projectedPoints : undefined;
      const playChance = week === leagueWeek ? byId.get(id)?.playChance : undefined;
      // An estimate withheld because the game has begun means the player's points are already in
      // the team score.
      const started =
        week === leagueWeek && byId.get(id)?.warnings.includes(weeklyGameWithheldWarning);
      const position = player?.position ?? '';
      const range =
        estimate !== undefined
          ? projectionRange(position, estimate, fantasyOutcomeSpread)
          : undefined;
      // A starter listed Out (or inactive, on reserve) has no estimate; he scores zero, so he
      // counts as zero in the team total and win chance instead of hiding them.
      const out =
        week === leagueWeek &&
        !started &&
        estimate === undefined &&
        isInactiveFootballStatus(byId.get(id)?.status ?? player?.status);
      return {
        id,
        name: player?.name ?? 'Unknown player',
        position,
        ...(estimate !== undefined ? { estimate } : {}),
        ...(playChance !== undefined && estimate !== undefined ? { playChance } : {}),
        ...(range ? { range: { low: range.low, high: range.high } } : {}),
        ...(started ? { started: true } : {}),
        ...(out ? { out: true as const } : {}),
      };
    });
    // Platforms list starters in their own order; sort by position so both sides line up.
    const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST', 'D/ST'];
    const rank = (position: string) => {
      const index = order.indexOf(position.toUpperCase());
      return index < 0 ? order.length : index;
    };
    players.sort((a, b) => rank(a.position) - rank(b.position));
    const projected = projectedTeamTotal(players, entry.points);
    return {
      teamId: entry.teamId,
      name: league.teams.find((t) => t.id === entry.teamId)?.name ?? entry.teamId,
      ...(entry.points !== undefined ? { points: entry.points } : {}),
      starters: players,
      ...(projected !== undefined ? { projected } : {}),
    };
  };
  if (!current || current.teams.length !== 2) return undefined;
  if (!current || current.teams.length !== 2) return undefined;
  const you = side(current.teams.find((t) => t.teamId === teamId)!);
  const opponent = side(current.teams.find((t) => t.teamId !== teamId)!);
  // Pre-kickoff only: once games start, Live tracks the score as it changes.
  const pregame = [...you.starters, ...opponent.starters].every((p) => !p.started);
  const chance =
    pregame && you.starters.length && opponent.starters.length
      ? matchupWinProbability(
          [
            { settled: 0, remaining: you.starters.filter((p) => !p.out) },
            { settled: 0, remaining: opponent.starters.filter((p) => !p.out) },
          ],
          fantasyOutcomeSpread,
          matchupVarianceScale,
        )
      : undefined;
  // The same matchup with the suggested swaps made, so Home can show what they are worth.
  const fixedStarters =
    changes.length && optimal?.complete
      ? optimal.assignments.flatMap((row) => {
          const player = byId.get(row.playerId);
          return player?.projectedPoints === undefined
            ? []
            : [
                {
                  position: player.position,
                  estimate: player.projectedPoints,
                  ...(player.playChance !== undefined ? { playChance: player.playChance } : {}),
                },
              ];
        })
      : [];
  const fixedChance =
    pregame && chance !== undefined && fixedStarters.length === optimal?.assignments.length
      ? matchupWinProbability(
          [
            { settled: 0, remaining: fixedStarters },
            { settled: 0, remaining: opponent.starters.filter((p) => !p.out) },
          ],
          fantasyOutcomeSpread,
          matchupVarianceScale,
        )
      : undefined;
  const fixedTotal = projectedTeamTotal(fixedStarters, you.points);
  const ifFixed =
    fixedChance !== undefined && fixedTotal !== undefined
      ? { projected: fixedTotal, winProbability: fixedChance }
      : undefined;
  return {
    week: current.week,
    you,
    opponent,
    ...(chance !== undefined ? { winProbability: chance } : {}),
    ...(ifFixed ? { ifFixed } : {}),
  };
}

/** A Questionable chance to play, unless his status already says he is out (IR, Out). */
export function shownPlayChance(player: PlayerAdviceEvidence) {
  return player.playChance !== undefined && !isInactiveFootballStatus(player.status)
    ? player.playChance
    : undefined;
}

/** Recent headlines that name the player in full (title or summary), newest first. */
export function newsMentions(items: NewsItem[], name: string) {
  const full = name
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, '')
    .trim()
    .toLowerCase();
  if (full.split(' ').length < 2) return [];
  return items
    .filter((item) => `${item.title} ${item.summary ?? ''}`.toLowerCase().includes(full))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      source: item.source,
      url: item.url,
      publishedAt: item.publishedAt,
    }));
}

/**
 * The highest-projected bench player at the starter's position whose game has not begun and who
 * is not listed as unavailable. Flex eligibility is not considered.
 */
export function benchReplacement(
  starterId: string,
  starters: { id: string }[],
  byId: Map<string, PlayerAdviceEvidence>,
  roster: { id: string; name: string }[],
  unavailable: Set<string> = new Set(),
) {
  const position = footballPosition(byId.get(starterId)?.position ?? '');
  if (!position) return undefined;
  const starting = new Set(starters.map((s) => s.id));
  let best: { id: string; name: string; estimate: number } | undefined;
  for (const player of roster) {
    const evidence = byId.get(player.id);
    if (
      starting.has(player.id) ||
      unavailable.has(player.id) ||
      !evidence ||
      footballPosition(evidence.position ?? '') !== position ||
      evidence.projectedPoints === undefined ||
      isInactiveFootballStatus(evidence.status) ||
      /^doubtful$/i.test(evidence.status ?? '') ||
      evidence.warnings.includes(weeklyGameWithheldWarning)
    )
      continue;
    if (!best || evidence.projectedPoints > best.estimate)
      best = { id: player.id, name: player.name, estimate: evidence.projectedPoints };
  }
  return best;
}

/**
 * The lineup optimizer's swap for a starter. The briefing pairs players who can share a slot, but
 * a cross-position pairing may rely on another starter moving, so with several changes it is
 * trusted only at the same position; otherwise the caller falls back to the bench.
 */
export function plannedReplacement(
  changes: WeeklyBriefing['lineup']['changes'],
  starterId: string,
  byId: Map<string, PlayerAdviceEvidence>,
) {
  const position = (id: string) => footballPosition(byId.get(id)?.position ?? '');
  const planned = changes.find((change) => change.bench?.id === starterId);
  if (!planned) return undefined;
  if (changes.length > 1 && position(planned.start.id) !== position(starterId)) return undefined;
  return { id: planned.start.id, name: planned.start.name, estimate: planned.start.points };
}

/**
 * A starter whose game is under way, who has no box-score line and is listed as not playing
 * (Out, inactive, reserve or Doubtful). Without the listing, no line just means no stats yet.
 */
export function satOut(input: {
  position?: string | undefined;
  status?: string | undefined;
  inBoxScore: boolean;
}) {
  if (input.inBoxScore || footballPosition(input.position) === 'DST') return false;
  return isInactiveFootballStatus(input.status) || /^doubtful$/i.test(input.status?.trim() ?? '');
}

/**
 * Points so far plus estimates for starters yet to play (Questionable ones at their chance to
 * play). A starter listed Out counts as zero. Unknown when a remaining starter has no estimate,
 * or when games have begun and the score so far is missing.
 */
export function projectedTeamTotal(
  starters: { estimate?: number; playChance?: number; started?: boolean; out?: true }[],
  points: number | undefined,
) {
  const anyStarted = starters.some((p) => p.started);
  const remaining = starters.filter((p) => !p.started && !p.out);
  if (!starters.length || remaining.some((p) => p.estimate === undefined)) return undefined;
  if (anyStarted && points === undefined) return undefined;
  return (
    (anyStarted ? points! : 0) +
    remaining.reduce((sum, p) => sum + p.estimate! * (p.playChance ?? 1), 0)
  );
}
