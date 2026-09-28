import { describe, expect, it } from 'vitest';
import { citedNews } from './news-citations.js';

const stories = Array.from({ length: 6 }, (_, index) => ({
  title: `Story ${index + 1}`,
  source: 'ESPN',
  url: `https://example.test/story-${index + 1}`,
  publishedAt: '2026-09-20T12:00:00.000Z',
}));

describe('report news citations', () => {
  it('includes only allowed stories whose exact URL appears in the report', () => {
    const report = `The update links [${stories[1]!.title}](${stories[1]!.url}) and an invented [story](https://example.test/fake).`;
    expect(citedNews(report, stories)).toEqual([
      { title: 'Story 2', url: 'https://example.test/story-2' },
    ]);
  });

  it('requires a complete exact markdown link and limits citations to the first five stories', () => {
    expect(citedNews(stories[5]!.url, stories)).toEqual([]);
    expect(citedNews(`[Wrong title](${stories[0]!.url})`, stories)).toEqual([]);
    expect(citedNews(`[${stories[5]!.title}](${stories[5]!.url})`, stories)).toEqual([]);
  });

  it('adds an owner-imported projection source only when its exact URL is cited', () => {
    const source = { title: 'Imported projections', url: 'https://example.test/projections' };
    expect(citedNews(`[${source.title}](${source.url})`, [], [source])).toEqual([source]);
    expect(citedNews(`Draft values mention ${source.url}`, [], [source])).toEqual([]);
    expect(citedNews('Draft values are discussed without a source link.', [], [source])).toEqual(
      [],
    );
  });
});
