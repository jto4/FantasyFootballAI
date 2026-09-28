import type { NewsItem } from '@sidekick/core';

/** Keep report citations limited to allow-listed stories linked in the generated text. */
export function citedNews(
  body: string,
  items: NewsItem[],
  additionalSources: Array<{ title: string; url: string }> = [],
) {
  const hasExactMarkdownLink = (source: { title: string; url: string }) =>
    body.includes(`[${source.title}](${source.url})`);
  return [
    ...items
      .slice(0, 5)
      .filter(hasExactMarkdownLink)
      .map(({ title, url }) => ({ title, url })),
    ...additionalSources.filter(hasExactMarkdownLink),
  ];
}
