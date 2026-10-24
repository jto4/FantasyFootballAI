import { useEffect, useState, type MouseEvent } from 'react';
import { Dialog } from './Dialog';

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` styles the confirm button for deletes and other losses. */
  tone?: 'default' | 'danger';
}
interface Request extends ConfirmOptions {
  id: number;
  message: string;
  resolve: (confirmed: boolean) => void;
}
let nextId = 0;

let enqueue: ((request: Request) => void) | undefined;

/**
 * Asks in an in-app dialog instead of the browser's `window.confirm`, which shows the page origin,
 * can't be styled and blocks the whole window. Resolves false on Cancel, Escape or a click outside.
 * Falls back to `window.confirm` only if no ConfirmHost is mounted.
 */
export function confirmAction(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (!enqueue) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => enqueue!({ ...options, id: ++nextId, message, resolve }));
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
  // Removes this request by identity, so a double-click cannot also dismiss the next one.
  const finish = (confirmed: boolean) => {
    current.resolve(confirmed);
    setQueue((rest) => rest.filter((request) => request.id !== current.id));
  };
  // When one question follows another, the second click of a double-click lands on the new
  // dialog's buttons; only single clicks (and keyboard presses) answer a question.
  const click = (confirmed: boolean) => (event: MouseEvent) => {
    if (event.detail <= 1) finish(confirmed);
  };
  // ...and it must not move focus off Cancel either.
  const keepFocus = (event: MouseEvent) => {
    if (event.detail > 1) event.preventDefault();
  };
  return (
    // A new key per request remounts the dialog, so each one starts focused on Cancel.
    <Dialog
      key={current.id}
      titleId="confirm-dialog-title"
      onClose={() => finish(false)}
      className="confirm-dialog"
    >
      <h2 id="confirm-dialog-title">{current.title ?? 'Are you sure?'}</h2>
      <p>{current.message}</p>
      <div className="confirm-dialog-actions">
        {/* Cancel comes first so it takes the initial focus: Enter never confirms by accident. */}
        <button
          type="button"
          className="small-button"
          onClick={click(false)}
          onMouseDown={keepFocus}
        >
          {current.cancelLabel ?? 'Cancel'}
        </button>
        <button
          type="button"
          className={current.tone === 'danger' ? 'primary-button danger-confirm' : 'primary-button'}
          onClick={click(true)}
          onMouseDown={keepFocus}
        >
          {current.confirmLabel ?? 'Continue'}
        </button>
      </div>
    </Dialog>
  );
}
