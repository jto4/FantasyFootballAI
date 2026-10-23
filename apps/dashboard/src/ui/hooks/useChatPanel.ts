import { useEffect, useState } from 'react';

/** Open state for the docked chat panel; ⌘/Ctrl+J toggles it from anywhere, even while typing. */
export function useChatPanel() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key === 'j'
      ) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  return [open, setOpen] as const;
}
