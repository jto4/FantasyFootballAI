import { gunzipSync } from 'node:zlib';
import { validateDriveTotalStats, totalSignalTeamKey, type DriveTotalStats } from '@sidekick/core';

export const driveSourceLimits = Object.freeze({
  compressedBytes: 45000000,
  csvBytes: 250000000,
  rows: 100000,
  columns: 450,
  cellBytes: 4096,
});
const required = [
  'play_id',
  'game_id',
  'season',
  'week',
  'season_type',
  'home_team',
  'away_team',
  'posteam',
  'defteam',
  'qtr',
  'quarter_seconds_remaining',
  'score_differential',
  'play_type',
  'qb_kneel',
  'qb_spike',
  'no_huddle',
  'epa',
  'success',
  'yards_gained',
  'qb_dropback',
  'sack',
  'drive',
  'fixed_drive',
  'fixed_drive_result',
  'yardline_100',
  'drive_time_of_possession',
  'drive_play_count',
];
/** Retain only selected columns and aggregate each validated row; full PBP objects are never retained. */
function selectedCsv(input: string, consume: (r: Record<string, string>) => void) {
  if (Buffer.byteLength(input) > driveSourceLimits.csvBytes)
    throw new Error('Drive CSV too large.');
  let header: string[] | undefined,
    row: string[] = [],
    cell = '',
    state: 'plain' | 'quoted' | 'closed' = 'plain',
    rows = 0;
  const finishCell = () => {
    row.push(cell);
    cell = '';
    state = 'plain';
    if (row.length > 450) throw new Error('Too many drive CSV columns.');
  };
  const finishRow = () => {
    finishCell();
    if (row.some(Boolean)) {
      if (!header) {
        header = row;
        if (new Set(header).size !== header.length || required.some((k) => !header!.includes(k)))
          throw new Error('Unexpected drive CSV schema.');
      } else {
        if (row.length !== header.length || ++rows > 100000)
          throw new Error('Invalid drive CSV width or size.');
        const r: Record<string, string> = {};
        for (const k of required) r[k] = row[header.indexOf(k)]!;
        consume(r);
      }
    }
    row = [];
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (state === 'quoted') {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else state = 'closed';
      } else cell += c;
    } else if (c === ',') finishCell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      finishRow();
    } else if (state === 'closed') throw new Error('Malformed drive CSV.');
    else if (c === '"') {
      if (cell.length) throw new Error('Malformed drive quote.');
      state = 'quoted';
    } else cell += c;
    if (cell.length > 4096) throw new Error('Drive CSV cell too large.');
  }
  if (state === 'quoted') throw new Error('Unclosed drive CSV quote.');
  if (cell.length || row.length || state === 'closed') finishRow();
  if (!header) throw new Error('Empty drive CSV.');
}
const number = (r: Record<string, string>, k: string, lo: number, hi: number) => {
  const s = r[k];
  if (!s?.trim()) throw new Error(`Missing drive ${k}.`);
  const v = Number(s);
  if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`Invalid drive ${k}.`);
  return v;
};
export function parseGameDriveSignals(csv: string, season: number) {
  const stats = new Map<string, DriveTotalStats>(),
    drives = new Map<
      string,
      {
        row: DriveTotalStats;
        result: string;
        opportunity: boolean;
        redZone: boolean;
        seconds: number;
        plays: number;
      }
    >(),
    clocks = new Map<string, { row: DriveTotalStats; seconds: number; plays: number }>(),
    seen = new Set<string>(),
    unavailableGames = new Set<string>();
  let plays = 0;
  selectedCsv(csv, (r) => {
    if (r.season !== String(season)) throw new Error('Drive source season mismatch.');
    if (r.season_type === 'POST') return;
    if (r.season_type !== 'REG') throw new Error('Unknown drive season type.');
    if (!/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(r.game_id!))
      throw new Error('Invalid drive game identity.');
    const week = number(r, 'week', 1, 18),
      playId = number(r, 'play_id', 0, 100000),
      identity = `${r.game_id}:${playId}`;
    if (seen.has(identity)) throw new Error('Duplicate drive play.');
    seen.add(identity);
    plays++;
    if (!r.posteam || !r.defteam) return;
    const team = totalSignalTeamKey(r.posteam),
      opponent = totalSignalTeamKey(r.defteam),
      home = totalSignalTeamKey(r.home_team!),
      away = totalSignalTeamKey(r.away_team!);
    if (![home, away].includes(team) || ![home, away].includes(opponent) || team === opponent)
      throw new Error('Drive team mismatch.');
    const qtr = number(r, 'qtr', 1, 5);
    if (qtr > 4) return;
    const kneel = number(r, 'qb_kneel', 0, 1),
      spike = number(r, 'qb_spike', 0, 1);
    if (!['pass', 'run'].includes(r.play_type!) || kneel || spike) return;
    if (
      [
        'epa',
        'success',
        'yards_gained',
        'qb_dropback',
        'sack',
        'fixed_drive',
        'fixed_drive_result',
        'yardline_100',
        'drive_time_of_possession',
        'drive_play_count',
        'score_differential',
        'quarter_seconds_remaining',
        'no_huddle',
      ].some((k) => !r[k]?.trim())
    ) {
      unavailableGames.add(r.game_id!);
      return;
    }
    const key = `${r.game_id}:${team}`;
    let s = stats.get(key);
    if (!s) {
      s = {
        gameId: r.game_id!,
        season,
        week,
        team,
        opponent,
        plays: 0,
        epa: 0,
        successes: 0,
        explosives: 0,
        dropbacks: 0,
        passEpa: 0,
        sacks: 0,
        neutralPlays: 0,
        neutralPasses: 0,
        neutralNoHuddle: 0,
        neutralEpa: 0,
        neutralSuccesses: 0,
        drives: 0,
        offensivePoints: 0,
        opportunities: 0,
        redZoneDrives: 0,
        redZoneTouchdowns: 0,
        possessionSeconds: 0,
        possessionPlays: 0,
      };
      stats.set(key, s);
    }
    const epa = number(r, 'epa', -20, 20),
      success = number(r, 'success', 0, 1),
      yards = number(r, 'yards_gained', -100, 100),
      pass = number(r, 'qb_dropback', 0, 1),
      sack = number(r, 'sack', 0, 1);
    s.plays++;
    s.epa += epa;
    s.successes += success;
    s.explosives += yards >= 20 ? 1 : 0;
    s.dropbacks += pass;
    s.passEpa += pass * epa;
    s.sacks += sack;
    if (
      number(r, 'quarter_seconds_remaining', 0, 900) > 120 &&
      Math.abs(number(r, 'score_differential', -100, 100)) <= 8
    ) {
      s.neutralPlays++;
      s.neutralPasses += pass;
      s.neutralEpa += epa;
      s.neutralSuccesses += success;
      s.neutralNoHuddle += number(r, 'no_huddle', 0, 1);
    }
    const drive = number(r, 'fixed_drive', 1, 40),
      dk = `${key}:${drive}`,
      result = r.fixed_drive_result!;
    if (
      ![
        'Touchdown',
        'Field goal',
        'Punt',
        'Turnover',
        'Turnover on downs',
        'End of half',
        'Missed field goal',
        'Opp touchdown',
        'Safety',
      ].includes(result)
    )
      throw new Error('Unknown offensive drive result.');
    if (Number(r.drive_play_count) === 0) {
      unavailableGames.add(r.game_id!);
      return;
    }
    let d = drives.get(dk);
    if (!d) {
      d = { row: s, result, opportunity: false, redZone: false, seconds: 0, plays: 0 };
      drives.set(dk, d);
    }
    if (d.result !== result) throw new Error('Conflicting drive results.');
    const yardline = number(r, 'yardline_100', 0, 100);
    d.opportunity ||= yardline <= 40;
    d.redZone ||= yardline <= 20;
    if (r.drive_time_of_possession) {
      const match = /^(\d{1,2}):([0-5]\d)$/.exec(r.drive_time_of_possession);
      if (!match) throw new Error('Invalid drive possession clock.');
      const seconds = Number(match[1]) * 60 + Number(match[2]),
        count = number(r, 'drive_play_count', 1, 40);
      const clockKey = `${key}:${number(r, 'drive', 1, 40)}`,
        prior = clocks.get(clockKey);
      if (seconds > 900 || (prior && (prior.seconds !== seconds || prior.plays !== count)))
        throw new Error('Conflicting drive clock.');
      clocks.set(clockKey, { row: s, seconds, plays: count });
    }
  });
  for (const d of drives.values()) {
    const s = d.row;
    s.drives++;
    s.offensivePoints += d.result === 'Touchdown' ? 7 : d.result === 'Field goal' ? 3 : 0;
    s.opportunities += d.opportunity ? 1 : 0;
    s.redZoneDrives += d.redZone ? 1 : 0;
    s.redZoneTouchdowns += d.redZone && d.result === 'Touchdown' ? 1 : 0;
  }
  for (const c of clocks.values()) {
    c.row.possessionSeconds += c.seconds;
    c.row.possessionPlays += c.plays;
  }
  const rows = [...stats.values()]
    .filter((r) => !unavailableGames.has(r.gameId))
    .sort((a, b) => a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team));
  validateDriveTotalStats(rows);
  return { rows, plays, drives: drives.size, unavailableGames: [...unavailableGames].sort() };
}
export function decodeDriveCsv(bytes: Uint8Array) {
  if (bytes.byteLength > 45000000) throw new Error('Compressed drive file too large.');
  return gunzipSync(bytes, { maxOutputLength: 250000000 }).toString('utf8');
}
/** Preserve the raw selected fields for offline aggregation without retaining irrelevant player data. */
export function projectDriveSourceCsv(input: string) {
  const lines = [required.join(',')];
  selectedCsv(input, (row) => {
    lines.push(
      required
        .map((key) => {
          const value = row[key]!;
          return /[,"\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
        })
        .join(','),
    );
  });
  return lines.join('\n');
}
export async function loadGameDriveSource(season: number, fetcher: typeof fetch = fetch) {
  if (!Number.isInteger(season) || season < 2010 || season > 2099)
    throw new Error('Invalid drive season.');
  const url = `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`,
    capturedAt = new Date().toISOString();
  const response = await fetcher(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Drive provider failed (${response.status}).`);
  }
  if (Number(response.headers.get('content-length')) > 45000000) {
    await response.body?.cancel();
    throw new Error('Drive response too large.');
  }
  if (!response.body) throw new Error('Missing drive response.');
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 45000000) throw new Error('Drive response too large.');
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    throw e;
  }
  const bytes = Buffer.concat(chunks);
  return { url, capturedAt, bytes };
}

export async function loadGameDriveSignals(season: number, fetcher: typeof fetch = fetch) {
  const source = await loadGameDriveSource(season, fetcher);
  return { ...source, ...parseGameDriveSignals(decodeDriveCsv(source.bytes), season) };
}
