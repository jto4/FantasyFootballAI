import type { NewsSourceId, ReportLength, WritingStylePreset } from './domain-types.js';
export const espnSeasonBounds = { min: 2000, max: 2099 } as const;

export function isValidEspnSeason(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= espnSeasonBounds.min &&
    value <= espnSeasonBounds.max
  );
}
export const supportedNewsSources: Array<{ id: NewsSourceId; name: string }> = [
  { id: 'espn', name: 'ESPN NFL' },
  { id: 'pff', name: 'PFF football' },
  { id: 'fox', name: 'FOX Sports NFL' },
  { id: 'cbs', name: 'CBS Sports NFL' },
  { id: 'pft', name: 'Pro Football Talk' },
];
const supportedNewsSourceIds = new Set<NewsSourceId>(supportedNewsSources.map(({ id }) => id));
export const defaultNewsSources = ['espn'] as const satisfies readonly NewsSourceId[];

/** Keep reusable owner-authored voices bounded and unambiguous at persistence boundaries. */
export function isValidWritingStylePresets(value: unknown): value is WritingStylePreset[] {
  if (!Array.isArray(value) || value.length > 20) return false;
  const names = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const preset = item as Record<string, unknown>;
    if (
      typeof preset.name !== 'string' ||
      preset.name.trim().length === 0 ||
      preset.name.length > 40 ||
      /[\u0000-\u001f\u007f]/.test(preset.name) ||
      typeof preset.value !== 'string' ||
      preset.value.trim().length === 0 ||
      preset.value.length > 1000
    )
      return false;
    const normalizedName = preset.name.trim().toLowerCase();
    if (names.has(normalizedName)) return false;
    names.add(normalizedName);
  }
  return true;
}

export const reportLengthGuidance: Record<ReportLength, string> = {
  short: 'Keep the report to about 120–180 words. Prioritize the strongest league-specific point.',
  standard: 'Aim for about 250–400 words. Balance useful analysis with a few sharp jokes.',
  long: 'Aim for about 450–650 words. Add detail only when league data supports it; avoid padding.',
};
export function normalizeScoring(raw: Record<string, unknown> | undefined): Record<string, number> {
  if (!raw) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1]) &&
        entry[0].length > 0 &&
        entry[0].length <= 120 &&
        !/[\u0000-\u001f\u007f]/.test(entry[0]),
    ),
  );
}

/** Check an untrusted saved selection against the built-in feed allow-list. */
export function isValidNewsSources(input: unknown): input is NewsSourceId[] {
  return Array.isArray(input) && input.every((value) => supportedNewsSourceIds.has(value));
}

/** Normalize legacy values while keeping only supported feed identifiers. */
export function normalizeNewsSources(input: unknown): NewsSourceId[] {
  if (!Array.isArray(input)) return [...defaultNewsSources];
  return [
    ...new Set(input.filter((value): value is NewsSourceId => supportedNewsSourceIds.has(value))),
  ];
}

export {
  settingsSectionFields,
  settingsSectionPatch,
  isSettingsSection,
  type SettingsSection,
} from './settings-sections.js';

export { parseLeagueInput } from './league-input.js';

export { localDateTimeInstants } from './calendar-time.js';

export * from './workflow-contracts.js';

export * from './domain-types.js';
export * from './league-status.js';
export * from './schedules.js';
export * from './analysis.js';
