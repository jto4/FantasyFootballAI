import type { AppSettings, MemberMemory } from '@sidekick/core';

const MAX_MEMBER_CONTEXT_CHARACTERS = 32_000;
const MAX_MEMBER_CONTEXT_PROFILES = 100;

/** Undefined/null means every league; an explicit list scopes the profile to those IDs. */
export function isValidMemberLeagueIds(value: unknown): value is string[] | null | undefined {
  if (value === undefined || value === null) return true;
  if (!Array.isArray(value) || value.length > 100) return false;
  return (
    new Set(value).size === value.length &&
    value.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 200)
  );
}

/** Imported message text must not cross the AI boundary without a saved opt-in. */
export function shouldAnalyzeImportedMessages(
  settings: Pick<AppSettings, 'memoryEnabled' | 'analyzeImportsWithAI'>,
): boolean {
  return settings.memoryEnabled === true && settings.analyzeImportsWithAI === true;
}

/** Keep profile data out of report prompts unless the owner explicitly enables it. */
export function memberContextForReport(
  settings: Pick<AppSettings, 'memoryEnabled' | 'includeMemberContextInReports'>,
  memories: MemberMemory[],
  leagueId?: string,
): string {
  return memberContextForAI(
    settings.memoryEnabled === true && settings.includeMemberContextInReports === true,
    memories,
    leagueId,
  );
}

/** Keep report sharing and group-chat sharing as separate owner-controlled opt-ins. */
export function memberContextForChatReply(
  settings: Pick<AppSettings, 'memoryEnabled' | 'includeMemberContextInChatReplies'>,
  memories: MemberMemory[],
  leagueId?: string,
): string {
  return memberContextForAI(
    settings.memoryEnabled === true && settings.includeMemberContextInChatReplies === true,
    memories,
    leagueId,
  );
}

function memberContextForAI(enabled: boolean, memories: MemberMemory[], leagueId?: string): string {
  if (!enabled) return 'disabled by owner';
  const eligible = memories
    .filter((memory) => memory.includeInReports !== false)
    .filter(
      (memory) =>
        leagueId === undefined ||
        memory.leagueIds === undefined ||
        (Array.isArray(memory.leagueIds) && memory.leagueIds.includes(leagueId)),
    );
  const profiles = eligible
    .slice(0, MAX_MEMBER_CONTEXT_PROFILES)
    .map(({ name, styleNotes, contextNotes, banterPreference, avoidTopics }) => ({
      name: typeof name === 'string' ? name.slice(0, 100) : '',
      styleNotes: typeof styleNotes === 'string' ? styleNotes.slice(0, 4000) : '',
      contextNotes: typeof contextNotes === 'string' ? contextNotes.slice(0, 4000) : '',
      banterPreference: typeof banterPreference === 'string' ? banterPreference.slice(0, 1000) : '',
      avoidTopics: typeof avoidTopics === 'string' ? avoidTopics.slice(0, 1000) : '',
    }));
  const included: typeof profiles = [];
  const serializeContext = (omitted: number): string =>
    JSON.stringify({
      profiles: included,
      ...(omitted > 0
        ? {
            omittedProfiles: omitted,
            note: 'Some eligible profiles were omitted to keep report context bounded. Do not assume missing profiles have no preferences.',
          }
        : {}),
    });

  for (const profile of profiles) {
    included.push(profile);
    if (
      serializeContext(eligible.length - included.length).length > MAX_MEMBER_CONTEXT_CHARACTERS
    ) {
      included.pop();
      break;
    }
  }
  return serializeContext(eligible.length - included.length);
}

/** Convert the requested labeled AI response into the profile's separate editable fields. */
export function splitMemoryAnalysis(text: string): { styleNotes: string; contextNotes: string } {
  const styleHeading = /^\s*(?:#{1,3}\s*)?writing style\s*:?\s*$/im;
  const contextHeading = /^\s*(?:#{1,3}\s*)?league context\s*:?\s*$/im;
  const styleMatch = styleHeading.exec(text);
  const contextMatch = contextHeading.exec(text);
  if (!styleMatch || !contextMatch || styleMatch.index >= contextMatch.index) {
    return { styleNotes: text.slice(0, 4000), contextNotes: '' };
  }
  return {
    styleNotes: text
      .slice(styleMatch.index + styleMatch[0].length, contextMatch.index)
      .trim()
      .slice(0, 4000),
    contextNotes: text
      .slice(contextMatch.index + contextMatch[0].length)
      .trim()
      .slice(0, 4000),
  };
}
