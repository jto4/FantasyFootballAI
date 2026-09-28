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
  onTestEspn: vi.fn(),
  onTestResend: vi.fn(),
  imageProvider: 'openai' as const,
  onImageProviderChange: vi.fn(),
  imageProviderConfigured: true,
  onImagePromptChange: vi.fn(),
  onCreateImage: vi.fn(),
  onRefreshImages: vi.fn(),
  onRemoveImage: vi.fn(),
};

describe('credentials settings section', () => {
  it('shows setup status without exposing saved secrets and offers configured image providers', () => {
    const markup = renderToStaticMarkup(
      createElement(CredentialsSection, {
        headingRef: createRef<HTMLHeadingElement>(),
        credentialStoreAvailable: true,
        secretState: [
          { provider: 'openai', configured: true },
          { provider: 'espn', configured: true },
          { provider: 'resend', configured: false },
        ],
        secretValues: {},
        credentialTestBusy: false,
        espnTestAvailable: true,
        resendTestRecipient: '',
        imageGenerationConfigured: true,
        imagePrompt: '',
        generatedImage: '',
        imageGenerationBusy: false,
        localImages: [],
        imageLibraryLoading: true,
        imageLibraryError: '',
        ...callbacks,
      }),
    );

    expect(markup).toContain('AI API key');
    expect(markup).toContain('CONFIGURED');
    expect(markup).toContain('NOT SET');
    expect(markup).toContain('Test access');
    expect(markup).toContain('placeholder="Enter to replace"');
    expect(markup).toContain('Stability AI image generation key');
    expect(markup).toContain('id="image-generation-provider"');
    expect(markup).toContain('OpenAI · GPT Image');
    expect(markup).toContain('Stable Image Core');
    expect(markup).toContain('Generate a league image');
    expect(markup).toContain('generation may incur API charges');
    expect(markup).toContain('Loading saved images');
  });
});
