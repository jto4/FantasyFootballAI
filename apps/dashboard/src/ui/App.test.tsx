import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { App } from './App.js';

it('shows a loading state instead of presenting defaults as an empty league library', () => {
  const markup = renderToStaticMarkup(createElement(App));

  expect(markup).toContain('Loading your leagues, reports, and schedule');
  expect(markup).toContain('href="https://github.com/jto4/FantasyFootballAI/blob/main/README.md"');
  expect(markup).toContain('aria-label="Open settings"');
  expect(markup).not.toContain('No leagues connected yet.');
  expect(markup).not.toContain('Quiet in the locker room.');
});
