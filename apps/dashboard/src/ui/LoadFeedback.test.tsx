import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EmptyStatus, LoadError, LoadingStatus } from './LoadFeedback.js';

describe('load feedback', () => {
  it('exposes loading, error with retry, and empty states accessibly', () => {
    const retry = vi.fn();
    const loading = renderToStaticMarkup(
      createElement(LoadingStatus, { message: 'Loading profiles…' }),
    );
    const failure = renderToStaticMarkup(
      createElement(LoadError, { message: 'Could not load profiles.', onRetry: retry }),
    );
    const empty = renderToStaticMarkup(
      createElement(EmptyStatus, { message: 'No profiles are saved.' }),
    );

    expect(loading).toContain('role="status"');
    expect(loading).toContain('Loading profiles');
    expect(failure).toContain('role="alert"');
    expect(failure).toContain('Could not load profiles.');
    expect(failure).toContain('Try again');
    expect(empty).toContain('No profiles are saved.');
  });
});
