import { SettingsRevisionConflict } from './store.js';
import { Router } from 'express';
import {
  isSettingsSection,
  settingsSectionFields,
  defaultLeagueStaleAfterHours,
  isLeagueStaleAfterHours,
  isValidWritingStylePresets,
  normalizeChannelBoundaries,
  normalizeNewsSources,
  normalizeLeagueCalendarEvents,
  preserveCompletedCalendarEvents,
  type AppSettings,
  type ActionSetting,
} from '@sidekick/core';
import type { AppState, LocalStore } from './store.js';
import { preserveCompletedOneOffs } from './scheduler.js';
import { isValidSettingsUpdate } from './settings-validation.js';
class InvalidSettings extends Error {}
export function normalizeSettingsUpdate(
  input: Record<string, unknown>,
  current: AppState,
): AppSettings {
  const {
    writingStyle,
    customWritingStylePresets,
    reportLength,
    allowProfanity,
    excludedTopics,
    channelBoundaries,
    actions,
    calendarEvents,
    aiRuntime,
    emailRecipient,
    smsRecipient,
    imessageChatGuid,
    imessageOwnerName,
    imessageAutoSyncEnabled,
    imessageSyncIntervalMinutes,
    twilioConversationAutoSyncEnabled,
    twilioConversationSyncIntervalMinutes,
    chatRepliesEnabled,
    chatRepliesAutoSend,
    chatAgentName,
    chatReplyLeagueId,
    mcpDeliveryEnabled,
    memoryEnabled,
    analyzeImportsWithAI,
    includeMemberContextInReports,
    includeMemberContextInChatReplies,
    nflInjuryReportsEnabled,
    conversationRetentionDays,
    newsRefreshMinutes,
    leagueStaleAfterHours,
    newsSources,
  } = input as {
    writingStyle?: unknown;
    customWritingStylePresets?: unknown;
    reportLength?: unknown;
    allowProfanity?: unknown;
    excludedTopics?: unknown;
    channelBoundaries?: unknown;
    actions?: unknown;
    calendarEvents?: unknown;
    aiRuntime?: unknown;
    emailRecipient?: unknown;
    smsRecipient?: unknown;
    imessageChatGuid?: unknown;
    imessageOwnerName?: unknown;
    imessageAutoSyncEnabled?: unknown;
    imessageSyncIntervalMinutes?: unknown;
    twilioConversationAutoSyncEnabled?: unknown;
    twilioConversationSyncIntervalMinutes?: unknown;
    chatRepliesEnabled?: unknown;
    chatRepliesAutoSend?: unknown;
    chatAgentName?: unknown;
    chatReplyLeagueId?: unknown;
    mcpDeliveryEnabled?: unknown;
    memoryEnabled?: unknown;
    analyzeImportsWithAI?: unknown;
    includeMemberContextInReports?: unknown;
    includeMemberContextInChatReplies?: unknown;
    nflInjuryReportsEnabled?: unknown;
    conversationRetentionDays?: unknown;
    newsRefreshMinutes?: unknown;
    leagueStaleAfterHours?: unknown;
    newsSources?: unknown;
  };

  return {
    writingStyle,
    customWritingStylePresets: isValidWritingStylePresets(customWritingStylePresets)
      ? customWritingStylePresets.map((preset) => ({
          name: preset.name.trim(),
          value: preset.value,
        }))
      : (current.settings.customWritingStylePresets ?? []),
    reportLength: reportLength === 'short' || reportLength === 'long' ? reportLength : 'standard',
    allowProfanity: allowProfanity === true,
    excludedTopics: typeof excludedTopics === 'string' ? excludedTopics : '',
    channelBoundaries: normalizeChannelBoundaries(
      channelBoundaries ?? current.settings.channelBoundaries,
    ),
    actions: preserveCompletedOneOffs(actions as ActionSetting[], current.settings.actions),
    calendarEvents: preserveCompletedCalendarEvents(
      normalizeLeagueCalendarEvents(
        calendarEvents ?? current.settings.calendarEvents,
        new Set(current.leagues.map((league) => league.id)),
      ),
      current.settings.calendarEvents ?? [],
    ),
    aiRuntime,
    scheduledSyncRetries: input.scheduledSyncRetries ?? current.settings.scheduledSyncRetries ?? 0,
    memoryEnabled: memoryEnabled !== false,
    analyzeImportsWithAI: analyzeImportsWithAI === true,
    includeMemberContextInReports: includeMemberContextInReports === true,
    includeMemberContextInChatReplies: includeMemberContextInChatReplies === true,
    nflInjuryReportsEnabled: nflInjuryReportsEnabled === true,
    ...(conversationRetentionDays === undefined ? {} : { conversationRetentionDays }),
    newsRefreshMinutes,
    leagueStaleAfterHours: isLeagueStaleAfterHours(leagueStaleAfterHours)
      ? leagueStaleAfterHours
      : defaultLeagueStaleAfterHours,
    newsSources: normalizeNewsSources(newsSources ?? current.settings.newsSources),
    ...(emailRecipient ? { emailRecipient } : {}),
    ...(smsRecipient ? { smsRecipient } : {}),
    ...(imessageChatGuid ? { imessageChatGuid } : {}),
    imessageOwnerName:
      typeof imessageOwnerName === 'string' ? imessageOwnerName.trim() : 'League owner',
    imessageAutoSyncEnabled: memoryEnabled !== false && imessageAutoSyncEnabled === true,
    imessageSyncIntervalMinutes:
      imessageSyncIntervalMinutes === 5 ||
      imessageSyncIntervalMinutes === 30 ||
      imessageSyncIntervalMinutes === 60
        ? imessageSyncIntervalMinutes
        : 15,
    twilioConversationAutoSyncEnabled:
      memoryEnabled !== false &&
      typeof smsRecipient === 'string' &&
      /^CH[0-9a-fA-F]{32}$/.test(smsRecipient) &&
      twilioConversationAutoSyncEnabled === true,
    twilioConversationSyncIntervalMinutes:
      twilioConversationSyncIntervalMinutes === 5 ||
      twilioConversationSyncIntervalMinutes === 30 ||
      twilioConversationSyncIntervalMinutes === 60
        ? twilioConversationSyncIntervalMinutes
        : 15,
    chatRepliesEnabled: chatRepliesEnabled === true,
    chatRepliesAutoSend: chatRepliesEnabled === true && chatRepliesAutoSend === true,
    chatAgentName: typeof chatAgentName === 'string' ? chatAgentName.trim() : 'Sunday Sidekick',
    ...(typeof chatReplyLeagueId === 'string' && chatReplyLeagueId ? { chatReplyLeagueId } : {}),
    mcpDeliveryEnabled: mcpDeliveryEnabled === true,
    ...(current.settings.imessageSyncCursor?.chatGuid === imessageChatGuid
      ? { imessageSyncCursor: current.settings.imessageSyncCursor }
      : {}),
    ...(current.settings.twilioConversationSyncCursor?.conversationSid === smsRecipient
      ? { twilioConversationSyncCursor: current.settings.twilioConversationSyncCursor }
      : {}),
  } as typeof current.settings;
}
export function createSettingsRouter({
  store,
  afterSave,
}: {
  store: LocalStore;
  afterSave: (settings: AppSettings) => Promise<void>;
}) {
  const router = Router();
  router.put('/api/settings', async (req, res) => {
    await save(req.body, undefined, res, req.get('If-Match'));
  });
  router.patch('/api/settings/:section', async (req, res) => {
    await save(req.body, req.params.section, res, req.get('If-Match'));
  });
  async function save(
    body: unknown,
    section: string | undefined,
    res: import('express').Response,
    ifMatch?: string,
  ) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      (section !== undefined && !isSettingsSection(section))
    )
      return res.status(400).json({ error: 'Invalid settings section.' });
    if (ifMatch !== undefined && !/^(?:\d+|"\d+")$/.test(ifMatch))
      return res.status(400).json({ error: 'Invalid settings revision.', code: 'invalid_request' });
    const expectedRevision =
      ifMatch === undefined ? undefined : Number(ifMatch.replaceAll('"', ''));
    if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || !section))
      return res
        .status(400)
        .json({ error: 'Use a section revision for section saves.', code: 'invalid_request' });
    const patch = body as Record<string, unknown>;
    const removable = new Set([
      'conversationRetentionDays',
      'emailRecipient',
      'smsRecipient',
      'imessageChatGuid',
      'chatReplyLeagueId',
    ]);
    if (Object.entries(patch).some(([key, value]) => value === null && !removable.has(key)))
      return res.status(400).json({ error: 'Required settings cannot be removed.' });
    if (
      section !== undefined &&
      isSettingsSection(section) &&
      (Object.keys(patch).length === 0 ||
        Object.keys(patch).some(
          (key) => !(settingsSectionFields[section] as readonly string[]).includes(key),
        ))
    )
      return res.status(400).json({ error: 'Save only fields belonging to this section.' });
    if (section !== undefined && expectedRevision === undefined)
      return res.status(428).json({
        error: 'Supply the section revision in the If-Match header.',
        code: 'invalid_request',
      });
    try {
      await store.update(
        (current) => {
          const input: Record<string, unknown> =
            section === undefined ? { ...patch } : { ...current.settings, ...patch };
          if (section !== undefined)
            for (const key of Object.keys(patch)) {
              if (patch[key] === null) delete input[key];
            }
          if (!isValidSettingsUpdate(input, new Set(current.leagues.map((league) => league.id))))
            throw new InvalidSettings();
          current.settings = normalizeSettingsUpdate(input, current);
        },
        section && isSettingsSection(section) && expectedRevision !== undefined
          ? { section, revision: expectedRevision }
          : undefined,
      );
    } catch (error) {
      if (error instanceof SettingsRevisionConflict)
        return res.status(409).json({
          error: 'This section changed in another window. Reload this section before saving.',
          code: 'revision_conflict',
        });
      if (error instanceof InvalidSettings)
        return res.status(400).json({ error: 'Invalid settings.' });
      throw error;
    }
    const settings = store.settingsSnapshot();
    await afterSave(settings);
    return res.json(settings);
  }
  return router;
}
