import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DesktopSettingsSections } from './DesktopSettingsSections.js';

describe('desktop-only settings', () => {
  it('renders no desktop controls when the native bridge is unavailable', () => {
    const markup = renderToStaticMarkup(
      createElement(DesktopSettingsSections, {
        dataDirectoryHeadingRef: createRef<HTMLHeadingElement>(),
        onDataDirectoryLoaded: vi.fn(),
        onNotice: vi.fn(),
      }),
    );

    expect(markup).toBe('');
  });
});
