import {
  nflTeamKey,
  playerNameKey,
  type FootballGame,
  type PregameGameContext,
  type PregameTeamContext,
} from '@sidekick/core';
import type { NFLInjuryReportRow } from './injuries.js';
import { csvRecords } from './football-csv.js';
export interface QuarterbackObservation {
  team: string;
  name: string;
  observedAt: string;
  gsisId?: string;
}
export function parseQuarterbackObservations(csv: string): QuarterbackObservation[] {
  return csvRecords(csv, ['dt', 'team', 'player_name', 'gsis_id', 'pos_abb', 'pos_rank']).flatMap(
    (r) => {
      if (r.pos_abb !== 'QB' || r.pos_rank !== '1') return [];
      if (
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(r.dt!) ||
        !Number.isFinite(Date.parse(r.dt!)) ||
        new Date(r.dt!).toISOString().slice(0, 19) + 'Z' !== r.dt ||
        !/^[A-Z]{2,3}$/.test(r.team!) ||
        !r.player_name ||
        r.player_name.length > 120 ||
        !/^\d{2}-\d{7}$/.test(r.gsis_id!)
      )
        return [];
      return [
        { team: nflTeamKey(r.team!), name: r.player_name, observedAt: r.dt!, gsisId: r.gsis_id! },
      ];
    },
  );
}
const offense = new Set(['RB', 'FB', 'WR', 'TE', 'C', 'G', 'T', 'OG', 'OT', 'OL']);
const defense = new Set(['DE', 'DT', 'NT', 'LB', 'ILB', 'OLB', 'CB', 'DB', 'S', 'SS', 'FS']);
/** Report time must precede the actual prediction cutoff. Undated weekly depth charts and target archive starters are never inputs. */
export function buildPregameAvailability(
  game: FootballGame,
  games: FootballGame[],
  reports: NFLInjuryReportRow[],
  quarterbacks: QuarterbackObservation[],
  asOf: string,
): PregameGameContext {
  const clock = Date.parse(asOf),
    kickoff = Date.parse(game.kickoffAt ?? '');
  const side = (home: boolean): PregameTeamContext => {
    const team = nflTeamKey(home ? game.home : game.away);
    const prior = games
      .filter(
        (g) =>
          g.seasonType === 'REG' &&
          g.date < game.date &&
          g.date < asOf.slice(0, 10) &&
          (g.season < game.season || (g.season === game.season && g.week < game.week)) &&
          Number.isInteger(g.homeScore) &&
          Number.isInteger(g.awayScore) &&
          [g.home, g.away].some((t) => nflTeamKey(t) === team),
      )
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const previousId = prior
      ? nflTeamKey(prior.home) === team
        ? prior.homeQuarterbackId
        : prior.awayQuarterbackId
      : undefined;
    const previousName = prior
      ? nflTeamKey(prior.home) === team
        ? prior.homeQuarterbackName
        : prior.awayQuarterbackName
      : undefined;
    const rows = reports.filter(
      (r) =>
        r.season === game.season &&
        r.week === game.week &&
        r.seasonType === 'REG' &&
        nflTeamKey(r.team) === team &&
        r.updatedAt &&
        Date.parse(r.updatedAt) <= clock &&
        Date.parse(r.updatedAt) >= kickoff - 7 * 86400000,
    );
    const groups = new Map<string, NFLInjuryReportRow[]>();
    for (const r of rows) {
      const key = r.gsisId ?? playerNameKey(r.fullName);
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const unique = [...groups.values()].flatMap((group) => {
      const date = group.reduce((a, b) =>
        Date.parse(a.updatedAt!) > Date.parse(b.updatedAt!) ? a : b,
      ).updatedAt;
      const latest = group.filter((r) => r.updatedAt === date);
      return new Set(latest.map((r) => JSON.stringify(r))).size === 1 ? [latest[0]!] : [];
    });
    const result: PregameTeamContext = {};
    if (previousName) result.previousQuarterbackName = previousName;
    if (previousId) result.previousQuarterbackId = previousId;
    if (unique.length) {
      result.reportUpdatedAt = unique
        .map((r) => r.updatedAt!)
        .sort()
        .at(-1)!;
      result.offenseOut = unique.filter(
        (r) => r.reportStatus.toLowerCase() === 'out' && offense.has(r.position),
      ).length;
      result.defenseOut = unique.filter(
        (r) => r.reportStatus.toLowerCase() === 'out' && defense.has(r.position),
      ).length;
      if (previousId || previousName) {
        const matchingQuarterback = (r: NFLInjuryReportRow) =>
          r.position === 'QB' &&
          (previousId && r.gsisId
            ? r.gsisId === previousId
            : !!previousName && playerNameKey(r.fullName) === playerNameKey(previousName));
        const qb = unique.filter(matchingQuarterback),
          rawQuarterbacks = rows.filter(matchingQuarterback);
        if (qb.length <= 1 && (qb.length || !rawQuarterbacks.length)) {
          result.quarterbackOut = qb[0]?.reportStatus.toLowerCase() === 'out';
          result.quarterbackDoubtful = qb[0]?.reportStatus.toLowerCase() === 'doubtful';
        }
      }
    }
    const eligible = quarterbacks.filter(
        (r) =>
          r.team === team &&
          Date.parse(r.observedAt) <= clock &&
          Date.parse(r.observedAt) >= clock - 3 * 86400000,
      ),
      latest = eligible
        .map((r) => r.observedAt)
        .sort()
        .at(-1),
      choices = eligible.filter((r) => r.observedAt === latest);
    if (
      choices.length &&
      new Set(choices.map((r) => r.gsisId ?? playerNameKey(r.name))).size === 1
    ) {
      const q = choices[0]!;
      result.expectedQuarterbackName = q.name;
      if (q.gsisId) result.expectedQuarterbackId = q.gsisId;
      result.quarterbackObservedAt = q.observedAt;
      if (previousName && prior && Date.parse(game.date) - Date.parse(prior.date) <= 30 * 86400000)
        result.quarterbackChanged =
          previousId && q.gsisId
            ? previousId !== q.gsisId
            : playerNameKey(previousName) !== playerNameKey(q.name);
    }
    return result;
  };
  return { asOf, home: side(true), away: side(false) };
}
