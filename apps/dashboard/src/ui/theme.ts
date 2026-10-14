import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const storageKey = 'sidekick.theme.v1';
const changeEvent = 'sidekick:theme';

function savedTheme(): Theme {
  try {
    const desktop = window.sidekickDesktop;
    if (desktop?.getTheme) return desktop.getTheme() === 'dark' ? 'dark' : 'light';
    return localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
}
export function initializeTheme() {
  applyTheme(savedTheme());
}
export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // Appearance still works for this session when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(changeEvent));
  void window.sidekickDesktop?.setTheme?.(theme).catch(() => {
    // The current session keeps its appearance even if saving the desktop file fails.
  });
}
const snapshot = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
function subscribe(listener: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    applyTheme(savedTheme());
    listener();
  };
  window.addEventListener(changeEvent, listener);
  window.addEventListener('storage', storageChanged);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener('storage', storageChanged);
  };
}
export function useTheme() {
  return useSyncExternalStore(subscribe, snapshot, (): Theme => 'light');
}
