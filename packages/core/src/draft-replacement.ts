import type { LeagueConnection } from './domain-types.js';
import type { PlayerAdviceEvidence } from './advice-types.js';
import { starterSlots } from './advice-math.js';

type Edge = { to: number; reverse: number; capacity: number; cost: number };

/** Allocate all league starting slots jointly. Greedy overlapping FLEX choices
 * can consume a player needed elsewhere and make replacement depend on slot order. */
export function replacementBaselines(
  players: PlayerAdviceEvidence[],
  league: LeagueConnection,
): Map<string, number> {
  const parsed = starterSlots(league.settings.roster_positions);
  if (
    parsed.warnings.length ||
    !Number.isInteger(league.teamCount) ||
    league.teamCount < 2 ||
    league.teamCount > 32 ||
    players.length > 2_000 ||
    new Set(players.map((p) => p.id)).size !== players.length
  )
    return new Map();
  const positions = [...new Set(parsed.slots.flatMap((s) => s.positions))].sort();
  const pools = new Map(positions.map((position) => [position, [] as number[]]));
  for (const player of players) {
    const position = player.position === 'DEF' ? 'DST' : player.position;
    if (
      player.projectionScope === 'season' &&
      player.projectedPoints !== undefined &&
      Number.isFinite(player.projectedPoints)
    )
      pools.get(position)?.push(player.projectedPoints);
  }
  // Missing positional supply is unknown, even if other positions could fill FLEX.
  if (positions.some((position) => !pools.get(position)!.length)) return new Map();
  const demand = new Map<string, number>();
  for (const slot of parsed.slots) {
    const key = [...slot.positions].sort().join(',');
    demand.set(key, (demand.get(key) ?? 0) + league.teamCount);
  }
  const groups = [...demand].sort(([a], [b]) => a.localeCompare(b));
  const required = parsed.slots.length * league.teamCount;
  for (const [position, values] of pools)
    pools.set(position, values.sort((a, b) => b - a).slice(0, required + 1));
  const sink = positions.length + groups.length + 1;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  const add = (from: number, to: number, capacity: number, cost: number) => {
    graph[from]!.push({ to, reverse: graph[to]!.length, capacity, cost });
    graph[to]!.push({ to: from, reverse: graph[from]!.length - 1, capacity: 0, cost: -cost });
  };
  positions.forEach((position, i) => {
    for (const points of pools.get(position)!) add(0, i + 1, 1, -points);
    groups.forEach(([eligible, count], j) => {
      if (eligible.split(',').includes(position)) add(i + 1, positions.length + j + 1, count, 0);
    });
  });
  groups.forEach(([, count], i) => add(positions.length + i + 1, sink, count, 0));
  // Successive shortest residual paths can reassign previous choices; the graph
  // has at most 21 nodes and 384 requested slots under the supported league limits.
  for (let flow = 0; flow < required; flow++) {
    const distance = Array<number>(graph.length).fill(Infinity);
    const previous: ({ from: number; edge: number } | undefined)[] = Array(graph.length);
    distance[0] = 0;
    for (let pass = 0; pass < graph.length - 1; pass++) {
      let changed = false;
      for (let from = 0; from < graph.length; from++) {
        if (!Number.isFinite(distance[from])) continue;
        graph[from]!.forEach((edge, index) => {
          const candidate = distance[from]! + edge.cost;
          if (edge.capacity && candidate < distance[edge.to]! - 1e-9) {
            distance[edge.to] = candidate;
            previous[edge.to] = { from, edge: index };
            changed = true;
          }
        });
      }
      if (!changed) break;
    }
    if (!previous[sink]) return new Map();
    for (let node = sink; node !== 0;) {
      const step = previous[node]!;
      const edge = graph[step.from]![step.edge]!;
      edge.capacity--;
      graph[node]![edge.reverse]!.capacity++;
      node = step.from;
    }
  }
  return new Map(
    positions.flatMap((position, i) => {
      const used = graph[0]!.filter((e) => e.to === i + 1 && e.capacity === 0).length;
      const replacement = pools.get(position)![used];
      return replacement === undefined ? [] : [[position, replacement] as const];
    }),
  );
}
