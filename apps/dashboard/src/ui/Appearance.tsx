import { Moon } from 'lucide-react';
import { setTheme, useTheme } from './theme';

export function ThemeSwitch() {
  const theme = useTheme();
  return (
    <button
      type="button"
      role="switch"
      aria-label="Dark mode"
      aria-checked={theme === 'dark'}
      className="theme-switch"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <Moon size={16} aria-hidden="true" />
      <span>Dark mode</span>
    </button>
  );
}
