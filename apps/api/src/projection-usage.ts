import {
  ruledOutKeys,
  type FootballGame,
  type LineupStrategy,
  type UsageInput,
  type UserPreferences,
} from '@sidekick/core';
import type {
  NFLInjuryReportCache,
  PublicGameWeather,
  PublicUsageData,
} from '@sidekick/integrations';

/**
 * Snap counts, depth charts, the week's Out/Doubtful list and forecast wind for the projection
 * model. Each part is optional; projections still work without them. The merged object is reused
 * while its inputs are unchanged so the model's per-snapshot cache keeps hitting.
 */
export function projectionUsage(deps: {
  usage?: Pick<PublicUsageData, 'get'> | undefined;
  injuries?: Pick<NFLInjuryReportCache, 'get'> | undefined;
  weather?: Pick<PublicGameWeather, 'windFor'> | undefined;
}) {
  const empty: UsageInput = { snaps: new Map(), depth: new Map() };
  const merged = new WeakMap<object, { key: string; value: UsageInput }>();
  return async (season: number, games: FootballGame[] = []): Promise<UsageInput | undefined> => {
    const [usage, injury, wind] = await Promise.all([
      deps.usage?.get(season).catch(() => undefined),
      deps.injuries?.get(season).catch(() => undefined),
      deps.weather?.windFor(games).catch(() => undefined),
    ]);
    const hasInjuries = Boolean(injury?.rows.length);
    if (!hasInjuries && !wind?.size) return usage;
    const base = usage ?? empty;
    const key = `${season}:${injury?.retrievedAt ?? ''}:${[...(wind ?? [])].join(',')}`;
    const hit = merged.get(base);
    if (hit?.key === key) return hit.value;
    const value = {
      ...base,
      ...(hasInjuries ? { ruledOut: ruledOutKeys(injury!.rows) } : {}),
      ...(wind?.size ? { windKph: wind } : {}),
    };
    merged.set(base, { key, value });
    return value;
  };
}

/** The owner's lineup strategy as a plan option (balanced when unset). */
export function lineupStrategy(preferences: UserPreferences | undefined): {
  strategy?: LineupStrategy;
} {
  return preferences?.lineupStrategy ? { strategy: preferences.lineupStrategy } : {};
}
