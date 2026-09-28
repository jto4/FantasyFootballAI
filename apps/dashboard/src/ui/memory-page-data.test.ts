import { describe, expect, it } from 'vitest';
import {
  isProjectionSummaryList,
  isReceivedEmailList,
  isSavedMemoryList,
} from './memory-page-data.js';

const importedAt = '2026-09-28T09:00:00.000Z';

describe('Members & Imports response validation', () => {
  it('accepts empty and well-formed member profile lists', () => {
    expect(isSavedMemoryList([])).toBe(true);
    expect(
      isSavedMemoryList([
        {
          id: 'member-1',
          name: 'League Member',
          sourceName: 'conversation.txt',
          importedAt,
          sourceLength: 840,
          styleNotes: 'Dry humor.',
          contextNotes: 'Lions fan.',
          includeInReports: true,
          leagueIds: ['league-1'],
          canMergeImportedConversation: false,
        },
      ]),
    ).toBe(true);
  });

  it('rejects malformed profile arrays instead of treating them as an empty library', () => {
    expect(isSavedMemoryList({ memories: [] })).toBe(false);
    expect(isSavedMemoryList([null])).toBe(false);
    expect(
      isSavedMemoryList([
        {
          id: 'member-1',
          name: 'League Member',
          sourceName: 'conversation.txt',
          importedAt,
          sourceLength: 'large',
          styleNotes: '',
          contextNotes: '',
        },
      ]),
    ).toBe(false);
  });

  it('validates projection summaries including source URLs and counts', () => {
    expect(
      isProjectionSummaryList([
        {
          leagueId: 'league-1',
          sourceId: 'source-1',
          count: 20,
          adpCount: 18,
          scoringMatched: true,
          sourceName: 'Projections',
          sourceUrl: 'https://example.com/projections.csv',
          importedAt,
        },
      ]),
    ).toBe(true);
    expect(
      isProjectionSummaryList([
        {
          leagueId: 'league-1',
          sourceId: 'source-1',
          count: -1,
          adpCount: 18,
          sourceName: 'Projections',
          sourceUrl: 'javascript:alert(1)',
          importedAt,
        },
      ]),
    ).toBe(false);
  });

  it('validates received email records before rendering the inbox list', () => {
    expect(
      isReceivedEmailList([
        {
          id: 'email-1',
          from: 'manager@example.com',
          subject: 'Week 1',
          createdAt: importedAt,
          imported: false,
        },
      ]),
    ).toBe(true);
    expect(isReceivedEmailList({ emails: [] })).toBe(false);
    expect(
      isReceivedEmailList([
        { id: 'email-1', from: 'manager@example.com', subject: 'Week 1', imported: 'no' },
      ]),
    ).toBe(false);
  });
});
