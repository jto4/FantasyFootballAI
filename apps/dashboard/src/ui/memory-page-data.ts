import type { MemberMemory } from '@sidekick/core';

export type SavedMemory = Omit<MemberMemory, 'sourceText' | 'sourceAuthorId'> & {
  sourceLength: number;
  canMergeImportedConversation?: boolean;
};

export type ProjectionSummary = {
  leagueId: string;
  sourceId: string;
  count: number;
  adpCount: number;
  scoringMatched?: boolean;
  sourceName: string;
  sourceUrl?: string;
  importedAt: string;
};

export type ReceivedEmail = {
  id: string;
  from: string;
  subject: string;
  createdAt: string;
  imported: boolean;
};

export function isSavedMemoryList(value: unknown): value is SavedMemory[] {
  return Array.isArray(value) && value.every(isSavedMemory);
}

export function isProjectionSummaryList(value: unknown): value is ProjectionSummary[] {
  return Array.isArray(value) && value.every(isProjectionSummary);
}

export function isReceivedEmailList(value: unknown): value is ReceivedEmail[] {
  return Array.isArray(value) && value.every(isReceivedEmail);
}

function isSavedMemory(value: unknown): value is SavedMemory {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.sourceName === 'string' &&
    isTimestamp(value.importedAt) &&
    Number.isSafeInteger(value.sourceLength) &&
    (value.sourceLength as number) >= 0 &&
    typeof value.styleNotes === 'string' &&
    typeof value.contextNotes === 'string' &&
    optionalString(value.updatedAt) &&
    optionalString(value.banterPreference) &&
    optionalString(value.avoidTopics) &&
    optionalBoolean(value.includeInReports) &&
    optionalBoolean(value.canMergeImportedConversation) &&
    (value.leagueIds === undefined ||
      (Array.isArray(value.leagueIds) && value.leagueIds.every((id) => typeof id === 'string')))
  );
}

function isProjectionSummary(value: unknown): value is ProjectionSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.leagueId === 'string' &&
    typeof value.sourceId === 'string' &&
    nonNegativeInteger(value.count) &&
    nonNegativeInteger(value.adpCount) &&
    typeof value.sourceName === 'string' &&
    isTimestamp(value.importedAt) &&
    optionalBoolean(value.scoringMatched) &&
    optionalHttpUrl(value.sourceUrl)
  );
}

function isReceivedEmail(value: unknown): value is ReceivedEmail {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.from === 'string' &&
    typeof value.subject === 'string' &&
    isTimestamp(value.createdAt) &&
    typeof value.imported === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function optionalHttpUrl(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'string' || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
