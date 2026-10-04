import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WritingStyleSection } from './WritingStyleSection.js';

describe('writing style settings section', () => {
  it('renders customizable voice, length, profanity, and per-channel boundaries', () => {
    const markup = renderToStaticMarkup(
      createElement(WritingStyleSection, {
        headingRef: createRef<HTMLHeadingElement>(),
        writingStyle:
          'Wry, understated commentary with concise analysis. Let the stats make the joke.',
        customPresets: [],
        reportLength: 'long',
        allowProfanity: true,
        excludedTopics: 'Family and health',
        channelBoundaries: {
          dashboard: 'Keep it short',
          email: '',
          sms: 'No injury jokes',
          imessage: '',
        },
        onWritingStyleChange: vi.fn(),
        onSaveCustomPreset: vi.fn(),
        onDeleteCustomPreset: vi.fn(),
        onReportLengthChange: vi.fn(),
        onProfanityChange: vi.fn(),
        onExcludedTopicsChange: vi.fn(),
        onChannelBoundaryChange: vi.fn(),
      }),
    );

    expect(markup).toContain('Writing style');
    expect(markup).toContain('Dry analyst');
    expect(markup).toContain('Long · 450–650 words');
    expect(markup).toContain('Allow profanity');
    expect(markup).toContain('Family and health');
    expect(markup).toContain('DASHBOARD DRAFTS · EXTRA TOPICS TO AVOID');
    expect(markup).toContain('No injury jokes');
    expect(markup).toContain('Only the selected destination’s boundary is included');
    expect(markup).toContain('selected=""');
  });

  it('keeps arbitrary user writing styles editable as Custom', () => {
    const markup = renderToStaticMarkup(
      createElement(WritingStyleSection, {
        headingRef: createRef<HTMLHeadingElement>(),
        writingStyle: 'A completely custom style.',
        customPresets: [],
        reportLength: 'standard',
        allowProfanity: false,
        excludedTopics: '',
        channelBoundaries: { dashboard: '', email: '', sms: '', imessage: '' },
        onWritingStyleChange: vi.fn(),
        onSaveCustomPreset: vi.fn(),
        onDeleteCustomPreset: vi.fn(),
        onReportLengthChange: vi.fn(),
        onProfanityChange: vi.fn(),
        onExcludedTopicsChange: vi.fn(),
        onChannelBoundaryChange: vi.fn(),
      }),
    );

    expect(markup).toContain('value="custom" selected=""');
    expect(markup).toContain('>A completely custom style.</textarea>');
    expect(markup).toContain('value="standard" selected=""');
  });

  it('lists locally saved styles and exposes owner deletion controls', () => {
    const markup = renderToStaticMarkup(
      createElement(WritingStyleSection, {
        headingRef: createRef<HTMLHeadingElement>(),
        writingStyle: 'Custom playoff voice.',
        customPresets: [{ name: 'Playoff chaos', value: 'Custom playoff voice.' }],
        reportLength: 'standard',
        allowProfanity: false,
        excludedTopics: '',
        channelBoundaries: { dashboard: '', email: '', sms: '', imessage: '' },
        onWritingStyleChange: vi.fn(),
        onSaveCustomPreset: vi.fn(),
        onDeleteCustomPreset: vi.fn(),
        onReportLengthChange: vi.fn(),
        onProfanityChange: vi.fn(),
        onExcludedTopicsChange: vi.fn(),
        onChannelBoundaryChange: vi.fn(),
      }),
    );

    expect(markup).toContain('Playoff chaos · saved');
    expect(markup).toContain('aria-label="Delete saved style Playoff chaos"');
    expect(markup).toContain('Save style preset');
  });
});
