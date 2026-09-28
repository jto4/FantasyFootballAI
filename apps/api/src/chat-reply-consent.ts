import type { AppSettings, LeagueConnection, MemberMemory } from '@sidekick/core';
import { groupChatSyncBlockReason, type GroupChatSyncChannel } from './group-chat-sync-guard.js';
import { memberContextForChatReply } from './privacy.js';

export type ChatReplyConsentState = {
  settings: AppSettings;
  leagues: LeagueConnection[];
  memories: MemberMemory[];
};

export type ChatReplyConsentCheck = {
  currentState: ChatReplyConsentState;
  expectedLeagueId: string | undefined;
  memberContext: string;
  channel: GroupChatSyncChannel;
  target: string;
  isBackgroundPoll: boolean;
};

/** Abort before AI receives chat text when the owner's current sharing settings changed. */
export function assertChatReplyConsent(check: ChatReplyConsentCheck): void {
  const { currentState, expectedLeagueId, memberContext, channel, target, isBackgroundPoll } =
    check;
  const { settings, leagues, memories } = currentState;
  const blocked = groupChatSyncBlockReason(settings, channel, target, isBackgroundPoll);
  if (blocked) throw new Error(blocked);
  if (!settings.chatRepliesEnabled)
    throw new Error('Group chat replies were disabled before AI generation.');
  if (settings.chatReplyLeagueId !== expectedLeagueId)
    throw new Error('The selected chat reply league changed before AI generation. Try again.');

  const selectedLeague = leagues.find((league) => league.id === settings.chatReplyLeagueId);
  const contextLeague = selectedLeague ?? leagues[0];
  if (memberContextForChatReply(settings, memories, contextLeague?.id) !== memberContext)
    throw new Error('Group chat memory sharing changed before AI generation. Try again.');
}
