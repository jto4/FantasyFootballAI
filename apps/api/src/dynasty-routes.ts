import { Router } from 'express';
import {
  buildDynastyContext,
  compareDynastyTrade,
  dynastySettings,
  isUpcomingFootballGame,
  keeperAdvice,
  leagueFormat,
  nflSeasonFor,
  pickLabel,
  pickValue,
  rookieBoard,
  taxiAdvice,
  type DynastyContext,
  type DynastyPlayerValue,
  type DynastyTradeSide,
  type FootballDataSnapshot,
  type LeagueConnection,
  type PlayerBios,
  type PickTier,
  type RookiePick,
  type RosterPlayer,
} from '@sidekick/core';
import type { PublicFootballData, PublicPlayerBios } from '@sidekick/integrations';
import { playerPool } from './advice-player-pool.js';
import type { LocalStore } from './store.js';

export interface DynastyDependencies {
  store: Pick<LocalStore, 'snapshot'> & Partial<Pick<LocalStore, 'settingsSnapshot'>>;
  data: Pick<PublicFootballData, 'get'>;
  bios: Pick<PublicPlayerBios, 'get'>;
  catalog: () => Promise<Map<string, RosterPlayer>>;
  now?: () => number;
}

const reserveSlot = /^(IR|TAXI|RES|RESERVE)$/i;

/** The NFL week in progress or next up; 19 once the regular season is over. */
function currentWeek(data: FootballDataSnapshot, at: string) {
  const upcoming = data.games.filter(
    (g) => g.season === data.season && g.seasonType === 'REG' && isUpcomingFootballGame(g, at),
  );
  return upcoming.length ? Math.min(...upcoming.map((g) => g.week)) : 19;
}

/**
 * Dynasty values for a connected league. Contexts are rebuilt when the league refreshes or the
 * public data changes, and otherwise reused for ten minutes (a build scores every player).
 */
export function createDynastyService(deps: DynastyDependencies) {
  const now = deps.now ?? Date.now;
  let cached:
    | {
        key: string;
        data: FootballDataSnapshot;
        bios: PlayerBios;
        at: number;
        context: DynastyContext;
      }
    | undefined;
  async function load(league: LeagueConnection) {
    const season = nflSeasonFor(now());
    const [data, bios, catalog] = await Promise.all([
      deps.data.get(season),
      deps.bios.get(season),
      deps.catalog().catch(() => new Map<string, RosterPlayer>()),
    ]);
    const week = currentWeek(data, new Date(now()).toISOString());
    const key = `${league.id}:${league.connectedAt}:${season}:${week}`;
    if (
      cached?.key === key &&
      cached.data === data &&
      cached.bios === bios &&
      now() - cached.at < 600_000
    )
      return { context: cached.context, data, bios, week };
    const context = buildDynastyContext({
      league,
      players: playerPool(league, data, catalog, false),
      data,
      bios,
      settings: dynastySettings,
      season,
      week,
    });
    cached = { key, data, bios, at: now(), context };
    return { context, data, bios, week };
  }

  function findLeague(leagueId: string, teamId: string) {
    const league = deps.store.snapshot().leagues.find((l) => l.id === leagueId);
    const team = league?.teams.find((t) => t.id === teamId);
    return league && team ? { league, team } : undefined;
  }

  async function overview(leagueId: string, teamId: string) {
    const found = findLeague(leagueId, teamId);
    if (!found) throw new Error('That team is not in the connected league.');
    const { league, team } = found;
    const preferences = deps.store.settingsSnapshot?.().preferences;
    const format = leagueFormat(league, preferences);
    const { context, bios } = await load(league);
    const warnings: string[] = [];
    const roster = team.roster ?? [];
    const valued = (players: RosterPlayer[]) =>
      players
        .map((p) => ({ player: p, value: context.values.get(p.id) }))
        .filter((r): r is { player: RosterPlayer; value: DynastyPlayerValue } => Boolean(r.value));
    const mine = valued(roster);
    const unvalued = roster.filter(
      (p) => ['QB', 'RB', 'WR', 'TE'].includes(p.position ?? '') && !context.values.has(p.id),
    );
    if (unvalued.length)
      warnings.push(
        `No value for ${unvalued
          .slice(0, 5)
          .map((p) => p.name)
          .join(', ')}${unvalued.length > 5 ? ' and others' : ''}: no matching NFL record.`,
      );
    if (!bios.byGsis.size) warnings.push('Player ages and draft slots are unavailable.');
    // Team strength now and later, for a contender / rebuilder read.
    const teams = league.teams.map((t) => {
      const rows = valued(t.roster ?? []);
      return {
        id: t.id,
        name: t.name,
        value: Math.round(rows.reduce((sum, r) => sum + r.value.value, 0)),
        thisSeason: Math.round(rows.reduce((sum, r) => sum + r.value.aboveReplacement[0], 0)),
        averageAge: averageAge(rows.map((r) => r.value)),
      };
    });
    const rank = (key: 'value' | 'thisSeason', id: string) =>
      [...teams].sort((a, b) => b[key] - a[key]).findIndex((t) => t.id === id) + 1;
    const myTeam = teams.find((t) => t.id === team.id)!;
    const nowRank = rank('thisSeason', team.id);
    const longRank = rank('value', team.id);
    const third = Math.ceil(teams.length / 3);
    const outlook =
      nowRank <= third
        ? 'contender'
        : longRank <= third && nowRank > third
          ? 'build for later'
          : nowRank > teams.length - third && longRank > teams.length - third
            ? 'rebuild'
            : 'middle';
    // Rookie class: next spring's once the NFL draft has added it to the player file.
    const classes = [...context.values.values()].map((v) => v.rookieSeason ?? 0);
    const rookieSeason = Math.min(context.season + 1, Math.max(context.season, ...classes));
    const rosteredBy = new Map<string, string>();
    for (const t of league.teams) for (const p of t.roster ?? []) rosteredBy.set(p.id, t.name);
    const board = rookieBoard(context, dynastySettings, { rookieSeason, rosteredBy });
    // A draft plan needs the class that will be drafted: next spring's once the NFL has picked
    // it, or this year's before any games. In season, this year's rookies are already rostered.
    const drafting = rookieSeason > context.season || context.remainingGames >= 17;
    const plan = drafting
      ? rookiePlan(context, league, team.id, board, needs(context, mine, league), rookieSeason)
      : undefined;
    const picks = [context.season + 1, context.season + 2].map((season) => ({
      season,
      rounds: [1, 2, 3, 4].map((round) => ({
        round,
        ...Object.fromEntries(
          (['early', 'mid', 'late'] as const).map((tier) => [
            tier,
            pickValue(context, dynastySettings, { season, round, tier }).value,
          ]),
        ),
      })),
    }));
    const taxiSlots = numberSetting(league.settings.taxiSlots);
    const maxKeepers = numberSetting(league.settings.maxKeepers);
    const draftRounds = new Map<string, number>();
    if (league.draft?.season === undefined || league.draft.season === league.season)
      for (const pick of league.draft?.picks ?? [])
        if (pick.round !== undefined) draftRounds.set(pick.playerId, pick.round);
    return {
      league: {
        id: league.id,
        name: league.displayName,
        format,
        detectedFormat: leagueFormat(league),
        teams: context.teams,
        season: context.season,
        remainingGames: context.remainingGames,
      },
      team: { ...myTeam, nowRank, longRank, outlook },
      teams: teams.sort((a, b) => b.value - a.value),
      roster: mine
        .map((r) => ({ ...r.value, rosterPosition: r.player.rosterPosition }))
        .sort((a, b) => b.value - a.value),
      replacement: context.replacement,
      rookies: {
        season: rookieSeason,
        board: board.slice(0, 30),
        ...(plan ? { plan } : { nextClass: context.season + 1 }),
      },
      picks,
      ...(taxiSlots
        ? {
            taxi: taxiAdvice(context, {
              roster,
              slots: taxiSlots,
              years: numberSetting(league.settings.taxiYears) ?? 1,
            }),
          }
        : {}),
      ...(format === 'keeper' || maxKeepers
        ? {
            keepers: keeperAdvice(context, {
              roster,
              keepers: maxKeepers ?? 3,
              draftRounds,
            }),
          }
        : {}),
      warnings,
    };
  }

  async function trade(input: {
    leagueId: string;
    teamId: string;
    partnerId?: string;
    give: DynastyTradeSide;
    receive: DynastyTradeSide;
    horizon?: 'season' | 'dynasty';
  }) {
    const found = findLeague(input.leagueId, input.teamId);
    if (!found) throw new Error('That team is not in the connected league.');
    const { league, team } = found;
    const partner = input.partnerId
      ? league.teams.find((t) => t.id === input.partnerId)
      : undefined;
    if (input.partnerId && !partner) throw new Error('That team is not in the connected league.');
    const { context } = await load(league);
    const limit = rosterLimit(league);
    const ids = (t: typeof team) =>
      (t.roster ?? []).filter((p) => !reserveSlot.test(p.rosterPosition ?? '')).map((p) => p.id);
    const mine = ids(team);
    if (input.give.playerIds.some((id) => !mine.includes(id)))
      throw new TypeError('You can only trade players on your roster.');
    if (partner && input.receive.playerIds.some((id) => !ids(partner).includes(id)))
      throw new TypeError('The other team can only trade players on its roster.');
    const yours = compareDynastyTrade(context, dynastySettings, {
      give: input.give,
      receive: input.receive,
      roster: mine,
      ...(limit ? { rosterLimit: limit } : {}),
      ...(input.horizon ? { horizon: input.horizon } : {}),
    });
    const theirs = partner
      ? compareDynastyTrade(context, dynastySettings, {
          give: input.receive,
          receive: input.give,
          roster: ids(partner),
          ...(limit ? { rosterLimit: limit } : {}),
          ...(input.horizon ? { horizon: input.horizon } : {}),
        })
      : undefined;
    return { yours, ...(theirs ? { theirs } : {}) };
  }

  /** One player's long-term value, for the player card. */
  async function playerValue(leagueId: string, playerId: string) {
    const league = deps.store.snapshot().leagues.find((l) => l.id === leagueId);
    if (!league) throw new Error('That team is not in the connected league.');
    const { context } = await load(league);
    const value = context.values.get(playerId);
    const ranked = value
      ? [...context.values.values()]
          .filter((v) => v.position === value.position)
          .sort((a, b) => b.value - a.value)
          .findIndex((v) => v.id === playerId) + 1
      : undefined;
    return {
      format: leagueFormat(league, deps.store.settingsSnapshot?.().preferences),
      ...(value
        ? {
            value: value.value,
            seasons: value.aboveReplacement,
            positionRank: ranked,
            ...(value.age !== undefined ? { age: value.age } : {}),
          }
        : {}),
    };
  }

  return { overview, trade, playerValue };
}

function numberSetting(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function averageAge(values: DynastyPlayerValue[]) {
  // Weighted by value, so a roster's best players set its age, not its deep bench.
  const aged = values.filter((v) => v.age !== undefined && v.value > 0);
  const total = aged.reduce((sum, v) => sum + v.value, 0);
  return total
    ? Math.round((aged.reduce((sum, v) => sum + v.age! * v.value, 0) / total) * 10) / 10
    : undefined;
}

/** Bench plus starters; reserve and taxi spots do not count against the limit. */
function rosterLimit(league: LeagueConnection) {
  const slots = league.settings.roster_positions;
  if (!Array.isArray(slots)) return undefined;
  const count = slots.filter((s) => typeof s === 'string' && !reserveSlot.test(s)).length;
  return count || undefined;
}

/** Positions where this team's next-season starters trail the league's average starters. */
function needs(
  context: DynastyContext,
  mine: { value: DynastyPlayerValue }[],
  league: LeagueConnection,
) {
  const out: string[] = [];
  const slots = Array.isArray(league.settings.roster_positions)
    ? (league.settings.roster_positions as unknown[])
    : [];
  const all = [...context.values.values()];
  for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
    const count = Math.max(1, slots.filter((s) => s === pos).length);
    const best = (rows: DynastyPlayerValue[], n: number) =>
      rows
        .filter((v) => v.position === pos)
        .map((v) => v.aboveReplacement[1])
        .sort((a, b) => b - a)
        .slice(0, n)
        .reduce((a, b) => a + b, 0);
    const average = best(all, count * context.teams) / context.teams;
    if (
      best(
        mine.map((m) => m.value),
        count,
      ) < average
    )
      out.push(pos);
  }
  return out;
}

/**
 * A rookie-draft plan for this team: its likely slot (reverse standings, before any traded
 * picks) and who should be there if the room drafts by value, preferring a position of need
 * when two rookies are close.
 */
function rookiePlan(
  context: DynastyContext,
  league: LeagueConnection,
  teamId: string,
  board: ReturnType<typeof rookieBoard>,
  need: string[],
  draftSeason: number,
) {
  const order = [...league.teams].sort(
    (a, b) => (a.wins ?? 0) - (b.wins ?? 0) || (a.pointsFor ?? 0) - (b.pointsFor ?? 0),
  );
  const slot = Math.max(1, order.findIndex((t) => t.id === teamId) + 1);
  const available = board.filter((r) => !r.rosteredBy);
  const rounds = [1, 2, 3, 4].map((round) => {
    const overall = (round - 1) * context.teams + slot;
    const pool = available.slice(Math.max(0, overall - 1), overall + 3);
    const best = pool[0];
    const fit = pool.find((r) => need.includes(r.position) && best && r.value >= best.value * 0.9);
    const pick: RookiePick = { season: draftSeason, round, slot };
    return {
      round,
      pick: pickLabel(overall, context.teams),
      pickValue: pickValue(context, dynastySettings, pick).value,
      target: fit ?? best,
      alternatives: pool.filter((r) => r !== (fit ?? best)).slice(0, 2),
    };
  });
  return { slot, need, rounds };
}

const pickTiers = new Set(['early', 'mid', 'late']);
function tradeSide(value: unknown): DynastyTradeSide | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const side = value as Record<string, unknown>;
  if (Object.keys(side).some((k) => k !== 'playerIds' && k !== 'picks')) return undefined;
  const playerIds = side.playerIds ?? [];
  const picks = side.picks ?? [];
  if (
    !Array.isArray(playerIds) ||
    playerIds.length > 10 ||
    !playerIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64) ||
    new Set(playerIds).size !== playerIds.length ||
    !Array.isArray(picks) ||
    picks.length > 10
  )
    return undefined;
  const parsed: RookiePick[] = [];
  for (const raw of picks) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const pick = raw as Record<string, unknown>;
    if (Object.keys(pick).some((k) => !['season', 'round', 'slot', 'tier'].includes(k)))
      return undefined;
    const int = (v: unknown, min: number, max: number) =>
      typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
    if (!int(pick.season, 2000, 2099) || !int(pick.round, 1, 10)) return undefined;
    if (pick.slot !== undefined && !int(pick.slot, 1, 32)) return undefined;
    if (pick.tier !== undefined && !pickTiers.has(String(pick.tier))) return undefined;
    parsed.push({
      season: pick.season as number,
      round: pick.round as number,
      ...(pick.slot !== undefined ? { slot: pick.slot as number } : {}),
      ...(pick.tier !== undefined ? { tier: pick.tier as PickTier } : {}),
    });
  }
  return { playerIds: playerIds as string[], picks: parsed };
}

export function createDynastyRouter(deps: DynastyDependencies) {
  const router = Router();
  const service = createDynastyService(deps);
  const failure = 'Dynasty values could not be calculated. Try again shortly.';
  router.get('/api/dynasty', async (req, res) => {
    const { league, team } = req.query;
    if (
      Object.keys(req.query).some((key) => key !== 'league' && key !== 'team') ||
      typeof league !== 'string' ||
      typeof team !== 'string' ||
      league.length > 256 ||
      team.length > 256
    )
      return res.status(400).json({ error: 'Choose a connected league and team.' });
    try {
      res.json(await service.overview(league, team));
    } catch (error) {
      const missing = error instanceof Error && /not in the connected league/.test(error.message);
      res
        .status(missing ? 404 : 502)
        .json({ error: missing ? 'That team is not in the connected league.' : failure });
    }
  });
  router.get('/api/dynasty/player', async (req, res) => {
    const { league, player } = req.query;
    if (
      Object.keys(req.query).some((key) => key !== 'league' && key !== 'player') ||
      typeof league !== 'string' ||
      typeof player !== 'string' ||
      league.length > 256 ||
      !player ||
      player.length > 64
    )
      return res.status(400).json({ error: 'Choose a connected league and player.' });
    try {
      res.json(await service.playerValue(league, player));
    } catch (error) {
      const missing = error instanceof Error && /not in the connected league/.test(error.message);
      res
        .status(missing ? 404 : 502)
        .json({ error: missing ? 'That league is not connected.' : failure });
    }
  });
  router.post('/api/dynasty/trade', async (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    const give = tradeSide(body?.give);
    const receive = tradeSide(body?.receive);
    if (
      !body ||
      typeof body !== 'object' ||
      Object.keys(body).some(
        (k) => !['league', 'team', 'partner', 'give', 'receive', 'horizon'].includes(k),
      ) ||
      (body.horizon !== undefined && body.horizon !== 'season' && body.horizon !== 'dynasty') ||
      typeof body.league !== 'string' ||
      typeof body.team !== 'string' ||
      (body.partner !== undefined && typeof body.partner !== 'string') ||
      !give ||
      !receive ||
      (!give.playerIds.length &&
        !give.picks.length &&
        !receive.playerIds.length &&
        !receive.picks.length)
    )
      return res.status(400).json({ error: 'Add players or picks to both sides of the trade.' });
    try {
      res.json(
        await service.trade({
          leagueId: body.league,
          teamId: body.team,
          ...(typeof body.partner === 'string' ? { partnerId: body.partner } : {}),
          ...(body.horizon === 'season' || body.horizon === 'dynasty'
            ? { horizon: body.horizon }
            : {}),
          give,
          receive,
        }),
      );
    } catch (error) {
      if (error instanceof TypeError) return res.status(400).json({ error: error.message });
      const missing = error instanceof Error && /not in the connected league/.test(error.message);
      res
        .status(missing ? 404 : 502)
        .json({ error: missing ? 'That team is not in the connected league.' : failure });
    }
  });
  return router;
}
