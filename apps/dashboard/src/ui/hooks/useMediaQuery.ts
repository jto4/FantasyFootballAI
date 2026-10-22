import { useSyncExternalStore } from 'react';

/** Live result of a CSS media query; false where matchMedia is unavailable (server render, tests). */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = typeof window === 'undefined' ? undefined : window.matchMedia?.(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    () => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true,
    () => false,
  );
}
