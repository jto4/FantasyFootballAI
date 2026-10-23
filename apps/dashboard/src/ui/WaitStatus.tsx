import { useEffect, useState } from 'react';

/** Seconds since `since` (or since mount), ticking once a second while mounted. */
export function useElapsed(since?: string | number): number {
  const [start] = useState(() => Date.now());
  const origin =
    since === undefined ? start : typeof since === 'number' ? since : Date.parse(since);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return Number.isFinite(origin) ? Math.max(0, Math.floor((now - origin) / 1_000)) : 0;
}

export const formatElapsed = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * A long wait the reader can see moving: what is happening, how long it has taken, what is
 * normal, and a way out. The bar is indeterminate because the AI and data calls report no progress.
 */
export function WaitStatus({
  label,
  since,
  typical,
  slowAfterSeconds,
  onCancel,
  cancelLabel = 'Cancel',
  canceling = false,
}: {
  label: string;
  since?: string | number;
  /** For example "usually 20–60 seconds". */
  typical?: string;
  /** After this many seconds, say that it is slower than usual. */
  slowAfterSeconds?: number;
  onCancel?: () => void;
  cancelLabel?: string;
  canceling?: boolean;
}) {
  const elapsed = useElapsed(since);
  const slow = slowAfterSeconds !== undefined && elapsed >= slowAfterSeconds;
  return (
    <div className="wait-status" role="status" aria-live="polite">
      <div className="wait-status-text">
        <strong>{label}</strong>
        <span className="wait-status-time">
          {/* Announced once per state, not every second. */}
          <span aria-hidden="true">{formatElapsed(elapsed)}</span>
          {typical && !slow && <span> · {typical}</span>}
          {slow && <span> · Taking longer than usual; you can keep waiting or cancel.</span>}
        </span>
      </div>
      <span className="wait-status-bar" aria-hidden="true">
        <span />
      </span>
      {onCancel && (
        <button type="button" className="small-button" disabled={canceling} onClick={onCancel}>
          {canceling ? 'Canceling…' : cancelLabel}
        </button>
      )}
    </div>
  );
}
