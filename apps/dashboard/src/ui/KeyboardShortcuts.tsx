import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Dialog';

/** Page shortcuts: ⌘/Ctrl+1–5 (desktop app) and "g" then a letter (any browser). */
export const pageShortcuts = [
  { key: 'h', digit: '1', section: 'League desk', label: 'Home' },
  { key: 'a', digit: '2', section: 'Advice', label: 'Advice' },
  { key: 'r', digit: '3', section: 'Reports', label: 'Reports' },
  { key: 's', digit: '4', section: 'Schedule', label: 'Schedule' },
  { key: ',', digit: '5', section: 'Settings', label: 'Settings' },
] as const;

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function useKeyboardShortcuts({
  onNavigate,
  onNewReport,
}: {
  onNavigate: (section: string) => void;
  onNewReport: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef(0);
  const latest = useRef({ onNavigate, onNewReport });
  latest.current = { onNavigate, onNewReport };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      // Never steal keys from fields, open dialogs, or OS/browser shortcuts we don't own.
      if (event.defaultPrevented || event.repeat || typing(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && !event.altKey && !event.shiftKey) {
        const page = pageShortcuts.find((item) => item.digit === event.key);
        if (page) {
          event.preventDefault();
          latest.current.onNavigate(page.section);
        }
        return;
      }
      if (event.altKey || modifier) return;
      if (Date.now() - pendingG.current < 1500) {
        pendingG.current = 0;
        const page = pageShortcuts.find((item) => item.key === event.key.toLowerCase());
        if (page) {
          event.preventDefault();
          latest.current.onNavigate(page.section);
        }
        return;
      }
      if (event.key === 'g') pendingG.current = Date.now();
      else if (event.key === 'n') {
        event.preventDefault();
        latest.current.onNewReport();
      } else if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  return { helpOpen, openHelp: () => setHelpOpen(true), closeHelp: () => setHelpOpen(false) };
}

export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  return (
    <Dialog titleId="shortcuts-title" onClose={onClose} className="connect-modal shortcuts-modal">
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close shortcuts">
        ×
      </button>
      <h2 id="shortcuts-title">Keyboard shortcuts</h2>
      <table className="shortcuts-table">
        <tbody>
          {pageShortcuts.map((item) => (
            <tr key={item.section}>
              <th scope="row">{item.label}</th>
              <td>
                <kbd>{mac ? '⌘' : 'Ctrl'}</kbd> <kbd>{item.digit}</kbd> or <kbd>g</kbd>{' '}
                <kbd>{item.key}</kbd>
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">Search</th>
            <td>
              <kbd>{mac ? '⌘' : 'Ctrl'}</kbd> <kbd>K</kbd>
            </td>
          </tr>
          <tr>
            <th scope="row">New report</th>
            <td>
              <kbd>n</kbd>
            </td>
          </tr>
          <tr>
            <th scope="row">This list</th>
            <td>
              <kbd>?</kbd>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="modal-hint">Shortcuts pause while you type in a field or a window is open.</p>
    </Dialog>
  );
}
