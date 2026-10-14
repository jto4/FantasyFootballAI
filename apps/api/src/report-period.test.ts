import { describe, expect, it } from 'vitest';
import { dateMatchesReportSeason, reportNewsForSeason } from './report-period.js';

describe('report season alignment', () => {
  it('includes the NFL postseason across New Year and excludes later seasons, invalid dates and future headlines', () => {
    const now = new Date('2026-10-14T12:00:00Z');
    const item = { title: 'Public headline', url: 'https://example.test/news', source: 'ESPN' };
    const dates = [
      '2025-10-10T12:00:00Z',
      '2026-01-10T12:00:00Z',
      '2026-02-10T12:00:00Z',
      '2026-03-10T12:00:00Z',
      '2026-10-15T12:00:00Z',
      'invalid',
    ];
    const news = dates.map((publishedAt) => ({ ...item, publishedAt }));
    expect(reportNewsForSeason(news, 2025, now).map((row) => row.publishedAt)).toEqual(
      dates.slice(0, 3),
    );
    expect(reportNewsForSeason(news, 2018, now)).toEqual([]);
    expect(reportNewsForSeason(news, 2026, now).map((row) => row.publishedAt)).toEqual(
      dates.slice(1, 4),
    );
    expect(dateMatchesReportSeason(new Date('2026-01-10'), 2025)).toBe(true);
    expect(dateMatchesReportSeason(now, 2025)).toBe(false);
  });
});
