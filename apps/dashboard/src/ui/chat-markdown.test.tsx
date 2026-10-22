import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ChatMarkdown } from './ChatMarkdown';

it('renders headings, lists, bold and https links without injecting HTML', () => {
  const html = renderToStaticMarkup(
    <ChatMarkdown
      text={
        '## Verdict\n**Start Puka.**\n\n- One\n- Two\n1. First\n\n<img src=x onerror=alert(1)> [ESPN](https://espn.com) [bad](javascript:alert(1))'
      }
    />,
  );
  expect(html).toContain('<h4>Verdict</h4>');
  expect(html).toContain('<strong>Start Puka.</strong>');
  expect(html).toContain('<ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol>');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(html).toContain(
    '<a href="https://espn.com" target="_blank" rel="noreferrer noopener">ESPN</a>',
  );
  expect(html).not.toContain('href="javascript');
});
