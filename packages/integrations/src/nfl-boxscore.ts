import { asList, asObject, asText } from '@sidekick/core';
import { nflTeamKey, type PlayerGameStats } from '@sidekick/core';
import { readBoundedJson } from './http.js';

type Stats = PlayerGameStats['stats'];
export interface LiveBoxScore {
  espnId: string;
  state: 'pre' | 'in' | 'post';
  /** Team key → points scored so far. */
  scores: Record<string, number>;
  /** ESPN athlete id → stats so far, with the athlete's team. */
  players: Record<string, { name: string; team: string; stats: Stats } & DistanceLists>;
  /** Team key → that team's D/ST stats so far. */
  defenses: Record<string, Stats>;
  /** Things the feed could not attribute, such as a two-point try with no named player. */
  notes: string[];
}
type DistanceLists = Pick<PlayerGameStats, 'madeFieldGoalDistances' | 'blockedFieldGoalDistances'>;

const count = (x: unknown) => {
  const n = Number(asText(x) || x);
  return Number.isInteger(n) && n >= 0 && n < 2_000 ? n : undefined;
};
const yards = (x: unknown) => {
  const n = Number(asText(x) || x);
  return Number.isInteger(n) && n > -1_000 && n < 2_000 ? n : undefined;
};
/** "24/31" or "2-11" → [24, 31]. */
const pair = (x: unknown) => {
  const match = /^(\d+)[/-](\d+)$/.exec(asText(x));
  return match ? [Number(match[1]), Number(match[2])] : undefined;
};
const team = (x: unknown) => {
  const abbreviation = asText(asObject(x).abbreviation);
  return /^[A-Z]{2,4}$/.test(abbreviation) ? nflTeamKey(abbreviation) : undefined;
};
const distance = (text: string) => {
  const match = /(\d{1,3})\s*(?:yd|yard)/i.exec(text);
  const value = match ? Number(match[1]) : NaN;
  return value >= 1 && value <= 100 ? value : undefined;
};
const bucket = (value: number) =>
  value <= 19
    ? '0_19'
    : value <= 29
      ? '20_29'
      : value <= 39
        ? '30_39'
        : value <= 49
          ? '40_49'
          : value <= 59
            ? '50_59'
            : '60_';

// Every row starts at zero for these so a player with no rushing line scores 0, not "missing".
const offenseKeys = [
  'attempts',
  'completions',
  'passing_yards',
  'passing_tds',
  'passing_interceptions',
  'passing_2pt_conversions',
  'carries',
  'rushing_yards',
  'rushing_tds',
  'rushing_fumbles_lost',
  'rushing_2pt_conversions',
  'receptions',
  'targets',
  'receiving_yards',
  'receiving_tds',
  'receiving_fumbles_lost',
  'receiving_2pt_conversions',
  'sack_fumbles_lost',
  'special_teams_tds',
] as const;

/**
 * Turns ESPN's public game summary into per-player and per-defense stat lines. Player stats come
 * from the box score; kick distances, return touchdowns, safeties, blocked kicks and two-point
 * tries come from the play-by-play. Anything that cannot be attributed is left out and noted.
 */
export function parseNflBoxScore(value: unknown, espnId: string): LiveBoxScore {
  const v = asObject(value);
  const competition = asObject(asList(asObject(v.header).competitions)[0]);
  const rawState = asObject(asObject(competition.status).type).state;
  const state = rawState === 'in' || rawState === 'post' ? rawState : 'pre';
  const scores: Record<string, number> = {};
  for (const competitor of asList(competition.competitors)) {
    const key = team(asObject(competitor).team);
    const score = count(asObject(competitor).score);
    if (key && score !== undefined) scores[key] = score;
  }
  const players: LiveBoxScore['players'] = {};
  const kickers: Record<string, string[]> = {};
  const teamTotals: Record<string, Record<string, unknown>> = {};
  for (const entry of asList(asObject(v.boxscore).teams)) {
    const key = team(asObject(entry).team);
    if (!key) continue;
    teamTotals[key] = Object.fromEntries(
      asList(asObject(entry).statistics).map((s) => [
        asText(asObject(s).name),
        asObject(s).displayValue,
      ]),
    );
  }
  for (const entry of asList(asObject(v.boxscore).players)) {
    const key = team(asObject(entry).team);
    if (!key) continue;
    for (const category of asList(asObject(entry).statistics).slice(0, 20)) {
      const name = asText(asObject(category).name);
      const keys = asList(asObject(category).keys).map(asText);
      for (const athleteEntry of asList(asObject(category).athletes).slice(0, 80)) {
        const athlete = asObject(asObject(athleteEntry).athlete);
        const id = asText(athlete.id);
        if (!/^\d{1,12}$/.test(id)) continue;
        const raw = Object.fromEntries(
          keys.map((k, i) => [k, asList(asObject(athleteEntry).stats)[i]]),
        );
        const row = (players[id] ??= {
          name: asText(athlete.displayName).slice(0, 120),
          team: key,
          stats: Object.fromEntries(offenseKeys.map((k) => [k, 0])) as Stats,
        });
        const s = row.stats;
        if (name === 'passing') {
          const [completions, attempts] = pair(raw['completions/passingAttempts']) ?? [];
          s.completions = completions ?? 0;
          s.attempts = attempts ?? 0;
          s.passing_yards = yards(raw.passingYards) ?? 0;
          s.passing_tds = count(raw.passingTouchdowns) ?? 0;
          s.passing_interceptions = count(raw.interceptions) ?? 0;
        } else if (name === 'rushing') {
          s.carries = count(raw.rushingAttempts) ?? 0;
          s.rushing_yards = yards(raw.rushingYards) ?? 0;
          s.rushing_tds = count(raw.rushingTouchdowns) ?? 0;
        } else if (name === 'receiving') {
          s.receptions = count(raw.receptions) ?? 0;
          s.receiving_yards = yards(raw.receivingYards) ?? 0;
          s.receiving_tds = count(raw.receivingTouchdowns) ?? 0;
          s.targets = count(raw.receivingTargets) ?? 0;
        } else if (name === 'fumbles') {
          // The box score gives lost fumbles in total; one field holds them all.
          s.rushing_fumbles_lost = count(raw.fumblesLost) ?? 0;
        } else if (name === 'kickReturns' || name === 'puntReturns') {
          s.special_teams_tds =
            (s.special_teams_tds ?? 0) +
            (count(raw.kickReturnTouchdowns ?? raw.puntReturnTouchdowns) ?? 0);
        } else if (name === 'kicking') {
          const [fgMade, fgAttempts] = pair(raw['fieldGoalsMade/fieldGoalAttempts']) ?? [];
          const [patMade, patAttempts] = pair(raw['extraPointsMade/extraPointAttempts']) ?? [];
          if (fgMade !== undefined && fgAttempts !== undefined) {
            s.fg_made = fgMade;
            s.fg_att = fgAttempts;
          }
          if (patMade !== undefined && patAttempts !== undefined) {
            s.pat_made = patMade;
            s.pat_att = patAttempts;
            s.pat_missed = patAttempts - patMade;
            s.pat_blocked = 0;
          }
          (kickers[key] ??= []).push(id);
        }
      }
    }
  }

  const drives = [
    ...asList(asObject(v.drives).previous),
    ...(asObject(v.drives).current ? [asObject(v.drives).current] : []),
  ];
  const kicks: Record<string, { made: number[]; missed: number[]; blocked: number[] }> = {};
  const blockedKicksAgainst: Record<string, number> = {};
  for (const drive of drives) {
    const offense = team(asObject(drive).team);
    if (!offense) continue;
    for (const play of asList(asObject(drive).plays)) {
      const type = asText(asObject(asObject(play).type).text);
      const text = asText(asObject(play).text);
      const kick = (kicks[offense] ??= { made: [], missed: [], blocked: [] });
      const yardage = distance(text);
      if (/^field goal good$/i.test(type) && yardage) kick.made.push(yardage);
      else if (/^field goal missed$/i.test(type) && yardage) kick.missed.push(yardage);
      else if (/^blocked field goal/i.test(type) && yardage) kick.blocked.push(yardage);
      if (/^blocked/i.test(type) || /extra point is blocked/i.test(text))
        blockedKicksAgainst[offense] = (blockedKicksAgainst[offense] ?? 0) + 1;
    }
  }
  const notes: string[] = [];
  for (const [key, ids] of Object.entries(kickers)) {
    const kick = kicks[key] ?? { made: [], missed: [], blocked: [] };
    const row = ids.length === 1 ? players[ids[0]!] : undefined;
    // Distances are trusted only when one kicker took every kick and the counts agree.
    if (
      !row ||
      row.stats.fg_made !== kick.made.length ||
      row.stats.fg_att !== kick.made.length + kick.missed.length + kick.blocked.length
    ) {
      notes.push(`${key} field goal distances could not be matched to one kicker.`);
      continue;
    }
    const s = row.stats;
    s.fg_missed = kick.missed.length;
    s.fg_blocked = kick.blocked.length;
    s.fg_made_distance = kick.made.reduce((a, b) => a + b, 0);
    for (const b of ['0_19', '20_29', '30_39', '40_49', '50_59', '60_'] as const) {
      s[`fg_made_${b}`] = kick.made.filter((d) => bucket(d) === b).length;
      s[`fg_missed_${b}`] = kick.missed.filter((d) => bucket(d) === b).length;
    }
    row.madeFieldGoalDistances = kick.made;
    row.blockedFieldGoalDistances = kick.blocked;
  }

  const teams = Object.keys(scores);
  const defenses: LiveBoxScore['defenses'] = {};
  for (const key of teams) {
    const opponent = teams.find((t) => t !== key);
    const allowed = opponent ? teamTotals[opponent] : undefined;
    if (!opponent || !allowed) continue;
    defenses[key] = {
      dst_points_allowed: scores[opponent]!,
      ...(yards(allowed.totalYards) !== undefined
        ? { dst_yards_allowed: yards(allowed.totalYards)! }
        : {}),
      ...(pair(allowed.sacksYardsLost) ? { dst_sacks: pair(allowed.sacksYardsLost)![0]! } : {}),
      ...(count(allowed.interceptions) !== undefined
        ? { dst_interceptions: count(allowed.interceptions)! }
        : {}),
      ...(count(allowed.fumblesLost) !== undefined
        ? { dst_fumble_recoveries: count(allowed.fumblesLost)! }
        : {}),
      dst_blocked_kicks: blockedKicksAgainst[opponent] ?? 0,
      dst_interception_return_tds: 0,
      dst_fumble_return_tds: 0,
      dst_kickoff_return_tds: 0,
      dst_punt_return_tds: 0,
      dst_blocked_kick_return_tds: 0,
      dst_safeties: 0,
      dst_two_point_returns: 0,
      dst_one_point_safeties: 0,
    };
  }

  let previous: Record<string, number> = {};
  const home = asList(competition.competitors)
    .map(asObject)
    .find((c) => c.homeAway === 'home');
  const away = asList(competition.competitors)
    .map(asObject)
    .find((c) => c.homeAway === 'away');
  const homeKey = team(home?.team),
    awayKey = team(away?.team);
  for (const play of asList(v.scoringPlays)) {
    const p = asObject(play);
    const type = asText(asObject(p.type).text);
    const text = asText(p.text);
    const scorer = team(p.team);
    const now: Record<string, number> = {
      ...(homeKey ? { [homeKey]: count(p.homeScore) ?? 0 } : {}),
      ...(awayKey ? { [awayKey]: count(p.awayScore) ?? 0 } : {}),
    };
    const gained = scorer ? (now[scorer] ?? 0) - (previous[scorer] ?? 0) : 0;
    previous = now;
    if (!scorer) continue;
    const defense = defenses[scorer];
    if (defense) {
      const add = (k: keyof Stats) => (defense[k] = (defense[k] ?? 0) + 1);
      if (/touchdown/i.test(type)) {
        if (/blocked/i.test(type)) add('dst_blocked_kick_return_tds');
        else if (/interception/i.test(type)) add('dst_interception_return_tds');
        else if (/fumble/i.test(type) && /return|recover/i.test(type)) add('dst_fumble_return_tds');
        else if (/kickoff/i.test(type)) add('dst_kickoff_return_tds');
        else if (/punt/i.test(type)) add('dst_punt_return_tds');
      }
      if (/safety/i.test(type)) add('dst_safeties');
      if (/defensive.*(two|2).?p(oin)?t/i.test(type)) add('dst_two_point_returns');
    }
    // A touchdown worth 8 means a successful two-point try; credit the named players.
    if (/touchdown/i.test(type) && gained === 8) {
      const clause = /\(([^)]*)\)\s*$/.exec(text)?.[1] ?? '';
      const named = Object.entries(players)
        .filter(([, row]) => row.team === scorer && row.name && clause.includes(row.name))
        .sort((a, b) => clause.indexOf(a[1].name) - clause.indexOf(b[1].name));
      if (/pass/i.test(clause) && named.length === 2) {
        named[0]![1].stats.passing_2pt_conversions! += 1;
        named[1]![1].stats.receiving_2pt_conversions! += 1;
      } else if (/run|rush/i.test(clause) && named.length === 1) {
        named[0]![1].stats.rushing_2pt_conversions! += 1;
      } else notes.push(`A ${scorer} two-point conversion could not be credited to a player.`);
    }
  }
  return { espnId, state, scores, players, defenses, notes };
}

/** ESPN game summaries, cached briefly while live and longer once final. */
export class PublicNflBoxScores {
  private cache = new Map<string, { until: number; value: LiveBoxScore }>();
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}
  async get(espnId: string): Promise<LiveBoxScore> {
    if (!/^\d{6,12}$/.test(espnId)) throw new Error('Invalid ESPN game id.');
    const hit = this.cache.get(espnId);
    if (hit && hit.until > this.now()) return hit.value;
    const response = await this.fetcher(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${espnId}`,
      {
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: { accept: 'application/json' },
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('The NFL box score is unavailable.');
    }
    const value = parseNflBoxScore(await readBoundedJson<unknown>(response, 6_000_000), espnId);
    // Finished games still get stat corrections for a while, so they are re-read every 10 minutes.
    this.cache.set(espnId, {
      until: this.now() + (value.state === 'post' ? 600_000 : 30_000),
      value,
    });
    if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }
}
