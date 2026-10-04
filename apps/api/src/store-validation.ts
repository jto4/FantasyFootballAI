import { isDeliveryEnvelope, isGenerationJob, record, settingsSectionFields } from '@sidekick/core';
import {
  defaultLeagueStaleAfterHours,
  isValidNewsSources,
  isLeagueStaleAfterHours,
  isValidWritingStylePresets,
  normalizeActionSettings,
  normalizeChannelBoundaries,
  normalizeLeagueCalendarEvents,
  normalizeNewsSources,
  type AppSettings,
  type PlayerProjection,
} from '@sidekick/core';
import { isValidProjectionSourceUrl } from './projections.js';
import type { AppState, ScheduledRun } from './store-types.js';
import { initialState } from './store-defaults.js';
export function validateState(input: unknown): AppState {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid local state file');
  const candidate = input as Partial<AppState>;
  if (
    !candidate.settings ||
    !Array.isArray(candidate.leagues) ||
    !Array.isArray(candidate.reports) ||
    (candidate.playerProjections !== undefined && !Array.isArray(candidate.playerProjections)) ||
    (candidate.scheduledRuns !== undefined && !Array.isArray(candidate.scheduledRuns))
  ) {
    throw new Error('Invalid local state structure');
  }
  if (
    candidate.generationJobs !== undefined &&
    (!Array.isArray(candidate.generationJobs) || !candidate.generationJobs.every(isGenerationJob))
  )
    throw new Error('Invalid generation jobs.');
  if (
    new Set((candidate.generationJobs ?? []).map((job) => job.requestId)).size !==
    (candidate.generationJobs ?? []).length
  )
    throw new Error('Duplicate generation request ID.');
  if (
    candidate.settings.sectionRevisions !== undefined &&
    (!record(candidate.settings.sectionRevisions) ||
      Object.entries(candidate.settings.sectionRevisions).some(
        ([key, value]) =>
          !Object.hasOwn(settingsSectionFields, key) ||
          typeof value !== 'number' ||
          !Number.isSafeInteger(value) ||
          value < 0,
      ))
  )
    throw new Error('Invalid settings revisions.');
  const rawSettings = candidate.settings as unknown as Record<string, unknown>;
  if (
    !rawSettings ||
    typeof rawSettings !== 'object' ||
    Array.isArray(rawSettings) ||
    (rawSettings.writingStyle !== undefined &&
      (typeof rawSettings.writingStyle !== 'string' || rawSettings.writingStyle.length > 1000)) ||
    (rawSettings.customWritingStylePresets !== undefined &&
      !isValidWritingStylePresets(rawSettings.customWritingStylePresets)) ||
    (rawSettings.reportLength !== undefined &&
      !['short', 'standard', 'long'].includes(String(rawSettings.reportLength))) ||
    (rawSettings.leagueStaleAfterHours !== undefined &&
      !isLeagueStaleAfterHours(rawSettings.leagueStaleAfterHours)) ||
    (rawSettings.allowProfanity !== undefined && typeof rawSettings.allowProfanity !== 'boolean') ||
    (rawSettings.excludedTopics !== undefined &&
      (typeof rawSettings.excludedTopics !== 'string' ||
        rawSettings.excludedTopics.length > 2000)) ||
    (rawSettings.memoryEnabled !== undefined && typeof rawSettings.memoryEnabled !== 'boolean') ||
    (rawSettings.aiRuntime !== undefined && !isValidStoredRuntime(rawSettings.aiRuntime)) ||
    (rawSettings.emailRecipient !== undefined &&
      !isOptionalStoredAddress(rawSettings.emailRecipient)) ||
    (rawSettings.smsRecipient !== undefined &&
      !isOptionalStoredAddress(rawSettings.smsRecipient)) ||
    (rawSettings.imessageChatGuid !== undefined &&
      (typeof rawSettings.imessageChatGuid !== 'string' ||
        rawSettings.imessageChatGuid.length > 500 ||
        (rawSettings.imessageChatGuid !== '' && !rawSettings.imessageChatGuid.trim()) ||
        /[\r\n]/.test(rawSettings.imessageChatGuid))) ||
    (rawSettings.imessageOwnerName !== undefined &&
      (typeof rawSettings.imessageOwnerName !== 'string' ||
        rawSettings.imessageOwnerName.trim().length === 0 ||
        rawSettings.imessageOwnerName.length > 100)) ||
    (rawSettings.imessageSyncCursor !== undefined &&
      !isValidBlueBubblesCursor(rawSettings.imessageSyncCursor)) ||
    (rawSettings.twilioConversationSyncCursor !== undefined &&
      !isValidTwilioConversationCursor(rawSettings.twilioConversationSyncCursor)) ||
    (rawSettings.twilioConversationAutoSyncEnabled !== undefined &&
      typeof rawSettings.twilioConversationAutoSyncEnabled !== 'boolean') ||
    (rawSettings.twilioConversationSyncIntervalMinutes !== undefined &&
      !isBlueBubblesSyncInterval(rawSettings.twilioConversationSyncIntervalMinutes)) ||
    (rawSettings.mcpDeliveryEnabled !== undefined &&
      typeof rawSettings.mcpDeliveryEnabled !== 'boolean') ||
    (rawSettings.analyzeImportsWithAI !== undefined &&
      typeof rawSettings.analyzeImportsWithAI !== 'boolean') ||
    (rawSettings.includeMemberContextInReports !== undefined &&
      typeof rawSettings.includeMemberContextInReports !== 'boolean') ||
    (rawSettings.includeMemberContextInChatReplies !== undefined &&
      typeof rawSettings.includeMemberContextInChatReplies !== 'boolean') ||
    (rawSettings.conversationRetentionDays !== undefined &&
      rawSettings.conversationRetentionDays !== 30 &&
      rawSettings.conversationRetentionDays !== 90 &&
      rawSettings.conversationRetentionDays !== 365) ||
    (rawSettings.newsRefreshMinutes !== undefined &&
      (typeof rawSettings.newsRefreshMinutes !== 'number' ||
        !Number.isInteger(rawSettings.newsRefreshMinutes) ||
        rawSettings.newsRefreshMinutes < 5 ||
        rawSettings.newsRefreshMinutes > 1440)) ||
    (rawSettings.scheduledSyncRetries !== undefined &&
      (typeof rawSettings.scheduledSyncRetries !== 'number' ||
        !Number.isInteger(rawSettings.scheduledSyncRetries) ||
        rawSettings.scheduledSyncRetries < 0 ||
        rawSettings.scheduledSyncRetries > 3)) ||
    (rawSettings.newsSources !== undefined && !isValidNewsSources(rawSettings.newsSources)) ||
    (rawSettings.nflInjuryReportsEnabled !== undefined &&
      typeof rawSettings.nflInjuryReportsEnabled !== 'boolean')
  ) {
    throw new Error('Invalid settings in local state.');
  }
  if (
    candidate.reports.some((report) => {
      if (!report || typeof report !== 'object' || Array.isArray(report)) return true;
      const state = report.deliveryState;
      const updatedAt = report.deliveryUpdatedAt;
      const attempts = report.deliveryAttempts;
      const usage = report.aiUsage;
      const citations = report.citations;
      return (
        (report.deliveryEnvelope !== undefined && !isDeliveryEnvelope(report.deliveryEnvelope)) ||
        (report.revision !== undefined &&
          (!Number.isSafeInteger(report.revision) || report.revision < 0)) ||
        (report.editedAt !== undefined &&
          (typeof report.editedAt !== 'string' ||
            report.editedAt.length > 64 ||
            !Number.isFinite(Date.parse(report.editedAt)))) ||
        (report.evidence !== undefined &&
          (!report.evidence ||
            typeof report.evidence !== 'object' ||
            Array.isArray(report.evidence) ||
            typeof report.evidence.guidance !== 'string' ||
            report.evidence.guidance.length > 6000 ||
            [report.evidence.leagueSyncedAt, report.evidence.newsRefreshedAt].some(
              (value) =>
                value !== undefined &&
                (typeof value !== 'string' ||
                  value.length > 64 ||
                  !Number.isFinite(Date.parse(value))),
            ))) ||
        (usage !== undefined && !isValidAIUsageSummary(usage)) ||
        (citations !== undefined &&
          (!Array.isArray(citations) ||
            citations.length > 20 ||
            citations.some(
              (citation) =>
                !citation ||
                typeof citation !== 'object' ||
                typeof citation.title !== 'string' ||
                citation.title.length > 500 ||
                /[\u0000-\u001f\u007f]/.test(citation.title) ||
                !isSafeCitationUrl(citation.url),
            ))) ||
        (state !== undefined && !['sending', 'failed', 'uncertain'].includes(String(state))) ||
        (updatedAt !== undefined && typeof updatedAt !== 'string') ||
        (attempts !== undefined &&
          (!Array.isArray(attempts) ||
            attempts.length > 50 ||
            attempts.some(
              (attempt) =>
                !attempt ||
                typeof attempt !== 'object' ||
                !['email', 'sms', 'imessage'].includes(String(attempt.channel)) ||
                !['sending', 'sent', 'failed', 'uncertain'].includes(String(attempt.status)) ||
                typeof attempt.startedAt !== 'string' ||
                (attempt.finishedAt !== undefined && typeof attempt.finishedAt !== 'string') ||
                (attempt.providerMessageId !== undefined &&
                  (typeof attempt.providerMessageId !== 'string' ||
                    attempt.providerMessageId.length > 300)) ||
                (attempt.idempotencyKey !== undefined &&
                  (typeof attempt.idempotencyKey !== 'string' ||
                    attempt.idempotencyKey.length > 256)),
            )))
      );
    })
  ) {
    throw new Error('Invalid report delivery state in local data.');
  }
  const playerProjections = candidate.playerProjections ?? [];
  const leagueIds = new Set(candidate.leagues.map((league) => league.id));
  if (
    playerProjections.length > 50_000 ||
    playerProjections.some((projection) => !isValidPlayerProjection(projection, leagueIds)) ||
    new Set(playerProjections.map((projection) => projection.id)).size !== playerProjections.length
  )
    throw new Error('Invalid player projections in local state.');
  const storedScheduledRuns = candidate.scheduledRuns ?? [];
  if (
    storedScheduledRuns.length > 100 ||
    storedScheduledRuns.some((run) => !isValidScheduledRun(run)) ||
    new Set(storedScheduledRuns.map((run) => run.id)).size !== storedScheduledRuns.length
  )
    throw new Error('Invalid scheduled run history in local state.');
  // Project validated rows into the public schema so unknown backup fields never escape via the API.
  const scheduledRuns = storedScheduledRuns.map((run) => ({
    id: run.id,
    kind: run.kind,
    startedAt: run.startedAt,
    ...(run.occurrenceKey !== undefined ? { occurrenceKey: run.occurrenceKey } : {}),
    ...(run.finishedAt !== undefined ? { finishedAt: run.finishedAt } : {}),
    status: run.status,
    ...(run.detail !== undefined ? { detail: run.detail } : {}),
    ...(run.leagueResults !== undefined
      ? {
          leagueResults: run.leagueResults.map((result) => ({
            leagueId: result.leagueId,
            displayName: result.displayName,
            status: result.status,
            ...(result.detail !== undefined ? { detail: result.detail } : {}),
          })),
        }
      : {}),
    ...(run.retryOf !== undefined ? { retryOf: run.retryOf } : {}),
    ...(run.calendarEventId !== undefined ? { calendarEventId: run.calendarEventId } : {}),
    ...(run.calendarEventTitle !== undefined ? { calendarEventTitle: run.calendarEventTitle } : {}),
  }));
  return {
    generationJobs: candidate.generationJobs ?? [],
    settings: {
      ...initialState.settings,
      ...rawSettings,
      reportLength:
        rawSettings.reportLength === 'short' || rawSettings.reportLength === 'long'
          ? rawSettings.reportLength
          : 'standard',
      leagueStaleAfterHours: isLeagueStaleAfterHours(rawSettings.leagueStaleAfterHours)
        ? rawSettings.leagueStaleAfterHours
        : defaultLeagueStaleAfterHours,
      actions: normalizeActionSettings(rawSettings.actions),
      calendarEvents: normalizeLeagueCalendarEvents(rawSettings.calendarEvents, leagueIds),
      channelBoundaries: normalizeChannelBoundaries(rawSettings.channelBoundaries),
      newsSources: normalizeNewsSources(rawSettings.newsSources),
      nflInjuryReportsEnabled: rawSettings.nflInjuryReportsEnabled === true,
      includeMemberContextInChatReplies: rawSettings.includeMemberContextInChatReplies === true,
      scheduledSyncRetries:
        rawSettings.scheduledSyncRetries === 1 ||
        rawSettings.scheduledSyncRetries === 2 ||
        rawSettings.scheduledSyncRetries === 3
          ? rawSettings.scheduledSyncRetries
          : 0,
      imessageOwnerName:
        typeof rawSettings.imessageOwnerName === 'string' && rawSettings.imessageOwnerName.trim()
          ? rawSettings.imessageOwnerName.trim()
          : 'League owner',
      imessageAutoSyncEnabled: rawSettings.imessageAutoSyncEnabled === true,
      imessageSyncIntervalMinutes: isBlueBubblesSyncInterval(
        rawSettings.imessageSyncIntervalMinutes,
      )
        ? rawSettings.imessageSyncIntervalMinutes
        : 15,
      twilioConversationAutoSyncEnabled: rawSettings.twilioConversationAutoSyncEnabled === true,
      twilioConversationSyncIntervalMinutes: isBlueBubblesSyncInterval(
        rawSettings.twilioConversationSyncIntervalMinutes,
      )
        ? rawSettings.twilioConversationSyncIntervalMinutes
        : 15,
      chatRepliesEnabled: rawSettings.chatRepliesEnabled === true,
      chatRepliesAutoSend: rawSettings.chatRepliesAutoSend === true,
      chatAgentName:
        typeof rawSettings.chatAgentName === 'string' &&
        rawSettings.chatAgentName.trim() &&
        rawSettings.chatAgentName.length <= 60
          ? rawSettings.chatAgentName.trim()
          : 'Sunday Sidekick',
      ...(typeof rawSettings.chatReplyLeagueId === 'string' &&
      leagueIds.has(rawSettings.chatReplyLeagueId)
        ? { chatReplyLeagueId: rawSettings.chatReplyLeagueId }
        : {}),
      mcpDeliveryEnabled: rawSettings.mcpDeliveryEnabled === true,
    } as AppSettings,
    leagues: candidate.leagues,
    reports: candidate.reports.map((report) => ({ ...report, citations: report.citations ?? [] })),
    memories: Array.isArray(candidate.memories) ? candidate.memories : [],
    playerProjections,
    scheduledRuns,
  };
}

function isValidScheduledRun(value: unknown): value is ScheduledRun {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const run = value as Record<string, unknown>;
  const validText = (text: unknown, maxLength: number): text is string =>
    typeof text === 'string' &&
    text.length > 0 &&
    text.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(text);
  const validTimestamp = (timestamp: unknown): timestamp is string =>
    typeof timestamp === 'string' &&
    timestamp.length <= 100 &&
    Number.isFinite(Date.parse(timestamp));
  const validOptionalText = (text: unknown, maxLength: number): text is string | undefined =>
    text === undefined || (validText(text, maxLength) && !/[\u0000-\u001f\u007f]/.test(text));
  if (
    !validText(run.id, 100) ||
    !validText(run.kind, 80) ||
    !validTimestamp(run.startedAt) ||
    (run.finishedAt !== undefined && !validTimestamp(run.finishedAt)) ||
    !['running', 'succeeded', 'failed'].includes(String(run.status)) ||
    !validOptionalText(run.detail, 1_000) ||
    !validOptionalText(run.retryOf, 100) ||
    !validOptionalText(run.calendarEventId, 100) ||
    !validOptionalText(run.calendarEventTitle, 120) ||
    !validOptionalText(run.occurrenceKey, 400) ||
    (run.leagueResults !== undefined &&
      (!Array.isArray(run.leagueResults) ||
        run.leagueResults.length > 32 ||
        run.leagueResults.some((result) => {
          if (!result || typeof result !== 'object' || Array.isArray(result)) return true;
          const item = result as Record<string, unknown>;
          return (
            !validText(item.leagueId, 200) ||
            !validText(item.displayName, 200) ||
            !['succeeded', 'failed', 'skipped'].includes(String(item.status)) ||
            !validOptionalText(item.detail, 1_000)
          );
        })))
  )
    return false;
  return true;
}

function isSafeCitationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isValidAIUsageSummary(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const usage = value as Record<string, unknown>;
  const validRate = (rate: unknown) =>
    rate === undefined ||
    (typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 1_000);
  const hasBothRates =
    typeof usage.inputUsdPerMillionTokens === 'number' &&
    typeof usage.outputUsdPerMillionTokens === 'number';
  return (
    typeof usage.model === 'string' &&
    usage.model.length > 0 &&
    usage.model.length <= 120 &&
    Number.isInteger(usage.inputTokens) &&
    Number(usage.inputTokens) >= 0 &&
    Number(usage.inputTokens) <= 10_000_000 &&
    Number.isInteger(usage.outputTokens) &&
    Number(usage.outputTokens) >= 0 &&
    Number(usage.outputTokens) <= 10_000_000 &&
    validRate(usage.inputUsdPerMillionTokens) &&
    validRate(usage.outputUsdPerMillionTokens) &&
    (usage.estimatedCostUsd === undefined ||
      (hasBothRates &&
        typeof usage.estimatedCostUsd === 'number' &&
        Number.isFinite(usage.estimatedCostUsd) &&
        usage.estimatedCostUsd >= 0 &&
        usage.estimatedCostUsd <= 20_000))
  );
}

function isValidPlayerProjection(
  value: unknown,
  leagueIds: Set<string>,
): value is PlayerProjection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const projection = value as Record<string, unknown>;
  return (
    typeof projection.id === 'string' &&
    projection.id.length > 0 &&
    projection.id.length <= 100 &&
    typeof projection.leagueId === 'string' &&
    leagueIds.has(projection.leagueId) &&
    (projection.sourceId === undefined ||
      (typeof projection.sourceId === 'string' &&
        projection.sourceId.length > 0 &&
        projection.sourceId.length <= 100)) &&
    (projection.scoringMatched === undefined || typeof projection.scoringMatched === 'boolean') &&
    typeof projection.playerName === 'string' &&
    projection.playerName.trim().length > 0 &&
    projection.playerName.length <= 120 &&
    !/[\u0000-\u001f\u007f]/.test(projection.playerName) &&
    (projection.playerId === undefined ||
      (typeof projection.playerId === 'string' &&
        projection.playerId.length > 0 &&
        projection.playerId.length <= 100)) &&
    (projection.position === undefined ||
      (typeof projection.position === 'string' &&
        projection.position.length <= 20 &&
        !/[\r\n]/.test(projection.position))) &&
    (projection.nflTeam === undefined ||
      (typeof projection.nflTeam === 'string' &&
        projection.nflTeam.length <= 10 &&
        !/[\r\n]/.test(projection.nflTeam))) &&
    typeof projection.projectedPoints === 'number' &&
    Number.isFinite(projection.projectedPoints) &&
    projection.projectedPoints >= 0 &&
    projection.projectedPoints <= 3000 &&
    (projection.averageDraftPosition === undefined ||
      (typeof projection.averageDraftPosition === 'number' &&
        Number.isFinite(projection.averageDraftPosition) &&
        projection.averageDraftPosition >= 1 &&
        projection.averageDraftPosition <= 600)) &&
    (projection.week === undefined ||
      (typeof projection.week === 'number' &&
        Number.isInteger(projection.week) &&
        projection.week >= 1 &&
        projection.week <= 30)) &&
    typeof projection.sourceName === 'string' &&
    projection.sourceName.trim().length > 0 &&
    projection.sourceName.length <= 100 &&
    !/[\u0000-\u001f\u007f]/.test(projection.sourceName) &&
    (projection.sourceUrl === undefined || isValidProjectionSourceUrl(projection.sourceUrl)) &&
    typeof projection.importedAt === 'string' &&
    Number.isFinite(Date.parse(projection.importedAt))
  );
}

function isValidBlueBubblesCursor(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cursor = value as Record<string, unknown>;
  return (
    typeof cursor.chatGuid === 'string' &&
    cursor.chatGuid.length > 0 &&
    cursor.chatGuid.length <= 500 &&
    typeof cursor.dateCreated === 'number' &&
    Number.isFinite(cursor.dateCreated) &&
    Array.isArray(cursor.messageGuids) &&
    cursor.messageGuids.length <= 200 &&
    cursor.messageGuids.every((guid) => typeof guid === 'string' && guid.length <= 300)
  );
}

function isValidTwilioConversationCursor(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cursor = value as Record<string, unknown>;
  return (
    typeof cursor.conversationSid === 'string' &&
    /^CH[0-9a-fA-F]{32}$/.test(cursor.conversationSid) &&
    typeof cursor.page === 'number' &&
    Number.isInteger(cursor.page) &&
    cursor.page >= 0 &&
    cursor.page <= 1_000_000 &&
    typeof cursor.lastIndex === 'number' &&
    Number.isInteger(cursor.lastIndex) &&
    cursor.lastIndex >= -1 &&
    cursor.lastIndex <= 2_147_483_647 &&
    (cursor.initialized === undefined || typeof cursor.initialized === 'boolean')
  );
}

function isBlueBubblesSyncInterval(value: unknown): value is 5 | 15 | 30 | 60 {
  return value === 5 || value === 15 || value === 30 || value === 60;
}

/** Backups can be untrusted, so imported automation, executables, and credential destinations need reapproval. */
export function makeRestoredStateSafe(state: AppState): AppState {
  // A restore invalidates every open form, even when an older backup has matching counters.
  state = {
    ...state,
    settings: {
      ...state.settings,
      sectionRevisions: Object.fromEntries(
        Object.keys(settingsSectionFields).map((section) => [section, Date.now()]),
      ),
    },
  };
  const defaultRuntime = initialState.settings.aiRuntime!;
  const requiresRuntimeReview =
    state.settings.aiRuntime?.mode === 'cli' ||
    state.settings.aiRuntime?.mode === 'apple-cli' ||
    state.settings.aiRuntime?.baseUrl !== defaultRuntime.baseUrl;
  const hasAutomaticActions = state.settings.actions.some((action) => action.mode === 'automatic');
  const hasAutoSync =
    state.settings.imessageAutoSyncEnabled === true ||
    state.settings.twilioConversationAutoSyncEnabled === true;
  const hasMcpDelivery = state.settings.mcpDeliveryEnabled === true;
  const hasChatReplies =
    state.settings.chatRepliesEnabled === true || state.settings.chatRepliesAutoSend === true;
  if (
    !requiresRuntimeReview &&
    !hasAutomaticActions &&
    !hasAutoSync &&
    !hasMcpDelivery &&
    !hasChatReplies
  )
    return state;

  return {
    ...state,
    settings: {
      ...state.settings,
      ...(requiresRuntimeReview ? { aiRuntime: structuredClone(defaultRuntime) } : {}),
      imessageAutoSyncEnabled: false,
      twilioConversationAutoSyncEnabled: false,
      mcpDeliveryEnabled: false,
      chatRepliesEnabled: false,
      chatRepliesAutoSend: false,
      ...(requiresRuntimeReview || hasAutomaticActions
        ? {
            actions: state.settings.actions.map((action) => ({
              ...action,
              mode: 'draft' as const,
              schedule: { ...action.schedule, enabled: false },
            })),
          }
        : {}),
    },
  };
}

function isValidStoredRuntime(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const runtime = value as Record<string, unknown>;
  return (
    (runtime.mode === 'api' || runtime.mode === 'cli' || runtime.mode === 'apple-cli') &&
    typeof runtime.model === 'string' &&
    runtime.model.length <= 120 &&
    typeof runtime.command === 'string' &&
    runtime.command.length <= 300 &&
    typeof runtime.args === 'string' &&
    runtime.args.length <= 1000 &&
    typeof runtime.baseUrl === 'string' &&
    runtime.baseUrl.length <= 500 &&
    /^https:\/\//.test(runtime.baseUrl) &&
    (runtime.temperature === undefined ||
      (typeof runtime.temperature === 'number' &&
        Number.isFinite(runtime.temperature) &&
        runtime.temperature >= 0 &&
        runtime.temperature <= 2)) &&
    (runtime.maxOutputTokens === undefined ||
      (typeof runtime.maxOutputTokens === 'number' &&
        Number.isInteger(runtime.maxOutputTokens) &&
        runtime.maxOutputTokens >= 128 &&
        runtime.maxOutputTokens <= 16_384)) &&
    (runtime.inputUsdPerMillionTokens === undefined ||
      (typeof runtime.inputUsdPerMillionTokens === 'number' &&
        Number.isFinite(runtime.inputUsdPerMillionTokens) &&
        runtime.inputUsdPerMillionTokens >= 0 &&
        runtime.inputUsdPerMillionTokens <= 1_000)) &&
    (runtime.outputUsdPerMillionTokens === undefined ||
      (typeof runtime.outputUsdPerMillionTokens === 'number' &&
        Number.isFinite(runtime.outputUsdPerMillionTokens) &&
        runtime.outputUsdPerMillionTokens >= 0 &&
        runtime.outputUsdPerMillionTokens <= 1_000))
  );
}

function isOptionalStoredAddress(value: unknown): boolean {
  return value === '' || (typeof value === 'string' && value.length < 320 && !/[\r\n]/.test(value));
}
