import { createHash } from 'node:crypto';
import type { PlayerProjection } from '@sidekick/core';

export type ProjectionImportRow = {
  playerId?: string;
  playerName: string;
  position?: string;
  nflTeam?: string;
  projectedPoints: number;
  averageDraftPosition?: number;
  week?: number;
};

export interface ProjectionSourceSummary {
  leagueId: string;
  sourceId: string;
  count: number;
  adpCount: number;
  scoringMatched: boolean;
  sourceName: string;
  sourceUrl?: string;
  importedAt: string;
}

/** Keep the owner-visible source identity stable for rows imported before source IDs existed. */
export function projectionSourceId(
  projection: Pick<PlayerProjection, 'sourceId' | 'sourceName' | 'sourceUrl'>,
): string {
  return (
    projection.sourceId ??
    `legacy-${createHash('sha256')
      .update(
        `${normalizeProjectionSourceName(projection.sourceName)}\u0000${projection.sourceUrl ?? ''}`,
      )
      .digest('hex')}`
  );
}

export function normalizeProjectionSourceName(value: string): string {
  return value.trim().toLowerCase();
}

/** Summarize imported source sets without implying confirmation for legacy or mixed rows. */
export function summarizeProjectionSources(
  projections: readonly PlayerProjection[],
): ProjectionSourceSummary[] {
  const summaries = new Map<string, ProjectionSourceSummary>();
  for (const projection of projections) {
    const sourceId = projectionSourceId(projection);
    const key = `${projection.leagueId}\u0000${sourceId}`;
    const summary = summaries.get(key) ?? {
      leagueId: projection.leagueId,
      sourceId,
      count: 0,
      adpCount: 0,
      scoringMatched: true,
      sourceName: projection.sourceName,
      ...(projection.sourceUrl ? { sourceUrl: projection.sourceUrl } : {}),
      importedAt: projection.importedAt,
    };
    summary.count += 1;
    summary.scoringMatched = summary.scoringMatched && projection.scoringMatched === true;
    if (projection.averageDraftPosition !== undefined) summary.adpCount += 1;
    summaries.set(key, summary);
  }
  return [...summaries.values()].sort((left, right) =>
    right.importedAt.localeCompare(left.importedAt),
  );
}

const maxProjectionCsvBytes = 250_000;
const maxProjectionRows = 5_000;

/** Parse an owner-provided projection CSV without executing or fetching its contents. */
export function parseProjectionCsv(csv: string): ProjectionImportRow[] {
  if (Buffer.byteLength(csv, 'utf8') > maxProjectionCsvBytes)
    throw new Error('Projection CSV exceeds the 250 KB import limit.');
  const rows = parseCsvRows(csv.replace(/^\uFEFF/, ''));
  const header = rows.shift()?.map((column) => normalizeHeader(column));
  if (!header?.length) throw new Error('Projection CSV is empty.');
  if (new Set(header).size !== header.length)
    throw new Error('Projection CSV has duplicate columns.');

  const playerNameIndex = findColumn(header, ['player', 'playername', 'name']);
  const projectedPointsIndex = findColumn(header, [
    'projectedpoints',
    'projection',
    'fantasypoints',
    'points',
  ]);
  if (playerNameIndex < 0 || projectedPointsIndex < 0)
    throw new Error('CSV needs a player/name column and a projectedPoints/points column.');
  const playerIdIndex = findColumn(header, ['playerid', 'id']);
  const positionIndex = findColumn(header, ['position', 'pos']);
  const nflTeamIndex = findColumn(header, ['nflteam', 'team', 'teamabbr']);
  const weekIndex = findColumn(header, ['week', 'nflweek']);
  const adpIndex = findColumn(header, ['adp', 'averagedraftposition', 'avgdraftposition']);
  const parsed: ProjectionImportRow[] = [];
  const seen = new Set<string>();

  for (const [index, row] of rows.entries()) {
    if (row.every((cell) => cell.trim() === '')) continue;
    if (parsed.length >= maxProjectionRows)
      throw new Error(
        `Projection CSV exceeds the ${maxProjectionRows.toLocaleString()} player limit.`,
      );
    const rowNumber = index + 2;
    if (row.length !== header.length)
      throw new Error(`Row ${rowNumber}: CSV column count does not match the header.`);
    const playerName = row[playerNameIndex]?.trim() ?? '';
    if (!playerName || playerName.length > 120 || /[\u0000-\u001f\u007f]/.test(playerName))
      throw new Error(`Row ${rowNumber}: player name is missing or invalid.`);
    const pointsText = row[projectedPointsIndex]?.trim() ?? '';
    const projectedPoints = Number(pointsText);
    if (
      !pointsText ||
      !Number.isFinite(projectedPoints) ||
      projectedPoints < 0 ||
      projectedPoints > 3000
    )
      throw new Error(`Row ${rowNumber}: projected points must be a number from 0 to 3000.`);
    const playerId = optionalCell(row, playerIdIndex, 100, rowNumber, 'player ID');
    const position = optionalCell(row, positionIndex, 20, rowNumber, 'position');
    const nflTeam = optionalCell(row, nflTeamIndex, 10, rowNumber, 'NFL team');
    const weekText = optionalCell(row, weekIndex, 2, rowNumber, 'week');
    const week = weekText === undefined ? undefined : Number(weekText);
    if (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 30))
      throw new Error(`Row ${rowNumber}: week must be an integer from 1 to 30.`);
    const adpText = optionalCell(row, adpIndex, 12, rowNumber, 'average draft position');
    const averageDraftPosition = adpText === undefined ? undefined : Number(adpText);
    if (
      averageDraftPosition !== undefined &&
      (!Number.isFinite(averageDraftPosition) ||
        averageDraftPosition < 1 ||
        averageDraftPosition > 600)
    )
      throw new Error(`Row ${rowNumber}: average draft position must be a number from 1 to 600.`);
    const period = week === undefined ? 'season' : `week:${week}`;
    const identity = `${period}:${playerId ? `id:${playerId}` : `name:${normalizePlayerName(playerName)}`}`;
    if (seen.has(identity))
      throw new Error(`Row ${rowNumber}: duplicate player in projection CSV.`);
    seen.add(identity);
    parsed.push({
      ...(playerId ? { playerId } : {}),
      playerName,
      ...(position ? { position: position.toUpperCase() } : {}),
      ...(nflTeam ? { nflTeam: nflTeam.toUpperCase() } : {}),
      projectedPoints,
      ...(averageDraftPosition !== undefined ? { averageDraftPosition } : {}),
      ...(week !== undefined ? { week } : {}),
    });
  }
  if (!parsed.length) throw new Error('Projection CSV has no player rows.');
  return parsed;
}

export function isValidProjectionSourceUrl(value: unknown): value is string | undefined {
  if (value === undefined || value === '') return true;
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let afterQuote = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        cell += character;
      }
      continue;
    }
    if (
      afterQuote &&
      character !== ',' &&
      character !== '\r' &&
      character !== '\n' &&
      character !== ' ' &&
      character !== '\t'
    )
      throw new Error('Projection CSV has malformed quoting.');
    if (character === '"') {
      if (cell !== '' || afterQuote) throw new Error('Projection CSV has malformed quoting.');
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
      afterQuote = false;
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((part) => part.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      afterQuote = false;
    } else if (!afterQuote) {
      cell += character;
    }
  }
  if (quoted) throw new Error('Projection CSV has an unclosed quoted field.');
  if (cell !== '' || row.length) {
    row.push(cell);
    if (row.some((part) => part.trim() !== '')) rows.push(row);
  }
  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findColumn(header: string[], aliases: string[]): number {
  return header.findIndex((column) => aliases.includes(column));
}

function optionalCell(
  row: string[],
  index: number,
  maxLength: number,
  rowNumber: number,
  label: string,
): string | undefined {
  if (index < 0) return undefined;
  const value = row[index]?.trim() ?? '';
  if (!value) return undefined;
  if (value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value))
    throw new Error(`Row ${rowNumber}: ${label} is invalid.`);
  return value;
}

function normalizePlayerName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
