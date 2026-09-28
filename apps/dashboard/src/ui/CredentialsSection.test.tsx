import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CredentialsSection } from './CredentialsSection.js';

const callbacks = {
  onSecretValueChange: vi.fn(),
  onSaveSecret: vi.fn(),
  onRemoveSecret: vi.fn(),
  onResendTestRecipientChange: vi.fn(),
  onTestTwilio: vi.fn(),
  onTestResend: vi.fn(),
  onImagePromptChange: vi.fn(),
  onCreateImage: vi.fn(),
  onRemoveImage: vi.fn(),
};

describe('credentials settings section', () => {
  it('shows setup status without exposing saved secrets and explains local image generation', () => {
    const markup = renderToStaticMarkup(
      createElement(CredentialsSection, {
        headingRef: createRef<HTMLHeadingElement>(),
        credentialStoreAvailable: true,
        secretState: [
          { provider: 'openai', configured: true },
          { provider: 'resend', configured: false },
        ],
        secretValues: {},
        credentialTestBusy: false,
        resendTestRecipient: '',
        imageGenerationConfigured: true,
        imagePrompt: '',
        generatedImage: '',
        imageGenerationBusy: false,
        localImages: [],
        ...callbacks,
      }),
    );

    expect(markup).toContain('AI API key');
    expect(markup).toContain('CONFIGURED');
    expect(markup).toContain('NOT SET');
    expect(markup).toContain('placeholder="Enter to replace"');
    expect(markup).toContain('Generate a league image');
    expect(markup).toContain('generation may incur API charges');
  });
});
