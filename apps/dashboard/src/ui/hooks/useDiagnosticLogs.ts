import { useState } from 'react';

export type DiagnosticLogEntry = {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  fields: Record<string, string | number>;
};
export type DiagnosticLogSnapshot = { available: boolean; entries: DiagnosticLogEntry[] };

export function useDiagnosticLogs() {
  const [logs, setLogs] = useState<DiagnosticLogSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/diagnostics/logs');
      const result = (await response.json()) as DiagnosticLogSnapshot & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not read local runtime logs.');
      setLogs(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read local runtime logs.');
    } finally {
      setBusy(false);
    }
  }
  return { logs, busy, error, refresh };
}
