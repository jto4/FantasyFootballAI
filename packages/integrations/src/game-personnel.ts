import { nflTeamKey, playerNameKey, type FootballGame, usablePregameContext } from '@sidekick/core';
import { csvRecords } from './football-csv.js';
import { readBoundedText } from './http.js';
import { playerStatsUrl } from './football-data.js';
import type { NFLInjuryReportRow } from './injuries.js';

export interface PersonnelPerformance {
  id: string;
  name: string;
  team: string;
  position: string;
  gameId: string;
  season: number;
  week: number;
  attempts: number;
  sacks: number;
  adjustedYards: number;
  passingEpa?: number;
  rushingEpa?: number;
  carries?: number;
}
export interface PersonnelSnaps {
  name: string;
  team: string;
  position: string;
  gameId: string;
  season: number;
  week: number;
  offense: number;
  defense: number;
}
const integer = (s: string | undefined, lo: number, hi: number) =>
  s !== undefined && /^\d+$/.test(s) && Number(s) >= lo && Number(s) <= hi ? Number(s) : undefined;
const measure = (s: string | undefined, lo: number, hi: number) =>
  s !== undefined && s.trim() && Number.isFinite(Number(s)) && Number(s) >= lo && Number(s) <= hi
    ? Number(s)
    : undefined;
const name = (s: string | undefined): s is string =>
  !!s && s.length <= 120 && !/[\u0000-\u001f]/.test(s);
const identity = (r: Record<string, string>, season: number) =>
  Number(r.season) === season &&
  integer(r.week, 1, 18) !== undefined &&
  /^[A-Z]{2,3}$/.test(r.team ?? '') &&
  /^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(r.game_id ?? '');
export function parsePersonnelPerformance(csv: string, season: number): PersonnelPerformance[] {
  return csvRecords(csv, [
    'season',
    'week',
    'season_type',
    'game_id',
    'team',
    'player_id',
    'player_display_name',
    'position',
    'attempts',
    'sacks_suffered',
    'passing_yards',
    'sack_yards_lost',
    'passing_tds',
    'passing_interceptions',
  ]).flatMap((r) => {
    if (
      r.season_type !== 'REG' ||
      r.position !== 'QB' ||
      !identity(r, season) ||
      !name(r.player_display_name) ||
      !/^\d{2}-\d{7}$/.test(r.player_id ?? '')
    )
      return [];
    const attempts = integer(r.attempts, 0, 100),
      sacks = integer(r.sacks_suffered, 0, 30),
      yards = measure(r.passing_yards, -100, 1000),
      loss = measure(r.sack_yards_lost, -300, 0),
      td = integer(r.passing_tds, 0, 15),
      interceptions = integer(r.passing_interceptions, 0, 15);
    if ([attempts, sacks, yards, loss, td, interceptions].some((x) => x === undefined)) return [];
    return [
      {
        id: r.player_id!,
        name: r.player_display_name!,
        team: nflTeamKey(r.team!),
        position: 'QB',
        gameId: r.game_id!,
        season,
        week: Number(r.week),
        attempts: attempts!,
        sacks: sacks!,
        adjustedYards: yards! + loss! + 20 * td! - 45 * interceptions!,
        ...(measure(r.passing_epa, -150, 150) !== undefined
          ? { passingEpa: Number(r.passing_epa) }
          : {}),
        ...(integer(r.carries, 0, 50) !== undefined &&
        (measure(r.rushing_epa, -100, 100) !== undefined ||
          (r.rushing_epa === '' && r.carries === '0'))
          ? {
              carries: Number(r.carries),
              rushingEpa: r.rushing_epa === '' ? 0 : Number(r.rushing_epa),
            }
          : {}),
      },
    ];
  });
}
export function parsePersonnelSnaps(csv: string, season: number): PersonnelSnaps[] {
  return csvRecords(csv, [
    'season',
    'week',
    'game_type',
    'game_id',
    'team',
    'player',
    'position',
    'offense_pct',
    'defense_pct',
  ]).flatMap((r) => {
    const offense = measure(r.offense_pct, 0, 1),
      defense = measure(r.defense_pct, 0, 1);
    if (
      r.game_type !== 'REG' ||
      !identity(r, season) ||
      !name(r.player) ||
      !/^[A-Z]{1,5}$/.test(r.position ?? '') ||
      offense === undefined ||
      defense === undefined
    )
      return [];
    return [
      {
        name: r.player!,
        team: nflTeamKey(r.team!),
        position: r.position!,
        gameId: r.game_id!,
        season,
        week: Number(r.week),
        offense,
        defense,
      },
    ];
  });
}
export async function fetchPersonnelSeason(season: number, fetcher: typeof fetch = fetch) {
  if (!Number.isInteger(season) || season < 2010 || season > 2099)
    throw new Error('Invalid personnel season.');
  const urls = [
    playerStatsUrl(season),
    `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`,
  ];
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Personnel season unavailable.');
      }
      return readBoundedText(response, 12000000);
    }),
  );
  return {
    performance:
      results[0]!.status === 'fulfilled'
        ? parsePersonnelPerformance(results[0]!.value, season)
        : [],
    snaps: results[1]!.status === 'fulfilled' ? parsePersonnelSnaps(results[1]!.value, season) : [],
  };
}
const offensePositions = new Set([
  'RB',
  'FB',
  'WR',
  'TE',
  'C',
  'G',
  'T',
  'OG',
  'OT',
  'OL',
  'LT',
  'RT',
  'LG',
  'RG',
]);
const defensePositions = new Set([
  'DE',
  'DT',
  'NT',
  'LB',
  'ILB',
  'OLB',
  'CB',
  'DB',
  'S',
  'SS',
  'FS',
  'DL',
]);
const normalized = (s: string) => playerNameKey(s.replace(/\s+(?:Jr\.?|Sr\.?|II|III|IV)$/i, ''));
export function preparePersonnelEvidence(
  games: FootballGame[],
  performance: PersonnelPerformance[],
  snaps: PersonnelSnaps[],
) {
  const ids = new Map(
    games
      .filter(
        (g) =>
          g.seasonType === 'REG' && Number.isInteger(g.homeScore) && Number.isInteger(g.awayScore),
      )
      .map((g) => [g.id, g]),
  );
  const validRow = (r: PersonnelPerformance | PersonnelSnaps) => {
    const g = ids.get(r.gameId);
    return (
      g &&
      g.season === r.season &&
      g.week === r.week &&
      [g.home, g.away].some((t) => nflTeamKey(t) === r.team)
    );
  };
  const unique = <T extends PersonnelPerformance | PersonnelSnaps>(
    rows: T[],
    key: (r: T) => string,
  ) => {
    const groups = new Map<string, T[]>();
    for (const r of rows.filter(validRow)) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
    return [...groups.values()].flatMap((a) =>
      new Set(a.map((r) => JSON.stringify(r))).size === 1 ? [structuredClone(a[0]!)] : [],
    );
  };
  const byName = new Map<string, PersonnelPerformance[]>(),
    byId = new Map<string, PersonnelPerformance[]>(),
    byTeam = new Map<string, PersonnelPerformance[]>(),
    byGame = new Map<string, PersonnelSnaps[]>();
  for (const r of unique(performance, (r) => `${r.gameId}:${r.id}`)) {
    byName.set(normalized(r.name), [...(byName.get(normalized(r.name)) ?? []), r]);
    byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
    byTeam.set(r.team, [...(byTeam.get(r.team) ?? []), r]);
  }
  for (const r of unique(snaps, (r) => `${r.gameId}:${r.team}:${normalized(r.name)}`))
    byGame.set(r.gameId, [...(byGame.get(r.gameId) ?? []), r]);
  return { byName, byId, byTeam, byGame };
}

/** Derived only from earlier completed games, never target starters, target snaps or target efficiency. */
export function addPregamePersonnel(
  game: FootballGame,
  games: FootballGame[],
  reports: NFLInjuryReportRow[],
  performance: PersonnelPerformance[],
  snaps: PersonnelSnaps[],
  prepared?: ReturnType<typeof preparePersonnelEvidence>,
): FootballGame {
  if (!usablePregameContext(game)) return game;
  const p = structuredClone(game.pregame!),
    clock = Date.parse(p.asOf);
  const eligible = games.filter(
    (g) =>
      g.seasonType === 'REG' &&
      g.season >= game.season - 2 &&
      (g.season < game.season || g.week < game.week) &&
      g.kickoffAt &&
      Date.parse(g.kickoffAt) + 86400000 <= clock &&
      Number.isInteger(g.homeScore) &&
      Number.isInteger(g.awayScore),
  );
  const ids = new Map(eligible.map((g) => [g.id, g]));
  const validRow = (r: PersonnelPerformance | PersonnelSnaps) => ids.has(r.gameId);
  const evidence = prepared ?? preparePersonnelEvidence(games, performance, snaps);
  const quality = (rows: PersonnelPerformance[]) => {
    const recent = [...rows]
      .sort((a, b) => ids.get(b.gameId)!.date.localeCompare(ids.get(a.gameId)!.date))
      .slice(0, 8);
    if (!recent.length) return;
    let yards = 0,
      dropbacks = 0;
    recent.forEach((r, i) => {
      const weight = 0.85 ** i;
      yards += weight * r.adjustedYards;
      dropbacks += weight * (r.attempts + r.sacks);
    });
    if (dropbacks < 20) return;
    return Math.max(-1, Math.min(1, (yards - 6 * dropbacks) / (4 * (dropbacks + 100))));
  };
  const epaQuality = (rows: PersonnelPerformance[]) => {
    const recent = [...rows]
      .sort((a, b) => ids.get(b.gameId)!.date.localeCompare(ids.get(a.gameId)!.date))
      .slice(0, 8);
    // Reject incomplete measurement windows instead of selecting only the well-measured games.
    if (
      !recent.length ||
      recent.some(
        (r) => r.passingEpa === undefined || r.rushingEpa === undefined || r.carries === undefined,
      )
    )
      return;
    let epa = 0,
      rush = 0,
      plays = 0;
    recent.forEach((r, i) => {
      const weight = 0.85 ** i;
      epa += weight * (r.passingEpa! + r.rushingEpa!);
      rush += weight * r.rushingEpa!;
      plays += weight * (r.attempts + r.sacks + r.carries!);
    });
    if (plays < 20) return;
    const bound = (v: number) => Math.max(-0.5, Math.min(0.5, v / (plays + 100)));
    return { total: bound(epa), rush: bound(rush) };
  };
  for (const side of ['home', 'away'] as const) {
    const team = nflTeamKey(game[side]),
      context = p[side];
    const teamGames = eligible
      .filter((g) => [g.home, g.away].some((t) => nflTeamKey(t) === team))
      .sort((a, b) => b.date.localeCompare(a.date));
    const latest = teamGames[0];
    if (!latest) continue;
    const availableBy = new Date(Date.parse(latest.kickoffAt!) + 86400000).toISOString();
    const fields: NonNullable<typeof context.personnel> = {
      availableBy,
      throughSeason: latest.season,
      throughWeek: latest.week,
      reportedPlayers: 0,
      matchedReports: 0,
    };
    const qbName =
      context.expectedQuarterbackName ??
      (context.quarterbackOut ? undefined : context.previousQuarterbackName);
    const qbId = context.expectedQuarterbackName
      ? context.expectedQuarterbackId
      : context.quarterbackOut
        ? undefined
        : context.previousQuarterbackId;
    const qbRows = (
      qbId
        ? (evidence.byId.get(qbId) ?? [])
        : qbName
          ? (evidence.byName.get(normalized(qbName)) ?? [])
          : []
    ).filter(validRow);
    if (new Set(qbRows.map((r) => r.id)).size === 1) {
      const q = quality(qbRows);
      if (q !== undefined) fields.quarterbackQuality = q;
      // A stale rank-one chart must not grade a player the selected report has ruled Out.
      const outChart =
        context.quarterbackOut &&
        context.expectedQuarterbackName &&
        (context.previousQuarterbackId && context.expectedQuarterbackId
          ? context.previousQuarterbackId === context.expectedQuarterbackId
          : normalized(context.previousQuarterbackName ?? '') ===
            normalized(context.expectedQuarterbackName));
      const epa = outChart ? undefined : epaQuality(qbRows);
      if (epa) {
        fields.quarterbackEpa = epa.total;
        fields.quarterbackRushEpa = epa.rush;
        const teamEpa = epaQuality((evidence.byTeam.get(team) ?? []).filter(validRow));
        if (teamEpa) fields.quarterbackTeamDelta = epa.total - teamEpa.total;
      }
    }
    const previous = (
      context.previousQuarterbackId
        ? (evidence.byId.get(context.previousQuarterbackId) ?? [])
        : context.previousQuarterbackName
          ? (evidence.byName.get(normalized(context.previousQuarterbackName)) ?? [])
          : []
    ).filter(validRow);
    if (context.quarterbackOut !== undefined && new Set(previous.map((r) => r.id)).size === 1) {
      const q = quality(previous);
      if (q !== undefined) fields.quarterbackAbsenceValue = context.quarterbackOut ? q : 0;
    }
    const reportGroups = new Map<string, NFLInjuryReportRow[]>();
    for (const r of reports.filter(
      (r) =>
        r.season === game.season &&
        r.week === game.week &&
        r.seasonType === 'REG' &&
        nflTeamKey(r.team) === team &&
        r.updatedAt &&
        Date.parse(r.updatedAt) <= clock &&
        Date.parse(r.updatedAt) >= Date.parse(game.kickoffAt!) - 7 * 86400000,
    )) {
      const key = r.gsisId ?? normalized(r.fullName);
      reportGroups.set(key, [...(reportGroups.get(key) ?? []), r]);
    }
    const current = [...reportGroups.values()].flatMap((a) => {
      const last = Math.max(...a.map((r) => Date.parse(r.updatedAt!))),
        b = a.filter((r) => Date.parse(r.updatedAt!) === last);
      return new Set(b.map((r) => JSON.stringify(r))).size === 1 ? [b[0]!] : [];
    });
    const recentIds = new Set(teamGames.slice(0, 3).map((g) => g.id));
    const roles = [...recentIds].flatMap((id) => evidence.byGame.get(id) ?? []).filter(validRow);
    const role = (r: NFLInjuryReportRow, defensive: boolean) => {
      const matching = roles.filter(
        (s) =>
          recentIds.has(s.gameId) &&
          s.team === team &&
          normalized(s.name) === normalized(r.fullName),
      );
      if (!matching.length) return;
      return (
        matching.reduce((sum, s) => sum + (defensive ? s.defense : s.offense), 0) / matching.length
      );
    };
    fields.reportedPlayers = current.length;
    fields.matchedReports = current.filter(
      (r) => role(r, defensePositions.has(r.position)) !== undefined,
    ).length;
    if (context.reportUpdatedAt && current.length) {
      for (const [status, positions, defensive, key] of [
        ['Out', offensePositions, false, 'offenseOutSnaps'],
        ['Out', defensePositions, true, 'defenseOutSnaps'],
        ['Questionable', offensePositions, false, 'offenseQuestionableSnaps'],
        ['Questionable', defensePositions, true, 'defenseQuestionableSnaps'],
      ] as const) {
        const group = current.filter(
            (r) =>
              r.reportStatus.toLowerCase() === status.toLowerCase() && positions.has(r.position),
          ),
          weights = group.map((r) => role(r, defensive));
        if (weights.every((w) => w !== undefined))
          fields[key] = weights.reduce<number>((sum, w) => sum + w!, 0);
      }
    }
    if (context.reportUpdatedAt && current.length) {
      const line = new Set(['C', 'G', 'T', 'OG', 'OT', 'OL', 'LT', 'RT', 'LG', 'RG']);
      const skill = new Set(['RB', 'FB', 'WR', 'TE']);
      const practice = (r: NFLInjuryReportRow) =>
        !/not injury related|rest|personal/i.test(r.practiceInjury + ' ' + r.reportInjury) &&
        !!(r.practiceInjury || r.reportInjury);
      const groups = [
        [
          'offensiveLineOutSnaps',
          current.filter((r) => line.has(r.position) && /^out$/i.test(r.reportStatus)),
          false,
        ],
        [
          'skillOutSnaps',
          current.filter((r) => skill.has(r.position) && /^out$/i.test(r.reportStatus)),
          false,
        ],
        ...(
          [
            ['offense', offensePositions, false],
            ['defense', defensePositions, true],
          ] as const
        ).flatMap(([prefix, positions, defensive]) =>
          (
            [
              ['Doubtful', (r: NFLInjuryReportRow) => /^doubtful$/i.test(r.reportStatus)],
              [
                'Limited',
                (r: NFLInjuryReportRow) =>
                  practice(r) && /^limited participation in practice$/i.test(r.practiceStatus),
              ],
              [
                'Dnp',
                (r: NFLInjuryReportRow) =>
                  practice(r) && /^did not participate in practice$/i.test(r.practiceStatus),
              ],
            ] as const
          ).map(
            ([status, predicate]) =>
              [
                prefix + status + 'Snaps',
                current.filter((r) => positions.has(r.position) && predicate(r)),
                defensive,
              ] as const,
          ),
        ),
      ] as const;
      for (const [key, group, defensive] of groups) {
        // A source that carries no practice observations cannot establish zero practice burden.
        if (/Limited|Dnp/.test(key)) {
          const positions = defensive ? defensePositions : offensePositions;
          const injured = current.filter((r) => positions.has(r.position) && practice(r));
          if (
            !current.some((r) => r.practiceStatus) ||
            injured.some(
              (r) =>
                !/^(full participation in practice|limited participation in practice|did not participate in practice)$/i.test(
                  r.practiceStatus,
                ),
            )
          )
            continue;
        }
        const weights = group.map((r) => role(r, defensive));
        if (weights.every((w) => w !== undefined))
          fields[key as 'offenseLimitedSnaps'] = weights.reduce<number>((sum, w) => sum + w!, 0);
      }
    }
    if ((evidence.byTeam.get(team) ?? []).some(validRow) || roles.some((r) => r.team === team))
      context.personnel = fields;
  }
  return { ...game, pregame: p };
}
