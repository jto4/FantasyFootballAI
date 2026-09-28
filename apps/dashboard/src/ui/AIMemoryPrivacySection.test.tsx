import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AIMemoryPrivacySection } from './AIMemoryPrivacySection.js';

const callbacks = {
  onMemoryEnabledChange: vi.fn(),
  onAnalyzeImportsChange: vi.fn(),
  onIncludeMemberContextChange: vi.fn(),
  onIncludeMemberContextInChatRepliesChange: vi.fn(),
  onRetentionChange: vi.fn(),
};

describe('AI memory privacy section', () => {
  it('disables AI-sharing controls when member memory is paused', () => {
    const markup = renderToStaticMarkup(
      createElement(AIMemoryPrivacySection, {
        memoryEnabled: false,
        analyzeImportsWithAI: true,
        includeMemberContextInReports: true,
        includeMemberContextInChatReplies: true,
        conversationRetentionDays: 90,
        ...callbacks,
      }),
    );

    expect(markup).toContain('AI privacy');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('value="90" selected=""');
    expect(markup).toContain('The full untruncated export remains local.');
  });

  it('discloses report prompt sharing and the no-expiration option', () => {
    const markup = renderToStaticMarkup(
      createElement(AIMemoryPrivacySection, {
        memoryEnabled: true,
        analyzeImportsWithAI: false,
        includeMemberContextInReports: false,
        includeMemberContextInChatReplies: false,
        ...callbacks,
      }),
    );

    expect(markup).toContain('Include member notes in generated reports');
    expect(markup).toContain('included with report prompts sent to the configured AI runtime');
    expect(markup).toContain('Include member notes in group-chat reply prompts');
    expect(markup).toContain('This is a separate opt-in from report sharing.');
    expect(markup).toContain('Keep until I delete it');
    expect(markup).toContain('value="never" selected=""');
  });
});
