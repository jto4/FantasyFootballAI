import { useEffect, useState } from 'react';
import { Dialog } from './Dialog';

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` styles the confirm button for deletes and other losses. */
  tone?: 'default' | 'danger';
}
interface Request extends ConfirmOptions {
  message: string;
  resolve: (confirmed: boolean) => void;
}

let enqueue: ((request: Request) => void) | undefined;

/**
 * Asks in an in-app dialog instead of the browser's `window.confirm`, which shows the page origin,
 * can't be styled and blocks the whole window. Resolves false on Cancel, Escape or a click outside.
 * Falls back to `window.confirm` only if no ConfirmHost is mounted.
 */
export function confirmAction(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (!enqueue) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => enqueue!({ ...options, message, resolve }));
}

/** Discard-unsaved-changes wording shared by every guard. */
export const discardOptions: ConfirmOptions = {
  title: 'Discard unsaved changes?',
  confirmLabel: 'Discard changes',
  cancelLabel: 'Keep editing',
  tone: 'danger',
};

/** Mount once at the app root; shows queued confirmations one at a time. */
export function ConfirmHost() {
  const [queue, setQueue] = useState<Request[]>([]);
  useEffect(() => {
    enqueue = (request) => setQueue((current) => [...current, request]);
    return () => {
      enqueue = undefined;
    };
  }, []);
  const current = queue[0];
  if (!current) return null;
  const finish = (confirmed: boolean) => {
    current.resolve(confirmed);
    setQueue((rest) => rest.slice(1));
  };
  return (
    <Dialog titleId="confirm-dialog-title" onClose={() => finish(false)} className="confirm-dialog">
      <h2 id="confirm-dialog-title">{current.title ?? 'Are you sure?'}</h2>
      <p>{current.message}</p>
      <div className="confirm-dialog-actions">
        {/* Cancel comes first so it takes the initial focus: Enter never confirms by accident. */}
        <button type="button" className="small-button" onClick={() => finish(false)}>
          {current.cancelLabel ?? 'Cancel'}
        </button>
        <button
          type="button"
          className={current.tone === 'danger' ? 'primary-button danger-confirm' : 'primary-button'}
          onClick={() => finish(true)}
        >
          {current.confirmLabel ?? 'Continue'}
        </button>
      </div>
    </Dialog>
  );
}
