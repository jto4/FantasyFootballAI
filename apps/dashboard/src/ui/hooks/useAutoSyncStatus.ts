import { useEffect, useState } from 'react';

export type AutoSyncStatus = {
  enabled: boolean;
  intervalMinutes: number;
  lastCheckedAt?: string;
  lastAddedMessages?: number;
  lastError?: string;
};

/** Polls a chat auto-sync status endpoint every 30 seconds while sync is enabled. */
export function useAutoSyncStatus(enabled: boolean | undefined, url: string) {
  const [status, setStatus] = useState<AutoSyncStatus | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const refresh = () => {
      void fetch(url)
        .then((response) => (response.ok ? response.json() : null))
        .then((next: AutoSyncStatus | null) => {
          if (active && next) setStatus(next);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled, url]);
  return status;
}
