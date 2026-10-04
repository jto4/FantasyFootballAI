import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { AppSettings, AIProvider, SavedReport } from '@sidekick/core';
import {
  fetchBlueBubblesMessages,
  fetchTwilioConversationMessages,
  isBlueBubblesConfigured,
  type BlueBubblesMessage,
} from '@sidekick/integrations';
import type { LocalStore } from './store.js';
import type { CredentialProvider } from './credentials.js';
import { parseSecret } from './provider-config.js';
import { groupChatSyncBlockReason } from './group-chat-sync-guard.js';
import { assertChatReplyConsent } from './chat-reply-consent.js';
import { shouldAnalyzeImportedMessages } from './privacy.js';
import {
  blueBubblesCursorAfterHistory,
  blueBubblesMemorySource,
  mergeBlueBubblesHistory,
  unseenBlueBubblesMessages,
} from './bluebubbles-memory.js';
import {
  canReplyToTwilioMentions,
  messagesAfterTwilioCursor,
  mergeTwilioConversationHistory,
  nextTwilioConversationCursor,
  twilioConversationMemorySource,
  unseenTwilioConversationMessages,
} from './twilio-conversation-memory.js';
import { buildMentionReplyDrafts } from './chat-replies.js';
import { analyzeGroupChatMembers } from './group-chat-analysis.js';
type SyncStatus = { lastCheckedAt?: string; lastAddedMessages?: number; lastError?: string };
export interface ChatSyncDependencies {
  store: LocalStore;
  readCredential: (provider: CredentialProvider) => Promise<string | null>;
  configuredAI: (settings: AppSettings) => Promise<AIProvider | null>;
  autoSendChatReplyDrafts: (drafts: SavedReport[]) => Promise<number>;
  blueBubblesAutoSyncToken: string;
  twilioConversationAutoSyncToken: string;
  blueBubblesAutoSyncStatus: SyncStatus;
  twilioConversationAutoSyncStatus: SyncStatus;
  claims: { imessage: boolean; twilio: boolean };
}
export function createChatSyncRouter(dependencies: ChatSyncDependencies) {
  const {
    store,
    readCredential,
    configuredAI,
    autoSendChatReplyDrafts,
    blueBubblesAutoSyncToken,
    twilioConversationAutoSyncToken,
    blueBubblesAutoSyncStatus,
    twilioConversationAutoSyncStatus,
    claims,
  } = dependencies;
  const router = Router();
  router.post('/api/memory/imessage-sync', async (_req, res) => {
    const isBackgroundPoll =
      _req.get('x-sidekick-internal-sync-token') === blueBubblesAutoSyncToken;
    if (claims.imessage && !isBackgroundPoll)
      return res.status(409).json({ error: 'An iMessage sync is already running.' });
    if (!isBackgroundPoll) {
      claims.imessage = true;
      res.once('finish', () => {
        claims.imessage = false;
      });
    }
    const state = store.snapshot();
    const { memoryEnabled } = state.settings;
    if (!memoryEnabled)
      return res.status(409).json({ error: 'Enable member memory in Settings before syncing.' });
    const chatGuid = state.settings.imessageChatGuid?.trim();
    if (!chatGuid)
      return res.status(409).json({ error: 'Set an iMessage group chat ID in Settings.' });
    const config = parseSecret(await readCredential('bluebubbles'));
    if (!isBlueBubblesConfigured(config))
      return res.status(409).json({ error: 'Configure a valid BlueBubbles server in Settings.' });

    let history: BlueBubblesMessage[];
    try {
      history = await fetchBlueBubblesMessages(
        config.serverUrl as string,
        config.serverPassword as string,
        chatGuid,
        200,
      );
    } catch (error) {
      return res.status(502).json({
        error: error instanceof Error ? error.message : 'Could not retrieve iMessage history.',
      });
    }

    const syncState = store.snapshot();
    const blockedAfterFetch = groupChatSyncBlockReason(
      syncState.settings,
      'imessage',
      chatGuid,
      isBackgroundPoll,
    );
    if (blockedAfterFetch) return res.status(409).json({ error: blockedAfterFetch });

    const cursor =
      state.settings.imessageSyncCursor?.chatGuid === chatGuid
        ? state.settings.imessageSyncCursor
        : undefined;
    const newMessages = unseenBlueBubblesMessages(history, cursor);
    const ownerName = state.settings.imessageOwnerName?.trim() || 'League owner';
    const memberGroups = new Map<
      string,
      { authorId: string; name: string; messages: BlueBubblesMessage[] }
    >();
    for (const message of newMessages) {
      const participant = message.isFromMe ? 'owner' : message.author;
      if (!participant) continue;
      const authorId = `${chatGuid}\u0000${participant}`;
      const name = message.isFromMe ? ownerName : participant;
      const group = memberGroups.get(authorId) ?? { authorId, name, messages: [] };
      group.messages.push(message);
      memberGroups.set(authorId, group);
    }

    const analysisState = store.snapshot();
    const blockedBeforeAnalysis = groupChatSyncBlockReason(
      analysisState.settings,
      'imessage',
      chatGuid,
      isBackgroundPoll,
    );
    if (blockedBeforeAnalysis) return res.status(409).json({ error: blockedBeforeAnalysis });
    const groupAnalysis = await analyzeGroupChatMembers({
      initialSettings: analysisState.settings,
      currentSettings: () => store.settingsSnapshot(),
      participants: [...memberGroups.values()].map((group) => {
        const previous = analysisState.memories.find(
          (memory) => memory.sourceAuthorId === group.authorId,
        );
        return {
          authorId: group.authorId,
          authoredMessages: group.messages.map((message) => message.text).join('\n'),
          ...(previous ? { previous } : {}),
        };
      }),
      createAI: () => configuredAI(analysisState.settings),
    });
    const { notes, failures: analysisFailures, wasOptedIn: analysisWasOptedIn } = groupAnalysis;

    const nextCursor = blueBubblesCursorAfterHistory(chatGuid, history, cursor);
    let chatReplyDrafts: SavedReport[];
    try {
      const replyState = store.snapshot();
      const blockedBeforeReply = groupChatSyncBlockReason(
        replyState.settings,
        'imessage',
        chatGuid,
        isBackgroundPoll,
      );
      if (blockedBeforeReply) return res.status(409).json({ error: blockedBeforeReply });
      chatReplyDrafts = await buildMentionReplyDrafts(
        replyState,
        cursor
          ? newMessages.map((message) => ({
              id: `bluebubbles:${message.guid}`,
              text: message.text,
              author: message.author ?? 'League member',
              fromMe: message.isFromMe,
            }))
          : [],
        'imessage',
        () => configuredAI(replyState.settings),
        {
          beforeGenerate: ({ memberContext }) => {
            assertChatReplyConsent({
              currentState: store.snapshot(),
              expectedLeagueId: replyState.settings.chatReplyLeagueId,
              memberContext,
              channel: 'imessage',
              target: chatGuid,
              isBackgroundPoll,
            });
          },
          afterGenerate: ({ memberContext }) => {
            assertChatReplyConsent({
              currentState: store.snapshot(),
              expectedLeagueId: replyState.settings.chatReplyLeagueId,
              memberContext,
              channel: 'imessage',
              target: chatGuid,
              isBackgroundPoll,
            });
          },
        },
      );
    } catch (error) {
      return res.status(502).json({
        error: error instanceof Error ? error.message : 'Could not draft the group chat reply.',
      });
    }

    let addedMessages = 0;
    await store.update((current) => {
      if (!current.settings.memoryEnabled)
        throw new Error('Enable member memory in Settings before syncing.');
      if (isBackgroundPoll && !current.settings.imessageAutoSyncEnabled)
        throw new Error('Automatic iMessage sync was disabled while syncing.');
      if (current.settings.imessageChatGuid !== chatGuid)
        throw new Error('The iMessage group changed during sync. Try again.');
      if (chatReplyDrafts.length && !current.settings.chatRepliesEnabled)
        throw new Error('Group chat replies were disabled before this sync completed.');
      const maySaveAnalysis = shouldAnalyzeImportedMessages(current.settings);
      for (const group of memberGroups.values()) {
        const profile = current.memories.find((memory) => memory.sourceAuthorId === group.authorId);
        const merged = mergeBlueBubblesHistory(profile?.sourceText ?? '', group.messages);
        if (!merged.added) continue;
        addedMessages += merged.added;
        const updatedNotes = notes.get(group.authorId);
        if (profile) {
          profile.sourceText = merged.sourceText;
          profile.importedAt = new Date().toISOString();
          if (updatedNotes && maySaveAnalysis) {
            profile.styleNotes = updatedNotes.styleNotes;
            profile.contextNotes = updatedNotes.contextNotes;
          }
        } else {
          current.memories.unshift({
            id: randomUUID(),
            name: group.name,
            sourceName: blueBubblesMemorySource,
            sourceAuthorId: group.authorId,
            importedAt: new Date().toISOString(),
            sourceText: merged.sourceText,
            styleNotes: maySaveAnalysis
              ? (updatedNotes?.styleNotes ??
                (analysisWasOptedIn
                  ? 'AI analysis did not complete. Messages are stored locally; add or edit notes below.'
                  : 'AI analysis is off. Messages are stored locally; add or edit notes below.'))
              : analysisWasOptedIn
                ? 'AI analysis was stopped because its opt-in changed. Messages remain local; add or edit notes below.'
                : 'AI analysis is off. Messages are stored locally; add or edit notes below.',
            contextNotes: maySaveAnalysis ? (updatedNotes?.contextNotes ?? '') : '',
            banterPreference: '',
            avoidTopics: '',
          });
        }
      }
      for (const draft of chatReplyDrafts) {
        if (!current.reports.some((report) => report.sourceMessageId === draft.sourceMessageId))
          current.reports.unshift(draft);
      }
      if (nextCursor) current.settings.imessageSyncCursor = nextCursor;
    });
    const chatRepliesSent = store.settingsSnapshot().chatRepliesAutoSend
      ? await autoSendChatReplyDrafts(chatReplyDrafts)
      : 0;
    await store.purgeExpiredConversationSources();
    res.json({
      addedMessages,
      profilesUpdated: memberGroups.size,
      ...(analysisFailures ? { analysisFailures } : {}),
      checkedMessages: history.length,
      chatReplyDrafts: chatReplyDrafts.length,
      chatRepliesSent,
    });
  });
  router.post('/api/memory/twilio-conversation-sync', async (_req, res) => {
    const isBackgroundPoll =
      _req.get('x-sidekick-internal-sync-token') === twilioConversationAutoSyncToken;
    if (claims.twilio && !isBackgroundPoll)
      return res.status(409).json({ error: 'A Twilio Conversations sync is already running.' });
    if (!isBackgroundPoll) {
      claims.twilio = true;
      res.once('finish', () => {
        claims.twilio = false;
      });
    }

    const state = store.snapshot();
    if (!state.settings.memoryEnabled)
      return res.status(409).json({ error: 'Enable member memory in Settings before syncing.' });
    const conversationSid = state.settings.smsRecipient?.trim() ?? '';
    if (!/^CH[0-9a-fA-F]{32}$/.test(conversationSid))
      return res
        .status(409)
        .json({ error: 'Set an existing Twilio Conversation SID as the SMS target.' });
    const config = parseSecret(await readCredential('twilio'));
    if (typeof config.accountSid !== 'string' || typeof config.authToken !== 'string')
      return res.status(409).json({ error: 'Configure Twilio account credentials in Settings.' });

    const cursor =
      state.settings.twilioConversationSyncCursor?.conversationSid === conversationSid
        ? state.settings.twilioConversationSyncCursor
        : undefined;
    const page = cursor?.page ?? 0;
    let history: Awaited<ReturnType<typeof fetchTwilioConversationMessages>>;
    try {
      history = await fetchTwilioConversationMessages(
        config.accountSid,
        config.authToken,
        conversationSid,
        page,
      );
    } catch (error) {
      return res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : 'Could not retrieve Twilio Conversations history.',
      });
    }

    const syncState = store.snapshot();
    const blockedAfterFetch = groupChatSyncBlockReason(
      syncState.settings,
      'sms',
      conversationSid,
      isBackgroundPoll,
    );
    if (blockedAfterFetch) return res.status(409).json({ error: blockedAfterFetch });

    const grouped = new Map<string, { author: string; messages: typeof history.messages }>();
    for (const message of messagesAfterTwilioCursor(history.messages, cursor?.lastIndex ?? -1)) {
      // Twilio's default API sender is `system`; do not learn the bot's generated report style as a member.
      if (message.author.trim().toLowerCase() === 'system') continue;
      const authorId = `${conversationSid}\u0000${message.author}`;
      const group = grouped.get(authorId) ?? { author: message.author, messages: [] };
      group.messages.push(message);
      grouped.set(authorId, group);
    }
    for (const [authorId, group] of grouped) {
      const previous = syncState.memories.find((memory) => memory.sourceAuthorId === authorId);
      group.messages = unseenTwilioConversationMessages(previous?.sourceText ?? '', group.messages);
      if (group.messages.length === 0) grouped.delete(authorId);
    }

    let chatReplyDrafts: SavedReport[];
    try {
      const replyState = store.snapshot();
      const blockedBeforeReply = groupChatSyncBlockReason(
        replyState.settings,
        'sms',
        conversationSid,
        isBackgroundPoll,
      );
      if (blockedBeforeReply) return res.status(409).json({ error: blockedBeforeReply });
      chatReplyDrafts = await buildMentionReplyDrafts(
        replyState,
        messagesAfterTwilioCursor(history.messages, cursor?.lastIndex ?? -1)
          .filter(() => canReplyToTwilioMentions(cursor))
          .filter((message) => message.author.trim().toLowerCase() !== 'system')
          .map((message) => ({
            id: `twilio:${message.sid}`,
            text: message.body,
            author: message.author,
            fromMe:
              typeof config.from === 'string' &&
              message.author.trim().toLowerCase() === config.from.trim().toLowerCase(),
          })),
        'sms',
        () => configuredAI(replyState.settings),
        {
          beforeGenerate: ({ memberContext }) => {
            assertChatReplyConsent({
              currentState: store.snapshot(),
              expectedLeagueId: replyState.settings.chatReplyLeagueId,
              memberContext,
              channel: 'sms',
              target: conversationSid,
              isBackgroundPoll,
            });
          },
          afterGenerate: ({ memberContext }) => {
            assertChatReplyConsent({
              currentState: store.snapshot(),
              expectedLeagueId: replyState.settings.chatReplyLeagueId,
              memberContext,
              channel: 'sms',
              target: conversationSid,
              isBackgroundPoll,
            });
          },
        },
      );
    } catch (error) {
      return res.status(502).json({
        error: error instanceof Error ? error.message : 'Could not draft the group chat reply.',
      });
    }

    const analysisState = store.snapshot();
    const blockedBeforeAnalysis = groupChatSyncBlockReason(
      analysisState.settings,
      'sms',
      conversationSid,
      isBackgroundPoll,
    );
    if (blockedBeforeAnalysis) return res.status(409).json({ error: blockedBeforeAnalysis });
    const groupAnalysis = await analyzeGroupChatMembers({
      initialSettings: analysisState.settings,
      currentSettings: () => store.settingsSnapshot(),
      participants: [...grouped].map(([authorId, group]) => {
        const previous = analysisState.memories.find(
          (memory) => memory.sourceAuthorId === authorId,
        );
        return {
          authorId,
          authoredMessages: group.messages.map((message) => message.body).join('\n'),
          ...(previous ? { previous } : {}),
        };
      }),
      createAI: () => configuredAI(analysisState.settings),
    });
    const { notes, failures: analysisFailures, wasOptedIn: analysisWasOptedIn } = groupAnalysis;

    let addedMessages = 0;
    try {
      await store.update((current) => {
        if (!current.settings.memoryEnabled)
          throw new Error('Enable member memory in Settings before syncing.');
        if (chatReplyDrafts.length && !current.settings.chatRepliesEnabled)
          throw new Error('Group chat replies were disabled before this sync completed.');
        if (isBackgroundPoll && !current.settings.twilioConversationAutoSyncEnabled)
          throw new Error('Automatic Twilio Conversations sync was disabled while syncing.');
        if (current.settings.smsRecipient !== conversationSid)
          throw new Error('The Twilio conversation target changed during sync. Try again.');
        const maySaveAnalysis = shouldAnalyzeImportedMessages(current.settings);
        for (const [authorId, group] of grouped) {
          const profile = current.memories.find((memory) => memory.sourceAuthorId === authorId);
          const merged = mergeTwilioConversationHistory(profile?.sourceText ?? '', group.messages);
          if (!merged.added) continue;
          addedMessages += merged.added;
          const updatedNotes = notes.get(authorId);
          if (profile) {
            profile.sourceText = merged.sourceText;
            profile.importedAt = group.messages.at(-1)?.createdAt ?? new Date().toISOString();
            if (updatedNotes && maySaveAnalysis) {
              profile.styleNotes = updatedNotes.styleNotes;
              profile.contextNotes = updatedNotes.contextNotes;
            }
          } else {
            current.memories.unshift({
              id: randomUUID(),
              name: group.author.slice(0, 100),
              sourceName: twilioConversationMemorySource,
              sourceAuthorId: authorId,
              importedAt: group.messages.at(-1)?.createdAt ?? new Date().toISOString(),
              sourceText: merged.sourceText,
              styleNotes: maySaveAnalysis
                ? (updatedNotes?.styleNotes ??
                  (analysisWasOptedIn
                    ? 'AI analysis did not complete. Messages are stored locally; add or edit notes below.'
                    : 'AI analysis is off. Messages are stored locally; add or edit notes below.'))
                : analysisWasOptedIn
                  ? 'AI analysis was stopped because its opt-in changed. Messages remain local; add or edit notes below.'
                  : 'AI analysis is off. Messages are stored locally; add or edit notes below.',
              contextNotes: maySaveAnalysis ? (updatedNotes?.contextNotes ?? '') : '',
              banterPreference: '',
              avoidTopics: '',
            });
          }
        }
        for (const draft of chatReplyDrafts) {
          if (!current.reports.some((report) => report.sourceMessageId === draft.sourceMessageId))
            current.reports.unshift(draft);
        }
        current.settings.twilioConversationSyncCursor = {
          ...nextTwilioConversationCursor(
            conversationSid,
            cursor,
            history.pageCount,
            history.lastIndex,
            cursor !== undefined &&
              history.messages.some((message) => message.index <= cursor.lastIndex),
          ),
        };
      });
    } catch (error) {
      return res.status(409).json({
        error:
          error instanceof Error ? error.message : 'Could not save Twilio conversation history.',
      });
    }
    const chatRepliesSent = store.settingsSnapshot().chatRepliesAutoSend
      ? await autoSendChatReplyDrafts(chatReplyDrafts)
      : 0;
    await store.purgeExpiredConversationSources();
    res.json({
      addedMessages,
      profilesUpdated: grouped.size,
      checkedMessages: history.pageCount,
      hasMore: history.pageCount === 100,
      chatReplyDrafts: chatReplyDrafts.length,
      chatRepliesSent,
      ...(analysisFailures ? { analysisFailures } : {}),
    });
  });
  router.get('/api/memory/imessage-sync/status', (_req, res) => {
    const settings = store.settingsSnapshot();
    res.json({
      enabled: settings.imessageAutoSyncEnabled && settings.memoryEnabled,
      intervalMinutes: settings.imessageSyncIntervalMinutes,
      ...blueBubblesAutoSyncStatus,
    });
  });
  router.get('/api/memory/twilio-conversation-sync/status', (_req, res) => {
    const settings = store.settingsSnapshot();
    res.json({
      enabled: settings.twilioConversationAutoSyncEnabled === true && settings.memoryEnabled,
      intervalMinutes: settings.twilioConversationSyncIntervalMinutes ?? 15,
      ...twilioConversationAutoSyncStatus,
    });
  });

  return router;
}
