import type { LineupEstimate, PlayerAdviceEvidence } from './advice-types.js';
import type { LeagueConnection } from './domain-types.js';
import { optimizeLineup, playerNameKey } from './advice-math.js';
import { isInactiveFootballStatus } from './player-availability.js';

export interface WaiverDay {
  baseline?: number;
  /** Lowest-scoring starting spots in the current best lineup: where an add helps most. */
  weakSpots: { slot: string; playerId: string; name: string; points: number }[];
  candidates: {
    playerId: string;
    name: string;
    position: string;
    team?: string;
    projected: number;
    /** Best-lineup gain from adding without dropping (roster space permitting). */
    gain?: number;
    /** The owned player whose removal costs least alongside this add, and the net gain. */
    drop?: { playerId: string; name: string; netGain: number };
  }[];
  warnings: string[];
}

export interface TradeIdea {
  teamId: string;
  teamName: string;
  give: { playerId: string; name: string; position: string };
  receive: { playerId: string; name: string; position: string };
  /** Best-lineup change over the projection period for each side. */
  myGain: number;
  theirGain: number;
}

const active = (rows: PlayerAdviceEvidence[]) =>
  rows.filter((p) => !isInactiveFootballStatus(p.status) && p.weeklyGameStatus !== 'bye');

function rosters(league: LeagueConnection, evidence: PlayerAdviceEvidence[]) {
  const byId = new Map(evidence.map((p) => [p.id, p]));
  const of = (teamId: string) =>
    (league.teams.find((t) => t.id === teamId)?.roster ?? []).flatMap((p) =>
      byId.get(p.id) ? [byId.get(p.id)!] : [],
    );
  const rosteredIds = new Set(
    league.teams.flatMap((t) => t.rosterPlayerIds ?? t.roster?.map((p) => p.id) ?? []),
  );
  const rosteredNames = new Set(
    league.teams.flatMap((t) => t.roster?.map((p) => playerNameKey(p.name)) ?? []),
  );
  return { of, rosteredIds, rosteredNames };
}

type Scored = { points: number; missing: string; assignments: LineupEstimate['assignments'] };
/**
 * Best lineup over the players with estimates. Missing estimates never count as zero: a lineup
 * with unfilled slots is only comparable to another with exactly the same unfilled slots.
 */
const points = (league: LeagueConnection, roster: PlayerAdviceEvidence[]): Scored | undefined => {
  const lineup = optimizeLineup(active(roster), league.settings.roster_positions);
  if (!lineup.assignments.length) return;
  return {
    points: lineup.assignments.reduce((sum, row) => sum + row.points, 0),
    missing: [...lineup.missingSlots].sort().join('|'),
    assignments: lineup.assignments,
  };
};
const gain = (before: Scored | undefined, after: Scored | undefined) =>
  before && after && before.missing === after.missing ? after.points - before.points : undefined;

/**
 * Ranks free agents by how much they raise this week's best legal lineup, with the cheapest drop.
 * Deterministic: every number comes from supplied projections and the lineup optimizer.
 */
export function rankWaivers(
  league: LeagueConnection,
  teamId: string,
  evidence: PlayerAdviceEvidence[],
  limit = 15,
): WaiverDay {
  const { of, rosteredIds, rosteredNames } = rosters(league, evidence);
  const mine = of(teamId);
  const warnings: string[] = [];
  const current = points(league, mine);
  if (current?.missing)
    warnings.push(
      `No estimate yet for your ${current.missing.split('|').join(', ')} spot. Gains compare the rest of the lineup only.`,
    );
  if (!evidence.some((p) => p.projectedPoints !== undefined))
    warnings.push(
      'No player estimates are available for this week yet. Check back closer to games; even the projections need coffee.',
    );
  const name = (id: string) => mine.find((p) => p.id === id)?.name ?? id;
  const weakSpots = (current?.assignments ?? [])
    .map((row) => ({ ...row, name: name(row.playerId) }))
    .sort((a, b) => a.points - b.points)
    .slice(0, 3);
  // A bounded pool per position keeps the ranking fast; deep reserves rarely change a lineup.
  const byPosition = new Map<string, PlayerAdviceEvidence[]>();
  for (const player of evidence)
    if (
      player.projectedPoints !== undefined &&
      !rosteredIds.has(player.id) &&
      !rosteredNames.has(playerNameKey(player.name)) &&
      active([player]).length === 1
    )
      byPosition.set(player.position, [...(byPosition.get(player.position) ?? []), player]);
  const pool = [...byPosition.values()].flatMap((rows) =>
    rows.sort((a, b) => b.projectedPoints! - a.projectedPoints!).slice(0, 20),
  );
  const candidates = pool.map((player) => {
    const added = gain(current, points(league, [...mine, player]));
    let drop: WaiverDay['candidates'][number]['drop'];
    let dropPoints: number | undefined;
    for (const owned of mine) {
      const netGain = gain(
        current,
        points(league, [...mine.filter((p) => p.id !== owned.id), player]),
      );
      // On equal gains, drop the owned player with the lower estimate.
      if (
        netGain !== undefined &&
        (!drop ||
          netGain > drop.netGain ||
          (netGain === drop.netGain &&
            (owned.projectedPoints ?? -Infinity) < (dropPoints ?? -Infinity)))
      ) {
        drop = { playerId: owned.id, name: owned.name, netGain };
        dropPoints = owned.projectedPoints;
      }
    }
    return {
      playerId: player.id,
      name: player.name,
      position: player.position,
      ...(player.team ? { team: player.team } : {}),
      projected: player.projectedPoints!,
      ...(added !== undefined ? { gain: added } : {}),
      ...(drop ? { drop } : {}),
    };
  });
  candidates.sort(
    (a, b) =>
      (b.drop?.netGain ?? -Infinity) - (a.drop?.netGain ?? -Infinity) || b.projected - a.projected,
  );
  return {
    ...(current ? { baseline: current.points } : {}),
    weakSpots,
    candidates: candidates.slice(0, limit),
    warnings,
  };
}

/**
 * One-for-one trades that raise both teams' best lineups over the projection period, ranked by
 * the smaller side's gain so lopsided offers sort last. Both rosters must be fully estimated.
 */
export function findTrades(
  league: LeagueConnection,
  teamId: string,
  evidence: PlayerAdviceEvidence[],
  limit = 10,
): TradeIdea[] {
  const { of } = rosters(league, evidence);
  const mine = of(teamId);
  const myNow = points(league, mine);
  if (!myNow) return [];
  const ideas: TradeIdea[] = [];
  for (const team of league.teams) {
    if (team.id === teamId) continue;
    const theirs = of(team.id);
    const theirNow = points(league, theirs);
    if (!theirNow) continue;
    for (const give of mine) {
      if (give.projectedPoints === undefined) continue;
      for (const receive of theirs) {
        if (receive.projectedPoints === undefined || receive.position === give.position) continue;
        const myGain = gain(
          myNow,
          points(league, [...mine.filter((p) => p.id !== give.id), receive]),
        );
        const theirGain = gain(
          theirNow,
          points(league, [...theirs.filter((p) => p.id !== receive.id), give]),
        );
        if (myGain === undefined || theirGain === undefined || myGain <= 0 || theirGain <= 0)
          continue;
        ideas.push({
          teamId: team.id,
          teamName: team.name,
          give: { playerId: give.id, name: give.name, position: give.position },
          receive: { playerId: receive.id, name: receive.name, position: receive.position },
          myGain,
          theirGain,
        });
      }
    }
  }
  return ideas
    .sort((a, b) => Math.min(b.myGain, b.theirGain) - Math.min(a.myGain, a.theirGain))
    .slice(0, limit);
}
