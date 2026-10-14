import type { NewsItem } from '@sidekick/core';

/** An NFL season can continue into January/February of the following calendar year. */
export function dateMatchesReportSeason(date: Date, season: number | undefined): boolean {
  if (season === undefined) return true;
  return (
    date.getUTCFullYear() === season ||
    (date.getUTCFullYear() === season + 1 && date.getUTCMonth() <= 1)
  );
}

export function reportNewsForSeason(
  news: NewsItem[],
  season: number | undefined,
  now: Date,
): NewsItem[] {
  return news.filter((item) => {
    const published = new Date(item.publishedAt);
    return (
      Number.isFinite(published.getTime()) &&
      published.getTime() <= now.getTime() &&
      dateMatchesReportSeason(published, season)
    );
  });
}
