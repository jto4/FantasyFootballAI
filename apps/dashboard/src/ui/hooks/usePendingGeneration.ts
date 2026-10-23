import { useEffect, useState } from 'react';
import { isGenerationRequest, type GenerationRequest } from '@sidekick/core';

const key = 'sidekick.pendingGeneration';

/**
 * The report request still being generated, kept in browser storage so a reload reconnects to
 * the same server job instead of starting another.
 */
export function usePendingGeneration() {
  const [pending, setPending] = useState<GenerationRequest | null>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      return isGenerationRequest(value) ? value : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (pending) localStorage.setItem(key, JSON.stringify(pending));
      else localStorage.removeItem(key);
    } catch {
      /* The server still retains this job if browser storage is unavailable. */
    }
  }, [pending]);
  return [pending, setPending] as const;
}
