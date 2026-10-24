import { useSyncExternalStore } from 'react';

/**
 * Display choices for this device: how big and dense the app is, motion, which page opens first,
 * and how odds and times are written. Kept in local storage (not settings) because they describe
 * the screen, not the league; applied to <html> before paint by public/theme-init.js.
 */
export interface DisplayPreferences {
  textSize: 'small' | 'default' | 'large' | 'larger';
  density: 'comfortable' | 'compact';
  motion: 'system' | 'reduced';
  startPage: 'League desk' | 'Advice' | 'Live' | 'Ask' | 'Reports';
  oddsFormat: 'american' | 'decimal' | 'implied';
  clock: 'system' | '12h' | '24h';
}
export const defaultDisplay: DisplayPreferences = {
  textSize: 'default',
  density: 'comfortable',
  motion: 'system',
  startPage: 'League desk',
  oddsFormat: 'american',
  clock: 'system',
};
const storageKey = 'sidekick.display.v1';
const changeEvent = 'sidekick:display';
const choices: { [K in keyof DisplayPreferences]: readonly DisplayPreferences[K][] } = {
  textSize: ['small', 'default', 'large', 'larger'],
  density: ['comfortable', 'compact'],
  motion: ['system', 'reduced'],
  startPage: ['League desk', 'Advice', 'Live', 'Ask', 'Reports'],
  oddsFormat: ['american', 'decimal', 'implied'],
  clock: ['system', '12h', '24h'],
};

let cached: DisplayPreferences | undefined;
export function getDisplayPreferences(): DisplayPreferences {
  if (cached) return cached;
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') ?? {};
  } catch {
    saved = {};
  }
  const value = { ...defaultDisplay };
  for (const key of Object.keys(choices) as (keyof DisplayPreferences)[])
    if ((choices[key] as readonly unknown[]).includes(saved[key]))
      (value as Record<string, unknown>)[key] = saved[key];
  cached = value;
  return value;
}
function apply(value: DisplayPreferences) {
  const root = document.documentElement.dataset;
  if (value.textSize === 'default') delete root.textSize;
  else root.textSize = value.textSize;
  if (value.density === 'compact') root.density = 'compact';
  else delete root.density;
  if (value.motion === 'reduced') root.motion = 'reduced';
  else delete root.motion;
}
export function initializeDisplay() {
  apply(getDisplayPreferences());
}
export function setDisplayPreference<K extends keyof DisplayPreferences>(
  key: K,
  value: DisplayPreferences[K],
) {
  cached = { ...getDisplayPreferences(), [key]: value };
  apply(cached);
  try {
    localStorage.setItem(storageKey, JSON.stringify(cached));
  } catch {
    // The choice still applies for this session when storage is unavailable.
  }
  window.dispatchEvent(new Event(changeEvent));
}
function subscribe(listener: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    cached = undefined;
    apply(getDisplayPreferences());
    listener();
  };
  window.addEventListener(changeEvent, listener);
  window.addEventListener('storage', storageChanged);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener('storage', storageChanged);
  };
}
export function useDisplayPreferences(): DisplayPreferences {
  return useSyncExternalStore(subscribe, getDisplayPreferences, () => defaultDisplay);
}

/** American odds written the owner's way: +120, 2.20 or 45.5%. */
export function formatOdds(
  american: number,
  format: DisplayPreferences['oddsFormat'] = getDisplayPreferences().oddsFormat,
): string {
  if (!Number.isFinite(american) || american === 0) return '—';
  if (format === 'decimal')
    return (american > 0 ? 1 + american / 100 : 1 + 100 / -american).toFixed(2);
  if (format === 'implied')
    return `${((american > 0 ? 100 / (american + 100) : -american / (-american + 100)) * 100).toFixed(1)}%`;
  return american > 0 ? `+${american}` : String(american);
}

/** Intl hour-cycle option for the owner's clock choice. */
export function hourCycleOption(): { hour12?: boolean } {
  const clock = getDisplayPreferences().clock;
  return clock === 'system' ? {} : { hour12: clock === '12h' };
}
