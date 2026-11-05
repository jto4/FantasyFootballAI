import { slotPosition, starterSlots } from './advice-math.js';
import type { LeagueConnection, RosterPlayer } from './domain-types.js';

export type MoveKind = 'lineup' | 'add-drop' | 'trade';
/**
 * `proposed` waits for the owner. `submitting` holds the one claim on sending it. `waiting` is a
 * move the owner makes on the platform themself. `unconfirmed` means the platform may or may not
 * have applied it, so it must never be retried automatically.
 */
export type MoveStatus =
  | 'proposed'
  | 'submitting'
  | 'waiting'
  | 'confirmed'
  | 'unconfirmed'
  | 'failed'
  | 'cancelled'
  | 'expired';
export type MoveMethod = 'direct' | 'browser' | 'guided';

export interface MovePlayer {
  id: string;
  name: string;
}
export interface LineupMoveItem extends MovePlayer {
  from: string;
  to: string;
}
export interface MoveProposal {
  id: string;
  leagueId: string;
  teamId: string;
  platform: LeagueConnection['platform'];
  season?: number;
  week: number;
  kind: MoveKind;
  title: string;
  /** The exact change in plain words, also the checklist when the owner makes it themself. */
  steps: string[];
  lineup?: LineupMoveItem[];
  add?: MovePlayer;
  drop?: MovePlayer;
  trade?: { teamId: string; teamName: string; give: MovePlayer; receive: MovePlayer };
  /** Estimated points gained, when the advice that produced it has one. */
  gain?: number;
  /** Where the owner can make or check this move on the platform. */
  platformUrl: string;
  /** The roster this was planned against; a different roster cancels the approval. */
  rosterKey: string;
  /** Hash of the exact change: approval must name it, so a changed move cannot be approved. */
  fingerprint: string;
  createdAt: string;
  expiresAt: string;
  status: MoveStatus;
  method?: MoveMethod;
  message?: string;
  finishedAt?: string;
}

const label = (value: string | undefined) =>
  (value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s/_-]/g, '');
const benchSlot = /^(BN|BE|BENCH)$/;

function rosterOf(league: LeagueConnection, teamId: string): RosterPlayer[] {
  return league.teams.find((team) => team.id === teamId)?.roster ?? [];
}

/** Identifies who is on the roster and where, so an approval can tell if anything has moved. */
export function moveRosterKey(league: LeagueConnection, teamId: string) {
  return rosterOf(league, teamId)
    .map((player) => `${player.id}:${label(player.rosterPosition)}`)
    .sort()
    .join('|');
}

/**
 * Turns "start A over B" advice into every slot change it needs. Swaps can shift other starters
 * (a WR replacing a RB moves the flex), so this re-seats the lineup with as few moves as it can
 * and refuses when it cannot prove the result legal.
 */
export function planLineupMoves(
  league: LeagueConnection,
  teamId: string,
  changes: { start: { id: string }; bench?: { id: string } | undefined }[],
): { items: LineupMoveItem[] } | { problem: string } {
  const roster = rosterOf(league, teamId);
  const byId = new Map(roster.map((player) => [player.id, player]));
  const { slots, warnings } = starterSlots(league.settings.roster_positions);
  if (warnings.length || !slots.length)
    return { problem: 'This league’s starting spots aren’t fully known.' };
  const seats: { label: string; positions: string[]; playerId?: string }[] = slots.map((slot) => ({
    ...slot,
  }));
  const seated = new Map<string, string>();
  for (const player of roster) {
    const current = label(player.rosterPosition);
    if (!current)
      return { problem: `${player.name}’s lineup spot isn’t known. Refresh the league first.` };
    if (!slots.some((slot) => slot.label === current)) continue;
    const seat = seats.find((row) => row.label === current && !row.playerId);
    if (!seat) return { problem: 'Your saved lineup doesn’t fit this league’s starting spots.' };
    seat.playerId = player.id;
    seated.set(player.id, current);
  }
  const before = new Map(seated);
  const benched: RosterPlayer[] = [];
  for (const change of changes) {
    if (!change.bench) continue;
    const player = byId.get(change.bench.id);
    const seat = seats.find((row) => row.playerId === change.bench!.id);
    if (!player || !seat) return { problem: 'A starter in this change is no longer starting.' };
    delete seat.playerId;
    seated.delete(player.id);
    benched.push(player);
  }
  const fits = (seat: (typeof seats)[number], player: RosterPlayer) =>
    seat.positions.includes(slotPosition(player.position ?? ''));
  // Breadth-first, so the shortest chain of shifted starters wins. Each step moves one occupant.
  const seatPlayer = (player: RosterPlayer) => {
    const cameFrom = new Map<number, number | undefined>();
    const queue: { player: RosterPlayer; seat: number | undefined }[] = [
      { player, seat: undefined },
    ];
    for (const step of queue) {
      for (const [index, seat] of seats.entries()) {
        if (cameFrom.has(index) || !fits(seat, step.player)) continue;
        cameFrom.set(index, step.seat);
        const occupant = seat.playerId ? byId.get(seat.playerId) : undefined;
        if (occupant) {
          queue.push({ player: occupant, seat: index });
          continue;
        }
        // Walk back along the chain, each player moving into the seat ahead of them.
        let target: number | undefined = index;
        while (target !== undefined) {
          const previous: number | undefined = cameFrom.get(target);
          const mover = previous === undefined ? player : byId.get(seats[previous]!.playerId!)!;
          seats[target]!.playerId = mover.id;
          seated.set(mover.id, seats[target]!.label);
          target = previous;
        }
        return true;
      }
    }
    return false;
  };
  const incoming: RosterPlayer[] = [];
  for (const change of changes) {
    const player = byId.get(change.start.id);
    if (!player) return { problem: 'A player in this change is no longer on your roster.' };
    if (seated.has(player.id)) return { problem: `${player.name} is already starting.` };
    if (!benchSlot.test(label(player.rosterPosition)))
      return { problem: `Move ${player.name} off ${player.rosterPosition} first.` };
    if (!seatPlayer(player))
      return { problem: `There’s no legal starting spot for ${player.name}.` };
    incoming.push(player);
  }
  const items: LineupMoveItem[] = [];
  for (const player of [...incoming, ...roster]) {
    const to = seated.get(player.id);
    const from = before.get(player.id);
    if (to && to !== from && !items.some((item) => item.id === player.id))
      items.push({ id: player.id, name: player.name, from: player.rosterPosition!, to });
  }
  for (const player of benched)
    if (!seated.has(player.id))
      items.push({ id: player.id, name: player.name, from: player.rosterPosition!, to: 'BENCH' });
  return items.length ? { items } : { problem: 'Your lineup already matches this advice.' };
}

/** Whether the league data shows the move in place. A waiver or trade may take days to show. */
export function moveApplied(move: MoveProposal, league: LeagueConnection) {
  const mine = rosterOf(league, move.teamId);
  const has = (id: string) => mine.some((player) => player.id === id);
  if (move.kind === 'lineup')
    return (move.lineup ?? []).every((item) => {
      const now = label(mine.find((player) => player.id === item.id)?.rosterPosition);
      return benchSlot.test(label(item.to)) ? benchSlot.test(now) : now === label(item.to);
    });
  if (move.kind === 'add-drop')
    return (!move.add || has(move.add.id)) && (!move.drop || !has(move.drop.id));
  return Boolean(move.trade && has(move.trade.receive.id) && !has(move.trade.give.id));
}

/** The platform page for this team. These are ordinary web pages, never a write endpoint. */
export function platformMovePage(league: LeagueConnection, teamId: string, kind: MoveKind) {
  const league_ = encodeURIComponent(league.id);
  if (league.platform === 'espn') {
    const query = `leagueId=${league_}&teamId=${encodeURIComponent(teamId)}${league.season ? `&seasonId=${league.season}` : ''}`;
    return kind === 'add-drop'
      ? `https://fantasy.espn.com/football/players/add?leagueId=${league_}`
      : `https://fantasy.espn.com/football/team?${query}`;
  }
  if (league.platform === 'sleeper') return `https://sleeper.com/leagues/${league_}/team`;
  // Yahoo keys look like 449.l.12345 and 449.l.12345.t.3; the site uses the trailing numbers.
  const yahooLeague = /\.l\.(\d+)/.exec(league.id)?.[1];
  const yahooTeam = /\.t\.(\d+)$/.exec(teamId)?.[1] ?? (/^\d+$/.test(teamId) ? teamId : undefined);
  return yahooLeague
    ? `https://football.fantasysports.yahoo.com/f1/${yahooLeague}${yahooTeam ? `/${yahooTeam}` : ''}`
    : 'https://football.fantasysports.yahoo.com/';
}

const moveStatuses = new Set<string>([
  'proposed',
  'submitting',
  'waiting',
  'confirmed',
  'unconfirmed',
  'failed',
  'cancelled',
  'expired',
]);
export function isMoveProposal(value: unknown): value is MoveProposal {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<MoveProposal>;
  return (
    [row.id, row.leagueId, row.teamId, row.title, row.fingerprint, row.createdAt].every(
      (field) => typeof field === 'string' && field.length > 0 && field.length <= 400,
    ) &&
    typeof row.platformUrl === 'string' &&
    row.platformUrl.startsWith('https://') &&
    typeof row.week === 'number' &&
    ['lineup', 'add-drop', 'trade'].includes(row.kind as string) &&
    moveStatuses.has(row.status as string) &&
    Array.isArray(row.steps) &&
    row.steps.every((step) => typeof step === 'string')
  );
}
