import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const openDialogs = new Set<symbol>();
let savedBodyStyle: { overflow: string; paddingRight: string } | undefined;

function lockBackgroundScroll() {
  const token = Symbol();
  if (!openDialogs.size) {
    savedBodyStyle = {
      overflow: document.body.style.overflow,
      paddingRight: document.body.style.paddingRight,
    };
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0)
      document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbarWidth}px`;
    document.body.style.overflow = 'hidden';
  }
  openDialogs.add(token);
  return () => {
    openDialogs.delete(token);
    // Dialog transitions can overlap; only the last close restores page scrolling.
    if (!openDialogs.size && savedBodyStyle) {
      document.body.style.overflow = savedBodyStyle.overflow;
      document.body.style.paddingRight = savedBodyStyle.paddingRight;
      savedBodyStyle = undefined;
    }
  };
}

export function Dialog({
  titleId,
  children,
  onClose,
  className = 'report-review-modal',
}: {
  titleId: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const unlockBackgroundScroll = lockBackgroundScroll();
    const previous = document.activeElement;
    const dialog = ref.current;
    const first = [
      ...(dialog?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary',
      ) ?? []),
    ].find((control) => control.getClientRects().length > 0);
    (first ?? dialog)?.focus();
    // Removing or disabling a focused control otherwise sends keyboard events to the page behind it.
    const observer = new MutationObserver(() => {
      if (
        lastFocused.current &&
        (!lastFocused.current.isConnected || lastFocused.current.matches(':disabled')) &&
        document.activeElement === document.body
      )
        dialog?.focus({ preventScroll: true });
    });
    if (dialog)
      observer.observe(dialog, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled'],
      });
    return () => {
      observer.disconnect();
      unlockBackgroundScroll();
      // Return focus only if it is still inside this dialog (or lost): a navigation that already
      // focused its destination keeps it.
      const active = document.activeElement;
      const lost = !active || active === document.body || Boolean(dialog?.contains(active));
      if (lost && previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  const content = (
    <div
      className="modal-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={className}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onFocusCapture={(event) => {
          if (event.target instanceof HTMLElement) lastFocused.current = event.target;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose();
            return;
          }
          if (event.key !== 'Tab') return;
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary',
            ),
          ].filter((control) => control.getClientRects().length > 0);
          const first = controls[0],
            last = controls.at(-1);
          if (!controls.length) {
            event.preventDefault();
            event.currentTarget.focus();
          } else if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === event.currentTarget)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last || document.activeElement === event.currentTarget)
          ) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        {children}
      </section>
    </div>
  );
  // Render above sticky navigation and save bars, even when opened from inside the header.
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
