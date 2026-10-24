import { useSyncExternalStore } from 'react';

/** What the owner chose; `system` follows the operating system's light or dark appearance. */
export type ThemePreference = 'light' | 'dark' | 'system';
/** What is on screen. */
export type Theme = 'light' | 'dark';
const storageKey = 'sidekick.theme.v1';
const changeEvent = 'sidekick:theme';
const systemQuery = '(prefers-color-scheme: dark)';

function savedPreference(): ThemePreference {
  try {
    const desktop = window.sidekickDesktop;
    const saved = desktop?.getTheme ? desktop.getTheme() : localStorage.getItem(storageKey);
    return saved === 'dark' || saved === 'system' ? saved : 'light';
  } catch {
    return 'light';
  }
}
function resolve(preference: ThemePreference): Theme {
  if (preference !== 'system') return preference;
  return typeof window.matchMedia === 'function' && window.matchMedia(systemQuery).matches
    ? 'dark'
    : 'light';
}
function applyTheme(preference: ThemePreference) {
  const theme = resolve(preference);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
}
export function initializeTheme() {
  applyTheme(savedPreference());
  // Follow the system while "Match system" is chosen.
  if (typeof window.matchMedia === 'function')
    window.matchMedia(systemQuery).addEventListener?.('change', () => {
      if (document.documentElement.dataset.themePreference !== 'system') return;
      applyTheme('system');
      window.dispatchEvent(new Event(changeEvent));
    });
}
export function setTheme(preference: ThemePreference) {
  applyTheme(preference);
  try {
    localStorage.setItem(storageKey, preference);
  } catch {
    // Appearance still works for this session when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(changeEvent));
  void window.sidekickDesktop?.setTheme?.(preference).catch(() => {
    // The current session keeps its appearance even if saving the desktop file fails.
  });
}
const snapshot = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
const preferenceSnapshot = (): ThemePreference => {
  const value = document.documentElement.dataset.themePreference;
  return value === 'dark' || value === 'system' ? value : 'light';
};
function subscribe(listener: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    applyTheme(savedPreference());
    listener();
  };
  window.addEventListener(changeEvent, listener);
  window.addEventListener('storage', storageChanged);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener('storage', storageChanged);
  };
}
/** The theme on screen. */
export function useTheme() {
  return useSyncExternalStore(subscribe, snapshot, (): Theme => 'light');
}
/** The owner's choice, including "system". */
export function useThemePreference() {
  return useSyncExternalStore(subscribe, preferenceSnapshot, (): ThemePreference => 'light');
}
