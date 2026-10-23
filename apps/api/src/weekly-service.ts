import {
  buildFantasyAdvicePlan,
  buildPlayerEvidence,
  nflTeamKey,
  isUpcomingFootballGame,
  isInactiveFootballStatus,
  weeklyGameWithheldWarning,
  type AdviceResult,
  type LeagueConnection,
  type PlayerAdviceEvidence,
  capturePredictionRecords,
  liveMatchup,
  footballPosition,
  scoreHistoricalGame,
  type PlayerGameStats,
  rankWaivers,
  findTrades,
} from '@sidekick/core';
import type { LiveBoxScore } from '@sidekick/integrations';
import { adviceInjuryEvidence } from '@sidekick/integrations';
import { projectionSourceId } from './projections.js';

import type { AdviceDependencies, AdviceLoader } from './advice-service.js';
import { appendPredictionRecords } from './prediction-ledger.js';
import { projectionUsage } from './projection-usage.js';

export interface LineupAlerts {
  leagueId: string;
  teamId: string;
  leagueName: string;
  week: number;
  alerts: {
    playerId: string;
    name: string;
    reason: 'out' | 'doubtful' | 'bye';
    status?: string;
    kickoffAt?: string;
  }[];
  /** Earliest upcoming kickoff among this week's starters. */
  nextKickoffAt?: string;
  /** Present for imported leagues, which cannot refresh on their own. */
  snapshot?: { importedAt?: string; stale: boolean };
}
export interface WeeklyBriefing {
  leagueId: string;
  teamId: string;
  week: number;
  asOf: string;
  coverage: { known: number; total: number; alreadyPlayed: number };
  lineup: {
    complete: boolean;
    points?: number;
    comparedWeek?: number;
    changes: {
      slot: string;
      start: { id: string; name: string; points: number };
      bench?: { id: string; name: string; points?: number };
    }[];
  };
  availability: {
    id: string;
    name: string;
    status: string;
    basis: 'dated-report' | 'this-week-report' | 'roster';
    validUntil?: string;
  }[];
  waivers: { id: string; name: string; position: string; gain: number }[];
  notes: string[];
  matchup?: {
    week: number;
    you: MatchupSide;
    opponent: MatchupSide;
  };
}

export interface MatchupSide {
  teamId: string;
  name: string;
  /** Platform-recorded score; may be live during games. */
  points?: number;
  starters: { id: string; name: string; position: string; estimate?: number }[];
  /** Sum of starter estimates, only when every starter has one for this week. */
  projected?: number;
}

/**
 * Deterministic weekly features for one team: the Home briefing, starter alerts, Waiver day, trade
 * ideas and the live matchup. No AI calls; every number comes from loaded data and projections.
 */
export function createWeeklyService(
  deps: AdviceDependencies,
  shared: { now: () => number; load: AdviceLoader },
) {
  const { now, load } = shared;
  const usageFor = projectionUsage(deps);
  async function briefing(leagueId: string, teamId: string): Promise<WeeklyBriefing> {
    const leagueRow = deps.store.snapshot().leagues.find((row) => row.id === leagueId);
    if (!leagueRow?.teams.some((team) => team.id === teamId))
      throw new Error('That team is not in the connected league.');
    const probe = await load({ mode: 'lineup', leagueId });
    const asOf = new Date(now()).toISOString();
    const upcoming = probe.data.games
      .filter((game) => game.season === probe.season && isUpcomingFootballGame(game, asOf))
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const leagueWeek = probe.week;
    const week = upcoming && upcoming.week > leagueWeek ? upcoming.week : leagueWeek;
    const loaded = week === leagueWeek ? probe : await load({ mode: 'lineup', leagueId, week });
    const league = loaded.league!;
    const injury = await deps.injuries.get(loaded.season).catch(() => undefined);
    const injuryEvidence = new Map(
      loaded.players.map((player) => {
        const evidence = adviceInjuryEvidence(
          player,
          injury,
          loaded.season,
          week,
          asOf,
          loaded.data.games,
        );
        if (evidence.status) player.status = evidence.status;
        return [player.id, evidence] as const;
      }),
    );
    const evidence = buildPlayerEvidence({
      usage: await usageFor(loaded.season),
      league,
      players: loaded.players,
      projections: deps.store
        .snapshot()
        .playerProjections.filter((row) => row.leagueId === league.id)
        .map((row) => ({ ...row, sourceId: projectionSourceId(row) })),
      data: loaded.data,
      season: loaded.season,
      week,
      scope: 'week',
      asOf,
    });
    const byId = new Map(evidence.map((player) => [player.id, player]));
    const plan = (mode: 'lineup' | 'waivers') => {
      try {
        return buildFantasyAdvicePlan(
          league,
          { mode, teamId, week, season: loaded.season },
          evidence,
          asOf,
        );
      } catch {
        return undefined;
      }
    };
    const lineupPlan = plan('lineup');
    const waiverPlan = plan('waivers');
    const roster = league.teams.find((team) => team.id === teamId)?.roster ?? [];
    const recordedWeeks = (league.matchups ?? [])
      .filter(
        (m) => m.week <= week && m.teams.some((t) => t.teamId === teamId && t.starters?.length),
      )
      .map((m) => m.week);
    const startersWeek = recordedWeeks.length ? Math.max(...recordedWeeks) : undefined;
    const starters = new Set(
      (league.matchups ?? [])
        .filter((m) => m.week === startersWeek)
        .flatMap((m) =>
          m.teams.filter((t) => t.teamId === teamId).flatMap((t) => t.starters ?? []),
        ),
    );
    const name = (id: string) => byId.get(id)?.name ?? roster.find((p) => p.id === id)?.name ?? id;
    const optimal = lineupPlan?.lineup;
    const changes =
      optimal?.complete && starters.size
        ? (() => {
            const ins = optimal.assignments.filter((row) => !starters.has(row.playerId));
            const chosen = new Set(optimal.assignments.map((row) => row.playerId));
            const outs = [...starters]
              .filter((id) => !chosen.has(id))
              .map((id) => ({ id, points: byId.get(id)?.projectedPoints }));
            return ins.map((row, index) => ({
              slot: row.slot,
              start: { id: row.playerId, name: name(row.playerId), points: row.points },
              ...(outs[index]
                ? {
                    bench: {
                      id: outs[index]!.id,
                      name: name(outs[index]!.id),
                      ...(outs[index]!.points !== undefined ? { points: outs[index]!.points } : {}),
                    },
                  }
                : {}),
            }));
          })()
        : [];
    const considered = roster.filter((p) => !isInactiveFootballStatus(byId.get(p.id)?.status));
    const known = considered.filter((p) => byId.get(p.id)?.projectedPoints !== undefined).length;
    const played = considered.filter((p) =>
      byId.get(p.id)?.warnings.includes(weeklyGameWithheldWarning),
    ).length;
    const availability = roster
      .map((p) => ({
        player: p,
        evidence: injuryEvidence.get(p.id),
        status: byId.get(p.id)?.status,
      }))
      .filter(({ status }) => status && !/^(active|normal|healthy)$/i.test(status))
      .slice(0, 8)
      .map(({ player, evidence, status }) => ({
        id: player.id,
        name: player.name,
        // A this-week report without a designation supersedes the older roster flag.
        status:
          evidence?.coverage === 'week-window' && !evidence.status
            ? 'No game designation'
            : status!,
        basis:
          evidence?.coverage === 'current'
            ? ('dated-report' as const)
            : evidence?.coverage === 'week-window'
              ? ('this-week-report' as const)
              : ('roster' as const),
        ...(evidence?.validUntil ? { validUntil: evidence.validUntil } : {}),
      }));
    const waivers = (waiverPlan?.candidates ?? [])
      .filter((candidate) => (candidate.value ?? 0) > 0)
      .slice(0, 3)
      .map((candidate) => ({
        id: candidate.playerId,
        name: name(candidate.playerId),
        position: byId.get(candidate.playerId)?.position ?? '',
        gain: candidate.value!,
      }));
    await recordWeeklyProjections(league, loaded, evidence, roster, week, asOf).catch(
      () => undefined,
    );
    const notes: string[] = [];
    if (week !== leagueWeek)
      notes.push(
        `League data is from week ${leagueWeek}; the NFL is on week ${week}. Update the league to see this week’s roster moves.`,
      );
    if (startersWeek !== undefined && startersWeek !== week)
      notes.push(`Compared with your week ${startersWeek} starters.`);
    if (!known && considered.length)
      notes.push(
        league.connectionMode === 'snapshot'
          ? `No week ${week} point estimates yet. Import an updated ESPN page so Sidekick knows this week’s roster, or connect ESPN access for automatic refresh.`
          : `No week ${week} point estimates yet. Refresh the league or import projections to compare starters.`,
      );
    else if (!optimal?.complete)
      notes.push('Some starting spots have no estimate yet, so the lineup suggestion is partial.');
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
        // An estimate withheld because the game has begun means the player's points are already in
        // the team score.
        const started =
          week === leagueWeek && byId.get(id)?.warnings.includes(weeklyGameWithheldWarning);
        return {
          id,
          name: player?.name ?? 'Unknown player',
          position: player?.position ?? '',
          ...(estimate !== undefined ? { estimate } : {}),
          ...(started ? { started: true } : {}),
        };
      });
      // Platforms list starters in their own order; sort by position so both sides line up.
      const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST', 'D/ST'];
      const rank = (position: string) => {
        const index = order.indexOf(position.toUpperCase());
        return index < 0 ? order.length : index;
      };
      players.sort((a, b) => rank(a.position) - rank(b.position));
      const remaining = players.filter((p) => !p.started);
      const anyStarted = remaining.length < players.length;
      // Points so far plus estimates for starters yet to play; unknown if either part is missing.
      const projected =
        players.length &&
        remaining.every((p) => p.estimate !== undefined) &&
        (!anyStarted || entry.points !== undefined)
          ? (anyStarted ? entry.points! : 0) + remaining.reduce((sum, p) => sum + p.estimate!, 0)
          : undefined;
      return {
        teamId: entry.teamId,
        name: league.teams.find((t) => t.id === entry.teamId)?.name ?? entry.teamId,
        ...(entry.points !== undefined ? { points: entry.points } : {}),
        starters: players,
        ...(projected !== undefined ? { projected } : {}),
      };
    };
    const matchup =
      current && current.teams.length === 2
        ? {
            week: current.week,
            you: side(current.teams.find((t) => t.teamId === teamId)!),
            opponent: side(current.teams.find((t) => t.teamId !== teamId)!),
          }
        : undefined;
    return {
      leagueId,
      teamId,
      week,
      asOf,
      ...(matchup ? { matchup } : {}),
      coverage: { known, total: considered.length, alreadyPlayed: played },
      lineup: {
        complete: optimal?.complete === true,
        ...(optimal?.points !== undefined ? { points: optimal.points } : {}),
        changes,
        ...(startersWeek !== undefined ? { comparedWeek: startersWeek } : {}),
      },
      availability,
      waivers,
      notes,
    };
  }
  /** Preloads public stats and the player catalog so Advice opens without a cold download. */
  /**
   * Records this week's projection for every player on the selected roster so the accuracy
   * scorecard fills without saved advice. With imported projections, the app's own projection is
   * recorded alongside them for comparison. Ids are stable per league/week/source/player, so
   * repeated briefings add nothing, and only players whose game has not started are recorded.
   */
  async function recordWeeklyProjections(
    league: LeagueConnection,
    loaded: Awaited<ReturnType<typeof load>>,
    evidence: PlayerAdviceEvidence[],
    roster: { id: string }[],
    week: number,
    asOf: string,
  ) {
    const mine = new Set(roster.map((p) => p.id));
    const sets: { tag: string; players: PlayerAdviceEvidence[] }[] = [
      { tag: 'league', players: evidence.filter((p) => mine.has(p.id)) },
    ];
    // Only players whose league projection came from an import need a separate model record.
    const imported = new Set(
      evidence.filter((p) => mine.has(p.id) && p.projectionMethod === 'imported').map((p) => p.id),
    );
    if (imported.size)
      sets.push({
        tag: 'model',
        players: buildPlayerEvidence({
          usage: await usageFor(loaded.season),
          league,
          players: loaded.players.filter((p) => imported.has(p.id)),
          projections: [],
          data: loaded.data,
          season: loaded.season,
          week,
          scope: 'week',
          asOf,
        }),
      });
    const records = sets.flatMap(({ tag, players }) =>
      capturePredictionRecords(
        {
          id: `weekly-${league.id}-${loaded.season}-${week}-${tag}`.slice(0, 160),
          request: { mode: 'lineup', leagueId: league.id },
          season: loaded.season,
          week,
          players,
        } as unknown as AdviceResult,
        loaded.data,
        league,
        loaded.players,
        asOf,
      ),
    );
    const existing = new Set((deps.store.snapshot().predictionRecords ?? []).map((r) => r.id));
    const fresh = records.filter((r) => !existing.has(r.id));
    if (!fresh.length) return;
    await deps.store.update((state) => {
      appendPredictionRecords(state, fresh);
    });
  }
  /**
   * Game-day problems with this week's starters (Out/Doubtful/inactive or on bye) and whether an
   * imported league is out of date. Deterministic and AI-free; the desktop shell polls it to
   * decide on notifications.
   */
  async function alerts(leagueId: string, teamId: string): Promise<LineupAlerts> {
    const summary = await briefing(leagueId, teamId);
    const leagueRow = deps.store.snapshot().leagues.find((row) => row.id === leagueId)!;
    const loaded = await load({ mode: 'lineup', leagueId, week: summary.week });
    const starters = summary.matchup?.you.starters ?? [];
    const statusById = new Map(summary.availability.map((row) => [row.id, row.status]));
    const asOf = now();
    const weekGames = loaded.data.games.filter(
      (game) => game.season === loaded.season && game.week === summary.week,
    );
    const rows: LineupAlerts['alerts'] = [];
    const kickoffs: number[] = [];
    for (const starter of starters) {
      const player = loaded.players.find((row) => row.id === starter.id);
      const team = player?.nflTeam ? nflTeamKey(player.nflTeam) : undefined;
      const game = team
        ? weekGames.find((g) => nflTeamKey(g.home) === team || nflTeamKey(g.away) === team)
        : undefined;
      const kickoff = game?.kickoffAt ? Date.parse(game.kickoffAt) : undefined;
      if (kickoff !== undefined && kickoff > asOf) kickoffs.push(kickoff);
      const status = statusById.get(starter.id);
      // A team with no game this week is on bye; an unknown team is not guessed.
      const reason =
        team && weekGames.length && !game
          ? ('bye' as const)
          : isInactiveFootballStatus(status)
            ? ('out' as const)
            : /^doubtful$/i.test(status ?? '')
              ? ('doubtful' as const)
              : undefined;
      if (!reason) continue;
      if (kickoff !== undefined && kickoff <= asOf) continue;
      rows.push({
        playerId: starter.id,
        name: starter.name,
        reason,
        ...(status ? { status } : {}),
        ...(game?.kickoffAt ? { kickoffAt: game.kickoffAt } : {}),
      });
    }
    const staleAfterMs = (deps.store.settingsSnapshot().leagueStaleAfterHours ?? 24) * 3_600_000;
    const importedAt = leagueRow.snapshotImportedAt;
    return {
      leagueId,
      teamId,
      leagueName: leagueRow.displayName,
      week: summary.week,
      alerts: rows,
      ...(kickoffs.length ? { nextKickoffAt: new Date(Math.min(...kickoffs)).toISOString() } : {}),
      ...(leagueRow.connectionMode === 'snapshot'
        ? {
            snapshot: {
              ...(importedAt ? { importedAt } : {}),
              stale: !importedAt || asOf - Date.parse(importedAt) > staleAfterMs,
            },
          }
        : {}),
    };
  }
  /** Evidence for every player in the league pool, for this week or the rest of the season. */
  async function poolEvidence(leagueId: string, scope: 'week' | 'remaining-season') {
    const probe = await load({ mode: 'lineup', leagueId });
    const asOf = new Date(now()).toISOString();
    const upcoming = probe.data.games
      .filter((game) => game.season === probe.season && isUpcomingFootballGame(game, asOf))
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const week = upcoming && upcoming.week > probe.week ? upcoming.week : probe.week;
    const loaded = week === probe.week ? probe : await load({ mode: 'lineup', leagueId, week });
    const league = loaded.league!;
    const injury = await deps.injuries.get(loaded.season).catch(() => undefined);
    for (const player of loaded.players) {
      const evidence = adviceInjuryEvidence(
        player,
        injury,
        loaded.season,
        week,
        asOf,
        loaded.data.games,
      );
      if (evidence.status) player.status = evidence.status;
    }
    const evidence = buildPlayerEvidence({
      usage: await usageFor(loaded.season),
      league,
      players: loaded.players,
      projections: deps.store
        .snapshot()
        .playerProjections.filter((row) => row.leagueId === league.id)
        .map((row) => ({ ...row, sourceId: projectionSourceId(row) })),
      data: loaded.data,
      season: loaded.season,
      week,
      scope,
      ...(scope === 'remaining-season' ? { throughWeek: 18 } : {}),
      asOf,
    });
    return { league, week, season: loaded.season, evidence };
  }
  function requireTeam(leagueId: string, teamId: string) {
    const league = deps.store.snapshot().leagues.find((row) => row.id === leagueId);
    if (!league?.teams.some((team) => team.id === teamId))
      throw new Error('That team is not in the connected league.');
  }
  /** Deterministic waiver ranking for this week; no AI call. */
  async function waiverDay(leagueId: string, teamId: string) {
    requireTeam(leagueId, teamId);
    const { league, week, evidence } = await poolEvidence(leagueId, 'week');
    return { leagueId, teamId, week, ...rankWaivers(league, teamId, evidence) };
  }
  /** Deterministic one-for-one trade ideas over the rest of the season; no AI call. */
  async function tradeIdeas(leagueId: string, teamId: string) {
    requireTeam(leagueId, teamId);
    const { league, week, evidence } = await poolEvidence(leagueId, 'remaining-season');
    const ideas = findTrades(league, teamId, evidence);
    const estimated = evidence.filter((p) => p.projectedPoints !== undefined).length;
    return {
      leagueId,
      teamId,
      fromWeek: week,
      throughWeek: 18,
      ideas,
      warnings: !estimated
        ? ['No rest-of-season estimates are available yet, so trades cannot be compared.']
        : ideas.length
          ? []
          : [
              'No one-for-one trade improves both teams’ best lineups right now. Everyone’s holding their guys like family heirlooms.',
            ],
    };
  }
  /**
   * Your matchup during games: platform points, each starter's NFL game state from the public
   * scoreboard, a projected final and a rough win chance. Deterministic; no AI call.
   */
  async function live(leagueId: string, teamId: string) {
    const summary = await briefing(leagueId, teamId);
    const leagueRow = deps.store.snapshot().leagues.find((row) => row.id === leagueId)!;
    const base = {
      leagueId,
      teamId,
      leagueName: leagueRow.displayName,
      week: summary.week,
      imported: leagueRow.connectionMode === 'snapshot',
      ...(leagueRow.lastSyncedAt ? { updatedAt: leagueRow.lastSyncedAt } : {}),
      ...(leagueRow.snapshotImportedAt ? { importedAt: leagueRow.snapshotImportedAt } : {}),
    };
    if (!summary.matchup) return { ...base, matchup: undefined, gamesAvailable: false };
    const loaded = await load({ mode: 'lineup', leagueId, week: summary.week });
    const team = (id: string) => loaded.players.find((p) => p.id === id)?.nflTeam;
    const board = await deps.scoreboard?.current().catch(() => undefined);
    // Game states only apply when the scoreboard shows the same NFL week as the matchup.
    const sameWeek = board?.week === summary.week;
    // A score from an earlier week (old league data) must not read as this week's score.
    const currentScores = summary.matchup.week === summary.week;
    const boxes = new Map<string, LiveBoxScore | undefined>();
    if (sameWeek && deps.boxScores) {
      const started = board!.games.filter((g) => g.state !== 'pre');
      await Promise.all(
        started.map(async (g) =>
          boxes.set(g.espnId, await deps.boxScores!.get(g.espnId).catch(() => undefined)),
        ),
      );
    }
    const boxFor = (nflTeam?: string) => {
      const key = nflTeam ? nflTeamKey(nflTeam) : undefined;
      const game = key ? board?.games.find((g) => g.home === key || g.away === key) : undefined;
      return game && game.state !== 'pre' ? boxes.get(game.espnId) : undefined;
    };
    /** Box-score points under this league's rules, or undefined when they can't be computed. */
    const livePoints = (player: { id: string; position?: string; nflTeam?: string }) => {
      const box = boxFor(player.nflTeam);
      if (!box || !player.nflTeam) return undefined;
      const position = footballPosition(player.position);
      let line: Pick<
        PlayerGameStats,
        'stats' | 'madeFieldGoalDistances' | 'blockedFieldGoalDistances'
      >;
      if (position === 'DST') {
        const stats = box.defenses[nflTeamKey(player.nflTeam)];
        if (!stats) return undefined;
        line = { stats };
      } else {
        const espnId =
          leagueRow.platform === 'espn'
            ? player.id
            : loaded.players.find((p) => p.id === player.id)?.espnId;
        if (!espnId) return undefined;
        const found = box.players[espnId];
        // No box-score line once the game is under way means no stats recorded yet.
        if (!found) return 0;
        line = found;
      }
      const scored = scoreHistoricalGame(leagueRow, {
        playerId: player.id,
        name: '',
        position,
        team: nflTeamKey(player.nflTeam),
        opponent: '',
        gameId: box.espnId,
        season: loaded.season,
        week: summary.week,
        seasonType: 'REG',
        ...line,
      });
      return scored.points === undefined ? undefined : Math.round(scored.points * 100) / 100;
    };
    // Imported snapshots froze the platform score before kickoff, so box scores replace it.
    const sideInput = (side: MatchupSide) => ({
      teamId: side.teamId,
      name: side.name,
      ...(currentScores && side.points !== undefined && !base.imported
        ? { points: side.points }
        : {}),
      starters: side.starters.map((s) => {
        const nflTeam = team(s.id);
        const points = livePoints({ ...s, ...(nflTeam ? { nflTeam } : {}) });
        return {
          ...s,
          ...(nflTeam ? { nflTeam } : {}),
          ...(points !== undefined ? { livePoints: points } : {}),
        };
      }),
    });
    return {
      ...base,
      gamesAvailable: Boolean(sameWeek && board?.games.length),
      matchupWeek: summary.matchup.week,
      matchup: liveMatchup(
        { you: sideInput(summary.matchup.you), opponent: sideInput(summary.matchup.opponent) },
        sameWeek ? board!.games : [],
        sameWeek ? board!.byeTeams : [],
      ),
    };
  }
  return { briefing, alerts, waiverDay, tradeIdeas, live };
}
