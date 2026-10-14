import { expect, it } from 'vitest';
import type { NewsItem } from './domain-types.js';
import type { AdviceAssessment, FootballDataSource, PlayerAdviceEvidence } from './advice-types.js';
import { buildAdvicePerception, enforceAdvicePerception } from './advice-perception.js';

const now = '2026-10-07T12:00:00Z';
const player: PlayerAdviceEvidence = {
  id: 'wr',
  name: 'A.J. Brown',
  position: 'WR',
  team: 'PHI',
  projectionSourceIds: [],
  historicalPoints: [],
  warnings: [],
  metrics: [
    {
      id: 'wr:market-adds',
      label: 'Sleeper activity',
      value: 12,
      unit: 'adds',
      sourceIds: ['market-add'],
    },
  ],
};
const sources: FootballDataSource[] = [
  { id: 'market-add', name: 'Sleeper activity', status: 'available', retrievedAt: now },
];
const story = (title: string, values: Partial<NewsItem> = {}): NewsItem => ({
  title,
  source: 'Fictional News',
  url: `https://example.test/${encodeURIComponent(title)}`,
  publishedAt: now,
  ...values,
});
const context = (items: NewsItem[], snapshot = {}) =>
  buildAdvicePerception(
    { items, stale: false, refreshedAt: now, ...snapshot },
    [player],
    ['PHI', 'BUF', 'LAR'],
    sources,
    now,
  );
const answer: AdviceAssessment = {
  verdict: 'lean',
  headline: 'Compare the evidence',
  recommendedPlayerIds: [],
  reasons: [],
  risks: [],
  alternative: { text: 'Wait.', metricIds: [], sourceIds: [] },
  perception: {
    tone: 'positive',
    text: 'Everyone loves the player.',
    metricIds: [],
    sourceIds: [],
  },
};

it('prioritizes whole normalized player names and records team-only relevance separately', () => {
  const result = context([
    story('Buffalo Bills quarterback returns to practice'),
    story('AJ Brown gets a larger role'),
    story('Los Angeles Rams announce a new coach'),
    story('Eagles defense improves'),
    story('A.J. Brownson is unrelated'),
    story('Congress votes on bills'),
  ]);
  expect(result.news).toHaveLength(4);
  expect(result.evidence.headlines[0]!.playerIds).toEqual(['wr']);
  expect(result.evidence.headlines[1]!.playerIds).toEqual([]);
  expect(result.evidence.headlines.some((item) => item.teamCodes.includes('LA'))).toBe(true);
  expect(result.metrics[0]).toMatchObject({ value: 4, unit: 'headlines' });
  expect(result.metrics[1]?.description).toContain('not independent samples');
});

it('excludes unrelated, future, old, invalid-date and unsafe URL stories', () => {
  const result = context([
    story('Kansas City Chiefs sign a receiver'),
    story('AJ Brown future story', { publishedAt: '2026-10-08' }),
    story('AJ Brown old story', { publishedAt: '2026-09-01' }),
    story('AJ Brown invalid date', { publishedAt: 'unknown' }),
    story('AJ Brown insecure link', { url: 'http://example.test/story' }),
    story('AJ Brown credential link', { url: 'https://user:password@example.test/story' }),
  ]);
  expect(result.news).toEqual([]);
  expect(result.warnings.join(' ')).toContain('Missing coverage is not neutral');
});

it('deduplicates tracked URLs and syndicated titles, retaining the newest version', () => {
  const result = context([
    story('AJ Brown role', {
      source: 'Old publisher',
      publishedAt: '2026-10-06',
      url: 'https://example.test/story?utm_source=one',
    }),
    story('AJ Brown role', { source: 'New publisher', url: 'https://other.test/copy' }),
    story('AJ Brown update', { url: 'https://example.test/update?utm_source=one' }),
    story('AJ Brown follow-up', { url: 'https://example.test/update?utm_source=two' }),
  ]);
  expect(result.news).toHaveLength(2);
  expect(result.news[0]?.source).toBe('New publisher');
  expect(result.metrics.find((metric) => metric.id === 'perception-publishers')?.value).toBe(2);
});

it('bounds headline selection and distinguishes publication time from feed retrieval time', () => {
  const result = context(
    Array.from({ length: 12 }, (_, i) =>
      story(`AJ Brown article ${i}`, { publishedAt: '2026-10-06T10:00:00Z' }),
    ),
  );
  expect(result.news).toHaveLength(8);
  expect(result.sources[0]?.retrievedAt).toBe(now);
  expect(result.evidence.headlines[0]?.publishedAt).toBe('2026-10-06T10:00:00Z');
  expect(result.metrics[0]?.value).toBe(8);
});

it('withholds unsupported media tone even when market activity or other cited numbers exist', () => {
  const result = context([]);
  const guarded = enforceAdvicePerception(
    {
      ...answer,
      perception: {
        ...answer.perception,
        metricIds: ['wr:market-adds'],
        sourceIds: ['market-add'],
      },
    },
    result.evidence,
    player.metrics,
  );
  expect(guarded.perception.tone).toBe('unknown');
  expect(guarded.perception.metricIds).toEqual(['wr:market-adds']);
  expect(guarded.perception.text).toContain('limited behavior proxies');
  expect(answer.perception.tone).toBe('positive');
  expect(
    enforceAdvicePerception(
      answer,
      context([story('AJ Brown optimistic practice report')]).evidence,
      [],
    ).perception.tone,
  ).toBe('unknown');
});

it('permits attributed current media interpretation but rejects stale/future/missing retrieval evidence', () => {
  const cited = { ...answer, perception: { ...answer.perception, sourceIds: ['news-0'] } };
  const fresh = context([story('AJ Brown returns to practice')]);
  expect(enforceAdvicePerception(cited, fresh.evidence, []).perception.tone).toBe('positive');
  for (const metadata of [
    { stale: true },
    { refreshedAt: '2026-10-06' },
    { refreshedAt: '2026-10-08' },
    { refreshedAt: 'invalid' },
  ]) {
    const stale = context([story('AJ Brown returns to practice')], metadata);
    expect(stale.evidence.feedStatus).toBe('stale');
    expect(stale.sources[0]?.status).toBe('unavailable');
    expect(enforceAdvicePerception(cited, stale.evidence, []).perception.tone).toBe('unknown');
  }
});

it('does not describe missing or stale platform sources as current matched activity', () => {
  for (const metadata of [
    [],
    [{ ...sources[0]!, retrievedAt: '2026-10-05' }],
    [{ ...sources[0]!, status: 'unavailable' as const }],
  ]) {
    const result = buildAdvicePerception(undefined, [player], [], metadata, now);
    expect(result.evidence.feedStatus).toBe('unavailable');
    expect(result.evidence.activityMetricIds).toEqual([]);
    expect(
      enforceAdvicePerception(answer, result.evidence, player.metrics).perception.metricIds,
    ).toEqual([]);
  }
});

it('discloses partial feed failures without promoting publisher names to independent samples', () => {
  const result = context([story('AJ Brown role update')], { error: 'private provider detail' });
  expect(result.evidence.feedStatus).toBe('current');
  expect(result.warnings.join(' ')).toContain('incomplete publisher coverage');
  expect(result.warnings.join(' ')).not.toContain('private provider detail');
});
