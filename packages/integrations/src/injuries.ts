import type { LeagueConnection, RosterPlayer } from '@sidekick/core';
import { readBoundedText } from './http.js';

const nflverseDataUrl = 'https://github.com/nflverse/nflverse-data/releases/download/injuries';
const maxResponseBytes = 2_000_000;
const requestTimeoutMs = 10_000;
const defaultCacheMs = 6 * 60 * 60 * 1_000;

export interface NFLInjuryReportRow {
  season: number;
  week: number;
  team: string;
  position: string;
  fullName: string;
  reportStatus: string;
  reportInjury: string;
  practiceStatus: string;
  practiceInjury: string;
}

export interface MatchedNFLInjuryReport {
  playerName: string;
  team: string;
  position: string;
  week: number;
  reportStatus: string;
  reportInjury: string;
  practiceStatus: string;
  practiceInjury: string;
}

export interface NFLInjuryReportSnapshot {
  rows: NFLInjuryReportRow[];
  retrievedAt: string;
  sourceUrl: string;
}

/** Load the openly licensed season CSV; redirects are expected for GitHub release assets. */
export async function fetchNFLInjuryReports(
  season: number,
  fetcher: typeof fetch = fetch,
): Promise<NFLInjuryReportRow[]> {
  if (!Number.isInteger(season) || season < 2009 || season > 2099)
    throw new Error('Choose an NFL injury-report season between 2009 and 2099.');
  const url = nflInjuryReportUrl(season);
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: { accept: 'text/csv, text/plain;q=0.9' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`NFL injury report request failed (${response.status}).`);
  const csv = await readBoundedText(response, maxResponseBytes);
  return parseNFLInjuryReports(csv, season);
}

export function nflInjuryReportUrl(season: number): string {
  return `${nflverseDataUrl}/injuries_${season}.csv`;
}

export function parseNFLInjuryReports(csv: string, season: number): NFLInjuryReportRow[] {
  const records = parseCsv(csv);
  if (!records.length) throw new Error('NFL injury report contained no records.');
  const [headerRow, ...dataRows] = records;
  const headers = new Map((headerRow ?? []).map((name, index) => [name.trim(), index]));
  for (const required of ['season', 'week', 'team', 'position', 'full_name']) {
    if (!headers.has(required)) throw new Error('NFL injury report had an unexpected CSV schema.');
  }

  return dataRows.slice(0, 10_000).flatMap((row) => {
    const rowSeason = boundedInteger(rowValue(row, headers, 'season'), 2009, 2099);
    const week = boundedInteger(rowValue(row, headers, 'week'), 1, 30);
    const team = bounded(rowValue(row, headers, 'team'), 3).toUpperCase();
    const position = bounded(rowValue(row, headers, 'position'), 12).toUpperCase();
    const fullName = bounded(rowValue(row, headers, 'full_name'), 120);
    if (rowSeason !== season || week === undefined || !team || !position || !fullName) return [];
    return [
      {
        season,
        week,
        team,
        position,
        fullName,
        reportStatus: bounded(rowValue(row, headers, 'report_status'), 80),
        reportInjury: injuryDescription(
          rowValue(row, headers, 'report_primary_injury'),
          rowValue(row, headers, 'report_secondary_injury'),
        ),
        practiceStatus: bounded(rowValue(row, headers, 'practice_status'), 80),
        practiceInjury: injuryDescription(
          rowValue(row, headers, 'practice_primary_injury'),
          rowValue(row, headers, 'practice_secondary_injury'),
        ),
      },
    ];
  });
}

/** Attach only exact player-name/team matches to the current league's roster. */
export function matchRosterInjuries(
  league: LeagueConnection,
  reports: NFLInjuryReportRow[],
  week: number,
): MatchedNFLInjuryReport[] {
  const roster = league.teams.flatMap((team) => team.roster ?? []);
  const byName = new Map<string, RosterPlayer[]>();
  for (const player of roster) {
    const key = normalizePlayerName(player.name);
    if (!key) continue;
    const matches = byName.get(key) ?? [];
    matches.push(player);
    byName.set(key, matches);
  }

  const matched = new Map<string, MatchedNFLInjuryReport>();
  for (const report of reports) {
    if (report.season !== league.season || report.week !== week || !hasAvailabilityEvidence(report))
      continue;
    const rosterMatches = byName.get(normalizePlayerName(report.fullName)) ?? [];
    const player = rosterMatches.find((candidate) =>
      candidate.nflTeam
        ? normalizeTeam(candidate.nflTeam) === normalizeTeam(report.team)
        : rosterMatches.length === 1,
    );
    if (!player) continue;
    const key = `${normalizePlayerName(report.fullName)}\u0000${report.team}`;
    matched.set(key, {
      playerName: player.name,
      team: report.team,
      position: report.position,
      week,
      reportStatus: report.reportStatus,
      reportInjury: report.reportInjury,
      practiceStatus: report.practiceStatus,
      practiceInjury: report.practiceInjury,
    });
  }
  return [...matched.values()].slice(0, 100);
}

/** Coalesce requests and cache one season snapshot; the source updates at most daily in season. */
export class NFLInjuryReportCache {
  private readonly entries = new Map<
    number,
    { snapshot: NFLInjuryReportSnapshot; expiresAt: number }
  >();
  private readonly pending = new Map<number, Promise<NFLInjuryReportSnapshot>>();

  constructor(
    private readonly load: (
      season: number,
    ) => Promise<NFLInjuryReportRow[]> = fetchNFLInjuryReports,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = defaultCacheMs,
  ) {}

  async get(season: number): Promise<NFLInjuryReportSnapshot> {
    const cached = this.entries.get(season);
    if (cached && cached.expiresAt > this.now()) return structuredClone(cached.snapshot);
    const inFlight = this.pending.get(season);
    if (inFlight) return structuredClone(await inFlight);
    const request = Promise.resolve()
      .then(() => this.load(season))
      .then((rows) => {
        const snapshot = {
          rows: rows.slice(0, 10_000),
          retrievedAt: new Date(this.now()).toISOString(),
          sourceUrl: nflInjuryReportUrl(season),
        };
        this.entries.set(season, { snapshot, expiresAt: this.now() + this.ttlMs });
        return snapshot;
      })
      .finally(() => {
        if (this.pending.get(season) === request) this.pending.delete(season);
      });
    this.pending.set(season, request);
    return structuredClone(await request);
  }
}

function hasAvailabilityEvidence(report: NFLInjuryReportRow): boolean {
  const practiceStatus = report.practiceStatus.toLowerCase();
  const hasPracticeSignal =
    practiceStatus &&
    !practiceStatus.includes('full participation') &&
    !practiceStatus.includes('not injury related');
  return !!(
    report.reportStatus ||
    report.reportInjury ||
    hasPracticeSignal ||
    report.practiceInjury
  );
}

function injuryDescription(...parts: string[]): string {
  return bounded(
    parts
      .map((part) => part.trim())
      .filter((part) => part && !part.toLowerCase().includes('not injury related'))
      .join('; '),
    160,
  );
}

function normalizePlayerName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeTeam(value: string): string {
  const team = value.trim().toUpperCase();
  return ({ JAX: 'JAC', WSH: 'WAS' } as Record<string, string>)[team] ?? team;
}

function bounded(value: string, maximum: number): string {
  return value.trim().slice(0, maximum);
}

function boundedInteger(value: string, minimum: number, maximum: number): number | undefined {
  if (!/^\d{1,4}$/.test(value.trim())) return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : undefined;
}

function rowValue(row: string[], headers: Map<string, number>, field: string): string {
  const index = headers.get(field);
  return index === undefined ? '' : (row[index] ?? '');
}

/** A small RFC 4180 reader keeps quoted commas/newlines and doubled quotes intact. */
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (quoted) throw new Error('NFL injury report contained malformed CSV.');
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
