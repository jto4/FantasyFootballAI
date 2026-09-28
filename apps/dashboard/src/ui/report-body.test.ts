import { describe, expect, it } from 'vitest';
import { reportBodyParts } from './report-body';

describe('reportBodyParts', () => {
  it('converts only exact allowlisted citation links into link parts', () => {
    const citation = { title: 'Injury update', url: 'https://example.com/injuries' };
    expect(
      reportBodyParts(
        `Check [${citation.title}](${citation.url}) and [made up](javascript:alert(1)).`,
        [citation],
      ),
    ).toEqual([
      { kind: 'text', value: 'Check ' },
      { kind: 'citation', ...citation },
      { kind: 'text', value: ' and [made up](javascript:alert(1)).' },
    ]);
  });

  it('keeps mismatched titles and bare URLs as ordinary text', () => {
    const citation = { title: 'Owner source', url: 'https://example.com/projections' };
    expect(
      reportBodyParts(`Use [another title](${citation.url}) or ${citation.url}.`, [citation]),
    ).toEqual([
      { kind: 'text', value: `Use [another title](${citation.url}) or ${citation.url}.` },
    ]);
  });

  it('preserves every occurrence and all surrounding prose', () => {
    const citation = { title: 'Story', url: 'https://example.com/story' };
    expect(
      reportBodyParts(
        `[${citation.title}](${citation.url}) then [${citation.title}](${citation.url})`,
        [citation],
      ),
    ).toEqual([
      { kind: 'citation', ...citation },
      { kind: 'text', value: ' then ' },
      { kind: 'citation', ...citation },
    ]);
  });
});
