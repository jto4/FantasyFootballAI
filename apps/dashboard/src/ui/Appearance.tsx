import { Moon, Sun } from 'lucide-react';
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

export function AppearanceSettings() {
  const theme = useTheme();
  return (
    <fieldset className="appearance-settings">
      <legend>Appearance</legend>
      <p>Choose how the app looks on this device.</p>
      <div className="theme-options">
        <label>
          <input
            type="radio"
            name="appearance"
            value="light"
            checked={theme === 'light'}
            onChange={() => setTheme('light')}
          />
          <Sun size={17} aria-hidden="true" /> Light
        </label>
        <label>
          <input
            type="radio"
            name="appearance"
            value="dark"
            checked={theme === 'dark'}
            onChange={() => setTheme('dark')}
          />
          <Moon size={17} aria-hidden="true" /> Dark
        </label>
      </div>
    </fieldset>
  );
}
