import type { LocalStore } from './store.js';
import { isValidReportSchedule } from './scheduler.js';

type Settings = ReturnType<LocalStore['snapshot']>['settings'];

/** Validate persisted AI runtime settings before they can select a process or endpoint. */
export function isValidRuntime(value: unknown): value is NonNullable<Settings['aiRuntime']> {
  if (!value || typeof value !== 'object') return false;
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

/** Validate each scheduled action as an independent untrusted settings value. */
export function isValidAction(value: unknown): value is NonNullable<Settings['actions']>[number] {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  return (
    [
      'offseason-update',
      'draft-hype',
      'draft-review',
      'power-rankings',
      'matchup-preview',
    ].includes(String(action.kind)) &&
    ['dashboard', 'email', 'sms', 'imessage'].includes(String(action.channel)) &&
    typeof action.enabled === 'boolean' &&
    ['draft', 'automatic'].includes(String(action.mode)) &&
    (action.leagueIds === undefined ||
      (Array.isArray(action.leagueIds) &&
        action.leagueIds.length <= 100 &&
        new Set(action.leagueIds).size === action.leagueIds.length &&
        action.leagueIds.every(
          (leagueId) =>
            typeof leagueId === 'string' && leagueId.length > 0 && leagueId.length <= 200,
        ))) &&
    isValidReportSchedule(action.schedule)
  );
}
