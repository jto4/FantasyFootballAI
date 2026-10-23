import { ruledOutKeys, type UsageInput } from '@sidekick/core';
import type { NFLInjuryReportCache, PublicUsageData } from '@sidekick/integrations';

/**
 * Snap counts, depth charts and the week's Out/Doubtful list for the projection model. Each part
 * is optional; projections still work without them. The merged object is reused while its inputs
 * are unchanged so the model's per-snapshot cache keeps hitting.
 */
export function projectionUsage(deps: {
  usage?: Pick<PublicUsageData, 'get'> | undefined;
  injuries?: Pick<NFLInjuryReportCache, 'get'> | undefined;
}) {
  const empty: UsageInput = { snaps: new Map(), depth: new Map() };
  const merged = new WeakMap<object, { key: string; value: UsageInput }>();
  return async (season: number): Promise<UsageInput | undefined> => {
    const [usage, injury] = await Promise.all([
      deps.usage?.get(season).catch(() => undefined),
      deps.injuries?.get(season).catch(() => undefined),
    ]);
    if (!injury?.rows.length) return usage;
    const base = usage ?? empty;
    const key = `${season}:${injury.retrievedAt}`;
    const hit = merged.get(base);
    if (hit?.key === key) return hit.value;
    const value = { ...base, ruledOut: ruledOutKeys(injury.rows) };
    merged.set(base, { key, value });
    return value;
  };
}
