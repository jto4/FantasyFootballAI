import { describe, expect, it } from 'vitest';
import type { AppSettings, MemberMemory } from '@sidekick/core';
import {
  isValidMemberLeagueIds,
  memberContextForChatReply,
  memberContextForReport,
  shouldAnalyzeImportedMessages,
  splitMemoryAnalysis,
} from './privacy.js';

const settings = {
  memoryEnabled: true,
  analyzeImportsWithAI: false,
  includeMemberContextInReports: false,
} satisfies Pick<
  AppSettings,
  'memoryEnabled' | 'analyzeImportsWithAI' | 'includeMemberContextInReports'
>;

const memory = {
  id: 'member-1',
  name: 'League mate',
  sourceName: 'messages.txt',
  importedAt: '2026-09-23T00:00:00Z',
  sourceText: 'private imported conversation',
  styleNotes: 'uses short sentences',
  contextNotes: 'likes the Lions',
  banterPreference: 'keep it playful',
  avoidTopics: 'work',
  includeInReports: true,
} satisfies MemberMemory;

describe('AI privacy controls', () => {
  it('validates league assignments at the profile update boundary', () => {
    expect(isValidMemberLeagueIds(undefined)).toBe(true);
    expect(isValidMemberLeagueIds(null)).toBe(true);
    expect(isValidMemberLeagueIds(['league-a', 'league-b'])).toBe(true);
    expect(isValidMemberLeagueIds(['league-a', 'league-a'])).toBe(false);
    expect(isValidMemberLeagueIds([''])).toBe(false);
    expect(isValidMemberLeagueIds(['x'.repeat(201)])).toBe(false);
    expect(isValidMemberLeagueIds(Array.from({ length: 101 }, (_, index) => String(index)))).toBe(
      false,
    );
    expect(isValidMemberLeagueIds('league-a')).toBe(false);
  });

  it('keeps import analysis disabled unless explicitly enabled', () => {
    expect(shouldAnalyzeImportedMessages(settings)).toBe(false);
    expect(shouldAnalyzeImportedMessages({ ...settings, analyzeImportsWithAI: true })).toBe(true);
    expect(
      shouldAnalyzeImportedMessages({
        ...settings,
        memoryEnabled: false,
        analyzeImportsWithAI: true,
      }),
    ).toBe(false);
  });

  it('omits all member notes from report context unless explicitly enabled', () => {
    expect(memberContextForReport(settings, [memory])).toBe('disabled by owner');
    expect(
      memberContextForReport(
        { ...settings, memoryEnabled: false, includeMemberContextInReports: true },
        [memory],
      ),
    ).toBe('disabled by owner');
    const included = memberContextForReport({ ...settings, includeMemberContextInReports: true }, [
      memory,
    ]);
    expect(included).toContain('uses short sentences');
    expect(included).toContain('likes the Lions');
    expect(included).toContain('keep it playful');
    expect(included).toContain('work');
    expect(included).not.toContain('private imported conversation');
    const bounded = JSON.parse(
      memberContextForReport({ ...settings, includeMemberContextInReports: true }, [
        { ...memory, avoidTopics: 'x'.repeat(1_200) },
      ]),
    ) as { profiles: { avoidTopics: string }[] };
    expect(bounded.profiles[0]?.avoidTopics).toHaveLength(1000);
  });

  it('requires a separate explicit opt-in before chat replies can include member notes', () => {
    expect(memberContextForChatReply(settings, [memory])).toBe('disabled by owner');
    const reportOnlySettings = { ...settings, includeMemberContextInReports: true };
    expect(memberContextForChatReply(reportOnlySettings, [memory])).toBe('disabled by owner');
    const included = memberContextForChatReply(
      { ...settings, includeMemberContextInChatReplies: true },
      [memory],
    );
    expect(included).toContain('uses short sentences');
    expect(included).toContain('work');
    expect(
      memberContextForChatReply(
        { ...settings, memoryEnabled: false, includeMemberContextInChatReplies: true },
        [memory],
      ),
    ).toBe('disabled by owner');
  });

  it('separates style and context notes and bounds the saved fields', () => {
    expect(
      splitMemoryAnalysis('Writing style:\nShort, dry jokes.\nLeague context:\nFollows the Lions.'),
    ).toEqual({ styleNotes: 'Short, dry jokes.', contextNotes: 'Follows the Lions.' });
    expect(splitMemoryAnalysis('unstructured response').contextNotes).toBe('');
    expect(
      splitMemoryAnalysis(`Writing style:\n${'x'.repeat(5000)}\nLeague context:\nLions`).styleNotes,
    ).toHaveLength(4000);
  });

  it('omits profiles that the owner excluded from report prompts', () => {
    const excluded = memberContextForReport({ ...settings, includeMemberContextInReports: true }, [
      { ...memory, includeInReports: false },
      {
        ...memory,
        id: 'member-2',
        name: 'Included member',
        styleNotes: 'included profile style',
      },
    ]);
    expect(excluded).not.toContain('League mate');
    expect(excluded).not.toContain('private imported conversation');
    expect(excluded).toContain('Included member');
    expect(excluded).toContain('included profile style');
  });

  it('limits assigned member profiles to the selected league', () => {
    const leagueScoped = { ...memory, leagueIds: ['league-a'] };
    const otherLeague = {
      ...memory,
      id: 'member-2',
      name: 'Other league member',
      leagueIds: ['league-b'],
    };
    const noLeague = { ...memory, id: 'member-3', name: 'Unassigned member', leagueIds: [] };
    const prompt = memberContextForReport(
      { ...settings, includeMemberContextInReports: true },
      [leagueScoped, otherLeague, noLeague],
      'league-a',
    );
    expect(prompt).toContain('League mate');
    expect(prompt).not.toContain('Other league member');
    expect(prompt).not.toContain('Unassigned member');
  });

  it('bounds total report context and tells the model when profiles were omitted', () => {
    const manyProfiles: MemberMemory[] = Array.from({ length: 12 }, (_, index) => ({
      ...memory,
      id: `member-${index}`,
      name: `Member ${index}`,
      styleNotes: 's'.repeat(4000),
      contextNotes: 'c'.repeat(4000),
      banterPreference: 'b'.repeat(1000),
      avoidTopics: 'a'.repeat(1000),
    }));

    const prompt = memberContextForReport(
      { ...settings, includeMemberContextInReports: true },
      manyProfiles,
      'league-a',
    );

    expect(prompt.length).toBeLessThanOrEqual(32_000);
    const included = JSON.parse(prompt) as {
      profiles: { name: string }[];
      omittedProfiles: number;
      note: string;
    };
    expect(included.profiles.length).toBeGreaterThan(0);
    expect(included.omittedProfiles).toBeGreaterThan(0);
    expect(included.note).toContain('Do not assume missing profiles have no preferences');
  });

  it('keeps profiles without an explicit scope available to legacy reports', () => {
    const prompt = memberContextForReport({ ...settings, includeMemberContextInReports: true }, [
      memory,
      { ...memory, id: 'member-2', name: 'Scoped elsewhere', leagueIds: ['league-b'] },
    ]);
    expect(prompt).toContain('League mate');
    expect(prompt).toContain('Scoped elsewhere');
  });
});
