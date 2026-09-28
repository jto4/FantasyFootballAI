import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AIRuntimeSection } from './AIRuntimeSection.js';

const baseProps = {
  headingRef: null,
  availableModels: ['gpt-test'],
  appleCliPlatform: false,
  apiKeyConfigured: false,
  busy: false,
  onChange: vi.fn(),
  onOpenCredentials: vi.fn(),
  onDiscoverModels: vi.fn(),
  onTestRuntime: vi.fn(),
};

describe('AI runtime section', () => {
  it('shows API controls and model suggestions only in API mode', () => {
    const markup = renderToStaticMarkup(
      createElement(AIRuntimeSection, {
        ...baseProps,
        runtime: {
          mode: 'api',
          model: 'gpt-test',
          command: '',
          args: '',
          baseUrl: 'https://api.example.test/v1',
        },
      }),
    );

    expect(markup).toContain('API BASE URL');
    expect(markup).toContain('Discover models');
    expect(markup).toContain('value="gpt-test"');
    expect(markup).toContain('An API key is required for API mode.');
    expect(markup).toContain('Manage API credentials');
    expect(markup).not.toContain('EXECUTABLE');
  });

  it('shows when API credentials are already saved in the operating-system store', () => {
    const markup = renderToStaticMarkup(
      createElement(AIRuntimeSection, {
        ...baseProps,
        apiKeyConfigured: true,
        runtime: {
          mode: 'api',
          model: 'gpt-test',
          command: '',
          args: '',
          baseUrl: 'https://api.example.test/v1',
        },
      }),
    );

    expect(markup).toContain('An API key is saved in the operating-system credential store.');
  });

  it('does not report a missing key when credential status could not be checked', () => {
    const markup = renderToStaticMarkup(
      createElement(AIRuntimeSection, {
        ...baseProps,
        apiKeyConfigured: null,
        runtime: {
          mode: 'api',
          model: 'gpt-test',
          command: '',
          args: '',
          baseUrl: 'https://api.example.test/v1',
        },
      }),
    );

    expect(markup).toContain('API credential status is unavailable.');
    expect(markup).not.toContain('An API key is required for API mode.');
  });

  it('shows direct executable controls in local CLI mode', () => {
    const markup = renderToStaticMarkup(
      createElement(AIRuntimeSection, {
        ...baseProps,
        runtime: {
          mode: 'cli',
          model: '',
          command: 'local-ai',
          args: '--quiet',
          baseUrl: 'https://api.example.test/v1',
        },
      }),
    );

    expect(markup).toContain('EXECUTABLE');
    expect(markup).toContain('ARGUMENTS');
    expect(markup).not.toContain('Discover models');
  });

  it('discloses Apple process arguments and disables the option off macOS', () => {
    const markup = renderToStaticMarkup(
      createElement(AIRuntimeSection, {
        ...baseProps,
        runtime: {
          mode: 'apple-cli',
          model: '',
          command: 'fm',
          args: '',
          baseUrl: 'https://api.example.test/v1',
        },
      }),
    );

    expect(markup).toContain('process arguments');
    expect(markup).toContain('Apple Foundation Models CLI (macOS 27+)');
    expect(markup).toContain('disabled=""');
  });
});
