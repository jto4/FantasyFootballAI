import {
  footballPosition,
  playerNameKey,
  scoreHistoricalGame,
  starterSlots,
} from './advice-math.js';
import type { FootballDataSnapshot, PlayerGameStats } from './advice-types.js';
import type { LeagueConnection, RosterPlayer } from './domain-types.js';
import type { UserPreferences } from './preferences.js';

/**
 * Dynasty and keeper values: what a player is worth over the next seasons, not only this one.
 *
 * A player's value is the points he is expected to score above a replacement starter at his
 * position: what is left of this season plus the next three, each later season discounted. The
 * multi-season projection, the outcome spread and the rookie and pick curves are fitted on
 * nflverse history by scripts/research/dynasty-backtest.mjs (held-out results in
 * docs/decisions.md). Blending a rookie's draft slot with his early games is a heuristic.
 */
export type LeagueFormat = 'redraft' | 'keeper' | 'dynasty';
export const leagueFormats: readonly LeagueFormat[] = ['redraft', 'keeper', 'dynasty'];
export type DynastyPosition = 'QB' | 'RB' | 'WR' | 'TE';
const positions: DynastyPosition[] = ['QB', 'RB', 'WR', 'TE'];
type Seasons = [number, number, number, number];

/** Ten outcome multipliers for one band of projections; `upTo` null is the top band. */
export interface OutcomeBand {
  upTo: number | null;
  multipliers: number[];
}
export interface DynastySettings {
  /** Per position and horizon (seasons ahead): log-linear model and how outcomes scatter. */
  age: Record<
    DynastyPosition,
    Record<'1' | '2' | '3', { beta: number[]; lift: number; outcomes: OutcomeBand[] }>
  >;
  /** First-three-season half-PPR points by NFL draft slot: intercept + slope·ln(slot). */
  rookies: Record<DynastyPosition, { intercept: number; slope: number }>;
  /** First-three-season points of the n-th rookie taken in a rookie draft, and their scatter. */
  slots: { intercept: number; slope: number; outcomes: number[] };
  undraftedSlot: number;
}

/** Age and draft facts for one NFL player (nflverse players file). */
export interface PlayerBio {
  gsisId: string;
  espnId?: string;
  name: string;
  position: string;
  birthDate?: string;
  /** First NFL season, or the draft year for a draftee who has not played yet. */
  rookieSeason?: number;
  draftPick?: number;
}
export interface PlayerBios {
  byGsis: Map<string, PlayerBio>;
  byEspn: Map<string, PlayerBio>;
}

/** Each later season counts this much less than the one before. */
export const dynastyDiscount = 0.85;
const regularSeasonWeeks = 18;
const halfPpr = {
  platform: 'sleeper' as const,
  scoring: {
    pass_yd: 0.04,
    pass_td: 4,
    pass_int: -2,
    rush_yd: 0.1,
    rush_td: 6,
    rec: 0.5,
    rec_yd: 0.1,
    rec_td: 6,
    fum_lost: -2,
    pass_2pt: 2,
    rush_2pt: 2,
    rec_2pt: 2,
  },
};
const round1 = (x: number) => Math.round(x * 10) / 10;

/** The league's format: the owner's choice in Personalize, else what the platform reports. */
export function leagueFormat(
  league: Pick<LeagueConnection, 'id' | 'settings'>,
  preferences?: UserPreferences,
): LeagueFormat {
  const chosen = preferences?.leagueFormats?.[league.id];
  if (chosen) return chosen;
  const detected = league.settings.leagueFormat;
  return detected === 'dynasty' || detected === 'keeper' ? detected : 'redraft';
}

export interface DynastyPlayerValue {
  id: string;
  name: string;
  position: DynastyPosition;
  nflTeam?: string;
  age?: number;
  rookieSeason?: number;
  draftPick?: number;
  /** Projected league points: rest of this season, then each of the next three seasons. */
  seasons: Seasons;
  /** Expected points above a replacement starter in each of those seasons. */
  aboveReplacement: Seasons;
  /** Discounted total of `aboveReplacement`; the number trades compare. */
  value: number;
  /** "production" from NFL games, "draft-slot" for rookies without games, or a blend. */
  basis: 'production' | 'draft-slot' | 'blend';
}

export interface DynastyContext {
  season: number;
  /** Regular-season games still to play for a typical team. */
  remainingGames: number;
  teams: number;
  /** Replacement-level league points per position, rest of season then next three seasons. */
  replacement: Record<DynastyPosition, Seasons>;
  values: Map<string, DynastyPlayerValue>;
  /** League points per half-PPR point, by position (scales the half-PPR rookie curves). */
  scale: Record<DynastyPosition, number>;
}

function ageOn(birthDate: string | undefined, season: number) {
  const birth = birthDate ? Date.parse(birthDate) : NaN;
  return Number.isFinite(birth)
    ? (Date.UTC(season, 8, 1) - birth) / (365.25 * 86_400_000)
    : undefined;
}

/** Expected points above `replacement` when outcomes scatter like the history did. */
export function expectedAbove(mean: number, bands: OutcomeBand[] | number[], replacement: number) {
  const multipliers =
    typeof bands[0] === 'number'
      ? (bands as number[])
      : ((bands as OutcomeBand[]).find((band) => band.upTo === null || mean <= band.upTo)
          ?.multipliers ?? [1]);
  return (
    multipliers.reduce((sum, m) => sum + Math.max(0, (mean + 10) * m - 10 - replacement), 0) /
    multipliers.length
  );
}

function horizonPoints(
  settings: DynastySettings,
  pos: DynastyPosition,
  ppg: number,
  games: number,
  age: number,
): [number, number, number] {
  const x = [1, Math.log(ppg + 1), games / 17, age - 27, (age - 27) ** 2];
  return (['1', '2', '3'] as const).map((h) => {
    const q = settings.age[pos][h];
    const v = x.reduce((sum, xi, i) => sum + xi * (q.beta[i] ?? 0), 0);
    return Math.max(0, Math.exp(v) * q.lift - 10);
  }) as [number, number, number];
}

/** Expected first-three-season half-PPR points for a rookie taken at an NFL draft slot. */
export function rookiePrior(
  settings: DynastySettings,
  pos: DynastyPosition,
  draftPick: number | undefined,
) {
  const q = settings.rookies[pos];
  return Math.max(0, q.intercept + q.slope * Math.log(draftPick ?? settings.undraftedSlot));
}

/** League starters per position; flex spots go to whichever eligible position is deeper. */
function replacementLevels(
  league: Pick<LeagueConnection, 'settings' | 'teamCount'>,
  rows: { position: DynastyPosition; seasons: Seasons }[],
) {
  const { slots } = starterSlots(league.settings.roster_positions);
  const fixed: Record<DynastyPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  const flex: DynastyPosition[][] = [];
  for (const slot of slots) {
    const eligible = slot.positions.filter((p): p is DynastyPosition =>
      positions.includes(p as DynastyPosition),
    );
    if (eligible.length === 1) fixed[eligible[0]!]++;
    else if (eligible.length > 1) flex.push(eligible);
  }
  const teams = Math.max(2, Math.min(32, league.teamCount || 10));
  const replacement = Object.fromEntries(positions.map((p) => [p, [0, 0, 0, 0]])) as Record<
    DynastyPosition,
    Seasons
  >;
  for (let h = 0; h < 4; h++) {
    const sorted = Object.fromEntries(
      positions.map((p) => [
        p,
        rows
          .filter((r) => r.position === p)
          .map((r) => r.seasons[h]!)
          .sort((a, b) => b - a),
      ]),
    ) as Record<DynastyPosition, number[]>;
    const taken = Object.fromEntries(positions.map((p) => [p, fixed[p] * teams])) as Record<
      DynastyPosition,
      number
    >;
    for (let t = 0; t < teams; t++)
      for (const eligible of flex) {
        const best = eligible.reduce((a, b) =>
          (sorted[a][taken[a]] ?? 0) >= (sorted[b][taken[b]] ?? 0) ? a : b,
        );
        taken[best]++;
      }
    for (const p of positions) replacement[p][h] = sorted[p][taken[p]] ?? 0;
  }
  return { teams, replacement };
}

interface SeasonLine {
  league: number;
  half: number;
  games: number;
}

/**
 * Values every QB, RB, WR and TE in `players` for one league. Stats come from the loaded seasons
 * (scored with the league's rules); `bios` supply age and NFL draft slot.
 */
export function buildDynastyContext(input: {
  league: LeagueConnection;
  players: RosterPlayer[];
  data: Pick<FootballDataSnapshot, 'players'>;
  bios: PlayerBios;
  settings: DynastySettings;
  season: number;
  /** Current NFL week, 1–18; later weeks mean the regular season is over. */
  week: number;
}): DynastyContext {
  const { league, settings, season } = input;
  const completedWeeks = Math.max(0, Math.min(regularSeasonWeeks, Math.floor(input.week) - 1));
  // Each team plays 17 games in 18 weeks.
  const gamesPerWeek = 17 / regularSeasonWeeks;
  const remainingGames = (regularSeasonWeeks - completedWeeks) * gamesPerWeek;
  const possibleNow = completedWeeks * gamesPerWeek;
  const rowsById = new Map<string, PlayerGameStats[]>();
  for (const row of input.data.players) {
    if (row.seasonType !== 'REG' || row.season < season - 1 || row.season > season) continue;
    const list = rowsById.get(row.playerId);
    if (list) list.push(row);
    else rowsById.set(row.playerId, [row]);
  }
  const byName = new Map<string, PlayerBio | null>();
  for (const bio of input.bios.byGsis.values()) {
    const key = `${playerNameKey(bio.name)}:${footballPosition(bio.position)}`;
    // Two players with one name and position cannot be told apart by name.
    byName.set(key, byName.has(key) ? null : bio);
  }
  const bioFor = (player: RosterPlayer): PlayerBio | undefined => {
    if (player.gsisId && input.bios.byGsis.has(player.gsisId))
      return input.bios.byGsis.get(player.gsisId);
    const espnId = player.espnId ?? (league.platform === 'espn' ? player.id : undefined);
    if (espnId && input.bios.byEspn.has(espnId)) return input.bios.byEspn.get(espnId);
    return (
      byName.get(`${playerNameKey(player.name)}:${footballPosition(player.position)}`) ?? undefined
    );
  };
  const line = (rows: PlayerGameStats[], year: number): SeasonLine => {
    const out = { league: 0, half: 0, games: 0 };
    for (const row of rows) {
      if (row.season !== year) continue;
      const scored = scoreHistoricalGame(league, row).points;
      const half = scoreHistoricalGame(halfPpr, row).points;
      if (scored === undefined || half === undefined) continue;
      out.league += scored;
      out.half += half;
      out.games++;
    }
    return out;
  };
  interface Work {
    base: Omit<DynastyPlayerValue, 'aboveReplacement' | 'value' | 'seasons' | 'basis'>;
    current: SeasonLine;
    last: SeasonLine;
    ratio?: number;
    young: boolean;
  }
  const work: Work[] = [];
  const ratios: Record<DynastyPosition, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  const seen = new Set<string>();
  for (const player of input.players.slice(0, 6_000)) {
    const position = footballPosition(player.position) as DynastyPosition;
    if (!positions.includes(position) || seen.has(player.id)) continue;
    seen.add(player.id);
    const bio = bioFor(player);
    const rows = (bio && rowsById.get(bio.gsisId)) ?? [];
    const current = line(rows, season);
    const last = line(rows, season - 1);
    const half = current.half + last.half;
    const ratio = half > 20 ? (current.league + last.league) / half : undefined;
    if (ratio !== undefined && Number.isFinite(ratio) && ratio > 0) ratios[position].push(ratio);
    const age = ageOn(bio?.birthDate, season);
    work.push({
      base: {
        id: player.id,
        name: player.name,
        position,
        ...(player.nflTeam ? { nflTeam: player.nflTeam } : {}),
        ...(age !== undefined ? { age: round1(age) } : {}),
        ...(bio?.rookieSeason ? { rookieSeason: bio.rookieSeason } : {}),
        ...(bio?.draftPick ? { draftPick: bio.draftPick } : {}),
      },
      current,
      last,
      ...(ratio !== undefined && Number.isFinite(ratio) && ratio > 0 ? { ratio } : {}),
      young: bio?.rookieSeason !== undefined && bio.rookieSeason >= season - 1,
    });
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)]! : 1;
  };
  const scale = Object.fromEntries(positions.map((p) => [p, median(ratios[p])])) as Record<
    DynastyPosition,
    number
  >;
  const projected = work.map((w) => {
    const pos = w.base.position;
    const ratio = w.ratio ?? scale[pos];
    // Recent form over this season and last; the model was fitted on single full seasons, so
    // availability is expressed as games per 17.
    const games = w.current.games + w.last.games;
    const possible = (w.last.games ? 17 : 0) + possibleNow;
    const ppg = games ? (w.current.half + w.last.half) / games : 0;
    const per17 = possible ? Math.min(17, (games / possible) * 17) : 0;
    const model =
      games >= 1 ? horizonPoints(settings, pos, ppg, per17, w.base.age ?? 26) : undefined;
    // Rookies and second-year players lean on draft slot until their games outweigh it. Older
    // players without games in two seasons have nothing to project and are worth nothing here.
    const prior = w.young ? rookiePrior(settings, pos, w.base.draftPick) / 3 : undefined;
    const weight = prior === undefined ? 1 : model ? games / (games + 8) : 0;
    const future = [0, 1, 2].map((i) => ({
      model: model ? ratio * model[i]! : 0,
      prior: prior === undefined ? 0 : ratio * prior,
    }));
    // Rest of this season: recent league points per game over the games he is likely to play.
    const leaguePpg = games ? (w.current.league + w.last.league) / games : 0;
    const restPpg = weight * leaguePpg + ((1 - weight) * ((prior ?? 0) * ratio)) / 17;
    const availability = possible ? Math.min(1, games / possible) : prior === undefined ? 0 : 0.8;
    const seasons: Seasons = [
      round1(restPpg * remainingGames * availability),
      ...future.map((f) => round1(weight * f.model + (1 - weight) * f.prior)),
    ] as Seasons;
    return { w, seasons, weight, future };
  });
  const { teams, replacement } = replacementLevels(
    league,
    projected.map((p) => ({ position: p.w.base.position, seasons: p.seasons })),
  );
  const values = new Map<string, DynastyPlayerValue>();
  for (const { w, seasons, weight, future } of projected) {
    const pos = w.base.position;
    const repl = replacement[pos];
    // Future seasons price the chance of beating replacement, not just the average: a backup
    // projected just under the line still has upside (calibration in docs/decisions.md).
    const above = [
      Math.max(0, seasons[0] - repl[0]),
      ...future.map((f, i) => {
        const h = String(i + 1) as '1' | '2' | '3';
        const r = repl[i + 1]!;
        return (
          weight * expectedAbove(f.model, settings.age[pos][h].outcomes, r) +
          (1 - weight) * expectedAbove(f.prior, settings.slots.outcomes, r)
        );
      }),
    ].map(round1) as Seasons;
    const value = above.reduce((sum, v, h) => sum + v * dynastyDiscount ** h, 0);
    values.set(w.base.id, {
      ...w.base,
      seasons,
      aboveReplacement: above,
      value: round1(value),
      basis: weight >= 0.999 ? 'production' : weight <= 0.001 ? 'draft-slot' : 'blend',
    });
  }
  return { season, remainingGames: round1(remainingGames), teams, replacement, values, scale };
}

export type PickTier = 'early' | 'mid' | 'late';
export interface RookiePick {
  /** The rookie draft's year (the class's first NFL season). */
  season: number;
  round: number;
  /** Known slot within the round (1-based), or else a rough part of the round. */
  slot?: number;
  tier?: PickTier;
}

/**
 * A rookie-draft pick in the same units as players: what the rookie taken at that slot
 * historically scored in his first three seasons, priced as a receiver (the most common pick)
 * above replacement, and discounted by how far away those seasons are.
 */
export function pickValue(context: DynastyContext, settings: DynastySettings, pick: RookiePick) {
  const teams = context.teams;
  const within =
    pick.slot ??
    (pick.tier === 'early'
      ? Math.ceil(teams * 0.2)
      : pick.tier === 'late'
        ? Math.ceil(teams * 0.85)
        : Math.ceil((teams + 1) / 2));
  const overall =
    (Math.max(1, Math.min(10, pick.round)) - 1) * teams + Math.min(teams, Math.max(1, within));
  const three = Math.max(0, settings.slots.intercept + settings.slots.slope * Math.log(overall));
  const perSeason = (three / 3) * context.scale.WR;
  // Next spring's draft plays seasons +1..+3; each later draft shifts one more season out.
  const first = Math.max(1, pick.season - context.season);
  let value = 0;
  for (let i = 0; i < 3; i++) {
    const h = first + i;
    const r = context.replacement.WR[Math.min(3, h)]!;
    value += expectedAbove(perSeason, settings.slots.outcomes, r) * dynastyDiscount ** h;
  }
  return { overall, value: round1(value) };
}

/** "1.04"-style label for an overall rookie-draft pick. */
export function pickLabel(overall: number, teams: number) {
  return `${Math.floor((overall - 1) / teams) + 1}.${String(((overall - 1) % teams) + 1).padStart(2, '0')}`;
}

export interface DynastyTradeSide {
  playerIds: string[];
  picks: RookiePick[];
}
/**
 * One team's view of a trade: values in and out, plus the cost of roster spots. Taking more
 * players than you send means releasing your least valuable players to make room.
 */
export function compareDynastyTrade(
  context: DynastyContext,
  settings: DynastySettings,
  input: {
    give: DynastyTradeSide;
    receive: DynastyTradeSide;
    roster: string[];
    rosterLimit?: number;
  },
) {
  const side = (s: DynastyTradeSide) => {
    const players = s.playerIds
      .map((id) => context.values.get(id))
      .filter((v): v is DynastyPlayerValue => Boolean(v));
    const picks = s.picks.map((pick) => ({ pick, ...pickValue(context, settings, pick) }));
    return {
      players,
      picks: picks.map((p) => ({
        ...p,
        label: `${p.pick.season} ${pickLabel(p.overall, context.teams)}`,
      })),
      value: round1(
        players.reduce((sum, p) => sum + p.value, 0) + picks.reduce((sum, p) => sum + p.value, 0),
      ),
      thisSeason: round1(players.reduce((sum, p) => sum + p.aboveReplacement[0], 0)),
    };
  };
  const give = side(input.give);
  const receive = side(input.receive);
  const after = input.roster.length - give.players.length + receive.players.length;
  const over =
    input.rosterLimit === undefined
      ? Math.max(0, receive.players.length - give.players.length)
      : Math.max(0, after - Math.max(input.roster.length, input.rosterLimit));
  const releasable = input.roster
    .filter((id) => !input.give.playerIds.includes(id))
    .map((id) => context.values.get(id))
    .filter((v): v is DynastyPlayerValue => Boolean(v))
    .sort((a, b) => a.value - b.value);
  const released = releasable.slice(0, Math.min(over, releasable.length));
  const releaseCost = round1(released.reduce((sum, p) => sum + p.value, 0));
  const net = round1(receive.value - give.value - releaseCost);
  const size = Math.max(1, give.value, receive.value);
  return {
    give,
    receive,
    released: released.map((p) => ({ id: p.id, name: p.name, value: p.value })),
    releaseCost,
    net,
    /** Change in this season's points above replacement (contenders care about this most). */
    thisSeasonNet: round1(receive.thisSeason - give.thisSeason),
    verdict: (Math.abs(net) / size < 0.08 ? 'even' : net > 0 ? 'gain' : 'loss') as
      'even' | 'gain' | 'loss',
  };
}

const isTaxi = (p: RosterPlayer) => /^TAXI$/i.test(p.rosterPosition ?? '');
const isReserve = (p: RosterPlayer) => /^(IR|RES|RESERVE)$/i.test(p.rosterPosition ?? '');

/** Taxi squad help: young players who could move to taxi, and taxi players worth starting. */
export function taxiAdvice(
  context: DynastyContext,
  input: { roster: RosterPlayer[]; slots: number; years?: number },
) {
  const onTaxi = input.roster.filter(isTaxi);
  const value = (p: RosterPlayer) => context.values.get(p.id);
  const fits = (v: DynastyPlayerValue) =>
    v.rookieSeason !== undefined && context.season - v.rookieSeason < (input.years ?? 1);
  const summary = (v: DynastyPlayerValue) => ({
    id: v.id,
    name: v.name,
    position: v.position,
    value: v.value,
    thisSeason: v.aboveReplacement[0],
  });
  const moveToTaxi = input.roster
    .filter((p) => !isTaxi(p) && !isReserve(p))
    .map(value)
    .filter((v): v is DynastyPlayerValue => Boolean(v && fits(v)))
    // Nothing to lose this season, something to keep for later.
    .filter((v) => v.aboveReplacement[0] === 0 && v.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.max(0, input.slots - onTaxi.length))
    .map(summary);
  const activate = onTaxi
    .map(value)
    .filter((v): v is DynastyPlayerValue => Boolean(v && v.aboveReplacement[0] > 0))
    .sort((a, b) => b.aboveReplacement[0] - a.aboveReplacement[0])
    .map(summary);
  return { slots: input.slots, used: onTaxi.length, moveToTaxi, activate };
}

/**
 * Keeper help: next season's value of each rostered player against what keeping him costs.
 * The cost assumed here is the round he was drafted in this year (a common rule; leagues vary),
 * priced as the player usually still available at that pick. Undrafted pickups show no cost.
 */
export function keeperAdvice(
  context: DynastyContext,
  input: { roster: RosterPlayer[]; keepers: number; draftRounds: Map<string, number> },
) {
  const next = (v: DynastyPlayerValue) => v.aboveReplacement[1];
  const board = [...context.values.values()].map(next).sort((a, b) => b - a);
  const costAt = (round: number) =>
    board[Math.max(0, (round - 1) * context.teams + Math.ceil(context.teams / 2) - 1)] ?? 0;
  const ranked = input.roster
    .map((p) => context.values.get(p.id))
    .filter((v): v is DynastyPlayerValue => Boolean(v))
    .map((v) => {
      const draftRound = input.draftRounds.get(v.id);
      const keep = round1(next(v));
      const cost = draftRound === undefined ? undefined : round1(costAt(draftRound));
      return {
        id: v.id,
        name: v.name,
        position: v.position,
        nextSeason: keep,
        ...(draftRound !== undefined ? { draftRound } : {}),
        ...(cost !== undefined ? { cost, surplus: round1(keep - cost) } : {}),
      };
    })
    .sort((a, b) => (b.surplus ?? b.nextSeason) - (a.surplus ?? a.nextSeason));
  const keepers = Math.max(0, Math.min(30, input.keepers));
  return {
    keepers,
    ranked,
    suggested: ranked
      .filter((r) => (r.surplus ?? r.nextSeason) > 0)
      .slice(0, keepers)
      .map((r) => r.id),
  };
}

/** Rookies in a class by value, who has them, and the rookie-draft pick each one is worth. */
export function rookieBoard(
  context: DynastyContext,
  settings: DynastySettings,
  input: { rookieSeason: number; rosteredBy: Map<string, string>; limit?: number },
) {
  const rookies = [...context.values.values()]
    .filter((v) => v.rookieSeason === input.rookieSeason)
    .sort((a, b) => b.value - a.value)
    .slice(0, input.limit ?? 48);
  const picks = Array.from(
    { length: context.teams * 4 },
    (_, i) =>
      pickValue(context, settings, {
        season: input.rookieSeason,
        round: Math.floor(i / context.teams) + 1,
        slot: (i % context.teams) + 1,
      }).value,
  );
  return rookies.map((v) => {
    const match = picks.findIndex((value) => value <= v.value);
    return {
      id: v.id,
      name: v.name,
      position: v.position,
      ...(v.nflTeam ? { nflTeam: v.nflTeam } : {}),
      ...(v.draftPick ? { nflDraftPick: v.draftPick } : {}),
      value: v.value,
      basis: v.basis,
      rosteredBy: input.rosteredBy.get(v.id),
      worthPick: match < 0 ? 'Round 5+' : pickLabel(match + 1, context.teams),
    };
  });
}
