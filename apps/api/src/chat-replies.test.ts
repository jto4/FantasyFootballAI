import { describe, expect, it, vi } from 'vitest';
import {
  defaultActionSettings,
  type AIProvider,
  type AIRequest,
  type AppSettings,
  type LeagueConnection,
  type MemberMemory,
} from '@sidekick/core';
import { buildMentionReplyDrafts, type IncomingChatMessage } from './chat-replies.js';

const league: LeagueConnection = {
  id: 'league-1',
  platform: 'sleeper',
  name: 'league',
  displayName: 'Sunday League',
  teamCount: 2,
  scoring: { pass_td: 4 },
  settings: {},
  teams: [{ id: 'a', name: 'Bad Decisions FC' }],
  connectedAt: '2026-09-01T00:00:00Z',
};

const memory: MemberMemory = {
  id: 'member-1',
  name: 'League mate',
  sourceName: 'messages.txt',
  importedAt: '2026-09-01T00:00:00Z',
  sourceText: 'private imported messages',
  styleNotes: 'uses short sentences',
  contextNotes: 'likes the Lions',
  includeInReports: true,
};

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    actions: structuredClone(defaultActionSettings),
    writingStyle: 'Dry and funny',
    reportLength: 'short',
    allowProfanity: true,
    excludedTopics: 'family health',
    memoryEnabled: true,
    analyzeImportsWithAI: false,
    includeMemberContextInReports: false,
    includeMemberContextInChatReplies: false,
    imessageAutoSyncEnabled: false,
    imessageSyncIntervalMinutes: 15,
    chatRepliesEnabled: true,
    chatAgentName: 'Sunday Sidekick',
    chatReplyLeagueId: league.id,
    imessageChatGuid: 'chat-guid',
    ...overrides,
  };
}

function incoming(count: number): IncomingChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `bb:message-${index}`,
    text: '@Sunday Sidekick, roast my lineup',
    author: `Member ${index}`,
    fromMe: false,
  }));
}

describe('group chat reply drafts', () => {
  it('stays disabled by default and does not initialize the AI runtime', async () => {
    const getAI = vi.fn(async () => null);
    const drafts = await buildMentionReplyDrafts(
      {
        settings: settings({ chatRepliesEnabled: false }),
        leagues: [league],
        memories: [],
        reports: [],
      },
      incoming(1),
      'imessage',
      getAI,
    );
    expect(drafts).toEqual([]);
    expect(getAI).not.toHaveBeenCalled();
  });

  it('generates review-only replies from direct mentions using the selected league and style', async () => {
    const generate = vi.fn(
      async (_request: AIRequest) => 'Your bench has a higher ceiling than your starters.',
    );
    const ai: AIProvider = { id: 'fixture', generate };
    const drafts = await buildMentionReplyDrafts(
      {
        settings: settings({ channelBoundaries: { email: 'work', imessage: 'politics' } }),
        leagues: [league],
        memories: [],
        reports: [],
      },
      [
        {
          id: 'ordinary',
          text: 'That Sunday Sidekick was right last week',
          author: 'A',
          fromMe: false,
        },
        { id: 'mine', text: '@Sunday Sidekick, roast me', author: 'Owner', fromMe: true },
        ...incoming(1),
      ],
      'imessage',
      ai,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      kind: 'chat-reply',
      leagueId: league.id,
      replyChannel: 'imessage',
      replyDestination: 'chat-guid',
      sourceMessageId: 'bb:message-0',
      status: 'draft',
      body: 'Your bench has a higher ceiling than your starters.',
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0].system).toContain('Profanity is allowed');
    expect(generate.mock.calls[0]?.[0].system).toContain(
      'Additional topics to avoid on imessage: politics',
    );
    expect(generate.mock.calls[0]?.[0].system).not.toContain(
      'Additional topics to avoid on imessage: work',
    );
    expect(generate.mock.calls[0]?.[0].system).toContain('boundaries as excluded subjects only');
    expect(generate.mock.calls[0]?.[0].prompt).toContain('Dry and funny');
    expect(generate.mock.calls[0]?.[0].prompt).toContain('Sunday League');
  });

  it('deduplicates, bounds drafts to three, and leaves disabled replies untouched', async () => {
    const generate = vi.fn(async (_request: AIRequest) => 'Short response');
    const existing = {
      id: 'old',
      leagueId: league.id,
      kind: 'chat-reply' as const,
      createdAt: '2026-09-01T00:00:00Z',
      title: 'Prior reply',
      body: 'Already drafted',
      citations: [],
      status: 'draft' as const,
      sourceMessageId: 'bb:message-0',
      replyChannel: 'imessage' as const,
    };
    const drafts = await buildMentionReplyDrafts(
      { settings: settings(), leagues: [league], memories: [], reports: [existing] },
      incoming(5),
      'imessage',
      { id: 'fixture', generate },
    );
    expect(drafts).toHaveLength(3);
    expect(drafts.map((draft) => draft.sourceMessageId)).toEqual([
      'bb:message-1',
      'bb:message-2',
      'bb:message-3',
    ]);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it('uses only the SMS boundary for Twilio group reply drafts', async () => {
    const generate = vi.fn(async (_request: AIRequest) => 'Check your flex options.');
    await buildMentionReplyDrafts(
      {
        settings: settings({
          smsRecipient: `CH${'a'.repeat(32)}`,
          channelBoundaries: { sms: 'work', imessage: 'politics' },
        }),
        leagues: [league],
        memories: [],
        reports: [],
      },
      incoming(1),
      'sms',
      { id: 'fixture', generate },
    );
    const system = generate.mock.calls[0]?.[0].system ?? '';
    expect(system).toContain('Additional topics to avoid on sms: work');
    expect(system).not.toContain('politics');
  });

  it('keeps report memory sharing separate from group-chat memory sharing', async () => {
    const generate = vi.fn(async (_request: AIRequest) => 'Check your flex options.');
    const state = {
      settings: settings({ includeMemberContextInReports: true }),
      leagues: [league],
      memories: [memory],
      reports: [],
    };
    await buildMentionReplyDrafts(state, incoming(1), 'imessage', { id: 'fixture', generate });
    expect(generate.mock.calls[0]?.[0].prompt).toContain(
      'Member notes (owner-controlled): disabled by owner',
    );

    await buildMentionReplyDrafts(
      {
        ...state,
        settings: settings({ includeMemberContextInChatReplies: true }),
      },
      incoming(1),
      'imessage',
      { id: 'fixture', generate },
    );
    expect(generate.mock.calls[1]?.[0].prompt).toContain('uses short sentences');
    expect(generate.mock.calls[1]?.[0].prompt).not.toContain('private imported messages');
  });

  it('rejects chat replies without a configured group or AI runtime', async () => {
    await expect(
      buildMentionReplyDrafts(
        {
          settings: settings({ imessageChatGuid: '' }),
          leagues: [league],
          memories: [],
          reports: [],
        },
        incoming(1),
        'imessage',
        { id: 'fixture', generate: async () => 'Reply' },
      ),
    ).rejects.toThrow('matching group chat destination');
    await expect(
      buildMentionReplyDrafts(
        { settings: settings(), leagues: [league], memories: [], reports: [] },
        incoming(1),
        'imessage',
        null,
      ),
    ).rejects.toThrow('Configure an AI runtime');
  });
});
