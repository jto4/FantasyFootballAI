import { useEffect, useRef } from 'react';
/** Poll only while visible, without overlapping slow requests or replacing local form state. */
export function useLiveDashboard(refresh: () => Promise<void>, enabled: boolean) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false,
      running = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (stopped || running) return;
      running = true;
      try {
        if (document.visibilityState !== 'hidden') await latest.current();
      } finally {
        running = false;
        if (!stopped) timer = setTimeout(() => void poll(), 3000);
      }
    }
    const resume = () => {
      if (!running) {
        clearTimeout(timer);
        void poll();
      }
    };
    timer = setTimeout(() => void poll(), 3000);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [enabled]);
}
