import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LocalBackupSection } from './LocalBackupSection.js';

describe('local backup settings section', () => {
  it('explains encrypted exports, restore formats, and local safety copies', () => {
    const markup = renderToStaticMarkup(
      createElement(LocalBackupSection, {
        onNotice: vi.fn(),
        onRestored: vi.fn(async () => undefined),
        onSettingsRestored: vi.fn(),
      }),
    );

    expect(markup).toContain('Local backup and restore');
    expect(markup).toContain('Backup passphrase');
    expect(markup).toContain('Restore backup');
    expect(markup).toContain('Older ZIP and SQLite backups remain supported');
    expect(markup).toContain('Provider secrets stay in the operating system credential manager.');
  });
});
