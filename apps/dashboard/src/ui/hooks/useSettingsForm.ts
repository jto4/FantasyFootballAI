import { useState } from 'react';
import {
  isValidTimezone,
  defaultLeagueStaleAfterHours,
  normalizeNewsSources,
  normalizeActionSettings,
  normalizeChannelBoundaries,
  settingsSectionFields,
  settingsSectionPatch,
  isAppSettings,
  type AppSettings,
  type LeagueConnection,
  type SettingsSection,
} from '@sidekick/core';
import { requestJson, ApiError } from '../api-client';
import { isAppState } from '../app-state';
function normalizeSettingsForm(settings: AppSettings, leagues: LeagueConnection[]): AppSettings {
  return {
    ...settings,
    customWritingStylePresets: settings.customWritingStylePresets ?? [],
    calendarEvents: settings.calendarEvents ?? [],
    actions: normalizeActionSettings(settings.actions),
    reportLength: settings.reportLength ?? 'standard',
    allowProfanity: settings.allowProfanity ?? false,
    excludedTopics: settings.excludedTopics ?? '',
    channelBoundaries: normalizeChannelBoundaries(settings.channelBoundaries),
    memoryEnabled: settings.memoryEnabled ?? true,
    analyzeImportsWithAI: settings.analyzeImportsWithAI ?? false,
    includeMemberContextInReports: settings.includeMemberContextInReports ?? false,
    includeMemberContextInChatReplies: settings.includeMemberContextInChatReplies ?? false,
    imessageOwnerName: settings.imessageOwnerName ?? 'League owner',
    imessageAutoSyncEnabled: settings.imessageAutoSyncEnabled ?? false,
    imessageSyncIntervalMinutes: settings.imessageSyncIntervalMinutes ?? 15,
    twilioConversationAutoSyncEnabled: settings.twilioConversationAutoSyncEnabled ?? false,
    twilioConversationSyncIntervalMinutes: settings.twilioConversationSyncIntervalMinutes ?? 15,
    chatRepliesEnabled: settings.chatRepliesEnabled ?? false,
    chatRepliesAutoSend: settings.chatRepliesAutoSend ?? false,
    chatAgentName: settings.chatAgentName ?? 'Sunday Sidekick',
    ...(settings.chatReplyLeagueId
      ? { chatReplyLeagueId: settings.chatReplyLeagueId }
      : leagues[0]
        ? { chatReplyLeagueId: leagues[0].id }
        : {}),
    mcpDeliveryEnabled: settings.mcpDeliveryEnabled ?? false,
    ...(settings.conversationRetentionDays === undefined
      ? {}
      : { conversationRetentionDays: settings.conversationRetentionDays }),
    newsRefreshMinutes: settings.newsRefreshMinutes ?? 15,
    newsSources: normalizeNewsSources(settings.newsSources),
    nflInjuryReportsEnabled: settings.nflInjuryReportsEnabled === true,
    leagueStaleAfterHours: settings.leagueStaleAfterHours ?? defaultLeagueStaleAfterHours,
    scheduledSyncRetries: settings.scheduledSyncRetries ?? 0,
  };
}

export function useSettingsForm(
  settings: AppSettings,
  leagues: LeagueConnection[],
  onSaved: (settings: AppSettings) => void,
) {
  const [form, setForm] = useState(() => normalizeSettingsForm(settings, leagues));
  const [saved, setSaved] = useState(form);
  const [conflict, setConflict] = useState<SettingsSection>();
  const dirtySections = (Object.keys(settingsSectionFields) as SettingsSection[]).filter(
    (key) =>
      JSON.stringify(settingsSectionPatch(form, key)) !==
      JSON.stringify(settingsSectionPatch(saved, key)),
  );
  function mergeSettings(incoming: AppSettings, selected: SettingsSection, only = false) {
    const normalized = normalizeSettingsForm(incoming, leagues);
    const apply = (current: AppSettings) => {
      const next = { ...current, sectionRevisions: { ...current.sectionRevisions } };
      for (const section of Object.keys(settingsSectionFields) as SettingsSection[]) {
        if (section !== selected && (only || dirtySections.includes(section))) continue;
        for (const field of settingsSectionFields[section]) {
          if (normalized[field] === undefined) delete next[field];
          else Object.assign(next, { [field]: normalized[field] });
        }
        next.sectionRevisions[section] = normalized.sectionRevisions?.[section] ?? 0;
      }
      return next;
    };
    setSaved(apply);
    setForm(apply);
  }
  async function persistSettings(section: SettingsSection) {
    if (
      section === 'schedules' &&
      form.actions.some(
        (action) => action.schedule.enabled && !isValidTimezone(action.schedule.timezone.trim()),
      )
    )
      throw new Error('Choose a valid timezone such as America/New_York or UTC.');
    try {
      const result = await requestJson(`/api/settings/${section}`, isAppSettings, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'If-Match': String(saved.sectionRevisions?.[section] ?? 0),
        },
        body: JSON.stringify(settingsSectionPatch(form, section)),
      });
      mergeSettings(result, section);
      onSaved(result);
      setConflict(undefined);
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'revision_conflict') setConflict(section);
      throw error;
    }
  }
  async function reloadSection(section: SettingsSection) {
    const result = await requestJson('/api/state?view=summary', isAppState);
    mergeSettings(result.settings, section, true);
    onSaved(result.settings);
    setConflict(undefined);
  }
  return {
    form,
    setForm,
    dirtySections,
    persistSettings,
    reloadSection,
    conflict,
    reset: (settings: AppSettings) => {
      const next = normalizeSettingsForm(settings, leagues);
      setForm(next);
      setSaved(next);
      setConflict(undefined);
    },
  };
}
